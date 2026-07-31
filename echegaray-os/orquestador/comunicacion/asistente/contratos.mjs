// CONTRATOS COMPARTIDOS del asistente conversacional.
//
// Un solo archivo define las formas que cruzan de una pieza a otra: lo que devuelve la
// interpretación, lo que declara una capacidad, lo que devuelve una ejecución, cómo se
// nombra un error. Todo lo demás (Drive, recordatorios, Calendar, Tasks) se construyó en
// paralelo contra ESTE archivo, que es la razón por la que las piezas encajan.
//
// Zod y no JSDoc suelto porque la salida del modelo se VALIDA: un intérprete que devuelve
// `{fecha: "el jueves"}` tiene que fallar acá, no tres capas más abajo cuando la API de
// Google devuelve 400. Y las capacidades declaran su `entrada` como schema Zod, así el
// registro puede validar sin conocer ninguna capacidad en particular.

import { z } from 'zod'

/** Zona horaria de la empresa. Toda hora que el usuario dice o lee está en esta zona. */
export const TZ_EMPRESA = 'America/Argentina/San_Juan'

// ── Capacidades declaradas ───────────────────────────────────────────────────
// El id es estable y viaja a la auditoría, a la tabla de ejecuciones y a los logs.

export const CAPACIDAD = Object.freeze({
  DRIVE_BUSCAR: 'drive.buscar',
  RECORDATORIO_CREAR: 'recordatorio.crear',
  RECORDATORIO_LISTAR: 'recordatorio.listar',
  RECORDATORIO_CANCELAR: 'recordatorio.cancelar',
  CALENDAR_EVENTO_CREAR: 'calendar.evento.crear',
  TASKS_TAREA_CREAR: 'tasks.tarea.crear',
  AYUDA: 'ayuda',
})

/** Intenciones que el intérprete puede devolver. `desconocido` es una respuesta legítima:
 *  es lo que impide que el asistente elija una capacidad "más o menos parecida". */
export const INTENCION = Object.freeze({ ...CAPACIDAD, DESCONOCIDO: 'desconocido' })

export const zIntencion = z.enum([
  CAPACIDAD.DRIVE_BUSCAR,
  CAPACIDAD.RECORDATORIO_CREAR,
  CAPACIDAD.RECORDATORIO_LISTAR,
  CAPACIDAD.RECORDATORIO_CANCELAR,
  CAPACIDAD.CALENDAR_EVENTO_CREAR,
  CAPACIDAD.TASKS_TAREA_CREAR,
  CAPACIDAD.AYUDA,
  INTENCION.DESCONOCIDO,
])

// ── Errores ──────────────────────────────────────────────────────────────────
// La clasificación existe para dos cosas distintas: decidir si se reintenta y decidir qué
// se le dice a la persona. El detalle técnico NUNCA va al chat.

export const ERROR = Object.freeze({
  INTERPRETACION: 'interpretacion_fallida',
  DATO_FALTANTE: 'dato_faltante',
  USUARIO_INEXISTENTE: 'usuario_inexistente',
  PERMISO_DENEGADO: 'permiso_denegado',
  GOOGLE_SIN_ACCESO: 'google_sin_acceso',
  NO_ENCONTRADO: 'no_encontrado',
  TEMPORAL: 'error_temporal',
  DEFINITIVO: 'error_definitivo',
  DUPLICADO: 'duplicado',
  ENTREGA_MATTERMOST: 'fallo_entrega_mattermost',
  CAPACIDAD_DESHABILITADA: 'capacidad_deshabilitada',
})

/** ¿Vale la pena reintentar este error? Sólo lo temporal y el fallo de entrega. */
export const esReintentable = (codigo) => codigo === ERROR.TEMPORAL || codigo === ERROR.ENTREGA_MATTERMOST

export const zError = z.object({
  codigo: z.string(),
  mensaje: z.string(),          // el que ve la persona — sin stack, sin ids técnicos
  detalle: z.string().optional(),// el que va al log/auditoría
  reintentable: z.boolean().default(false),
})

/** Arma un AssistantError coherente (mensaje al humano + detalle al log). */
export function errorAsistente(codigo, mensaje, detalle) {
  return { codigo, mensaje, ...(detalle ? { detalle: String(detalle).slice(0, 500) } : {}), reintentable: esReintentable(codigo) }
}

// ── Identidad ────────────────────────────────────────────────────────────────

export const zIdentidad = z.object({
  plataforma: z.string().default('mattermost'),
  plataformaUserId: z.string(),
  plataformaUsername: z.string().nullable().optional(),
  nombreVisible: z.string(),
  alias: z.array(z.string()).default([]),
  email: z.string().nullable().optional(),
  zonaHoraria: z.string().default(TZ_EMPRESA),
  activo: z.boolean().default(true),
})

// ── Tiempo ───────────────────────────────────────────────────────────────────
// `cuando` es SIEMPRE un instante absoluto en ISO-8601 con offset, ya resuelto contra la
// zona de la empresa. Ninguna capa aguas abajo vuelve a interpretar "mañana": si el
// intérprete no pudo resolverlo, `cuando` es null y falta un dato.

// Los milisegundos van incluidos porque `Date#toISOString()` los pone SIEMPRE: sin ellos,
// cualquier instante calculado con `computeNextRun` y pasado por el contrato explotaba con
// un ZodError a tres capas de distancia de donde estaba el error. Lo destapó la primera
// capacidad que calculó una recurrencia.
const ISO_INSTANTE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?([+-]\d{2}:\d{2}|Z)$/

export const zInstante = z.string().regex(ISO_INSTANTE, 'instante ISO-8601 con offset')

/** Cadencia en el formato de orq.schedules (computeNextRun). null = una sola vez. */
export const zCadencia = z.string().regex(
  /^(daily:\d{2}:\d{2}|weekly:(dom|lun|mar|mie|jue|vie|sab):\d{2}:\d{2}|monthly:\d{1,2}:\d{2}:\d{2})$/,
  'cadencia daily|weekly|monthly',
)

// ── Interpretación ───────────────────────────────────────────────────────────

/** Lo que devuelve el intérprete. `via` dice si costó API o no: es la métrica que gobierna
 *  el costo del asistente y por eso viaja en el contrato, no en un log suelto. */
export const zSolicitud = z.object({
  intencion: zIntencion,
  via: z.enum(['deterministico', 'modelo', 'aclaracion']),
  confianza: z.number().min(0).max(1).default(1),
  parametros: z.record(z.unknown()).default({}),
  // Lo que el intérprete NO pudo resolver. Si tiene algo, la capacidad no se ejecuta:
  // se pregunta. Una sola vez.
  faltantes: z.array(z.string()).default([]),
  ambiguedad: z.string().nullable().default(null),
  // Las lecturas posibles cuando la ambigüedad es de FECHA ("el jueves que viene" dicho un
  // lunes). Viajan en el contrato y no colgadas del objeto porque son la materia prima de la
  // pregunta que hace el router: fuera del schema, un `parse()` las tiraba en silencio.
  opcionesTiempo: z.array(z.object({ valor: z.string(), etiqueta: z.string() })).default([]),
})

/** Parámetros comunes a lo que se agenda/recuerda/anota. Cada capacidad extiende lo suyo. */
export const zParametrosTiempo = z.object({
  cuando: zInstante.nullable().default(null),
  cadencia: zCadencia.nullable().default(null),
  zonaHoraria: z.string().default(TZ_EMPRESA),
})

// ── Capacidad ────────────────────────────────────────────────────────────────

/**
 * Definición de una capacidad del asistente. El registro no conoce ninguna en particular:
 * las descubre y las valida contra esta forma.
 *
 * `habilitada` es una FUNCIÓN y no un booleano a propósito: una capacidad que depende de
 * Google está habilitada sólo si esa cuenta está conectada. Así la ayuda dinámica no puede
 * ofrecer algo que va a fallar, que es la forma más común de mentirle al usuario.
 *
 * FIRMAS, fijadas acá porque Zod sólo puede decir "es una función" y el router las invoca a
 * todas igual. Que cada capacidad eligiera su forma se habría notado recién al cablear:
 *   habilitada(ctx)          -> Promise<boolean> | boolean
 *   ejecutar(parametros, ctx) -> Promise<zResultado>
 * `orden` gobierna en qué orden aparecen en la ayuda (menor primero); no es alfabético.
 */
export const zCapacidad = z.object({
  id: z.string(),
  nombre: z.string(),
  descripcion: z.string(),          // en primera persona, es lo que lee el usuario en la ayuda
  version: z.string(),
  permisos: z.array(z.string()).default([]),
  ejemplos: z.array(z.string()).default([]),
  orden: z.number().int().default(100),
  // Efecto externo (Google) ⇒ pasa por la barrera de idempotencia de ejecuciones.
  efectoExterno: z.boolean().default(false),
  habilitada: z.function().optional(),
  ejecutar: z.function(),
  entrada: z.unknown(),             // schema Zod de sus parámetros
})

/** Resultado de ejecutar una capacidad. `texto` es lo ÚNICO que ve la persona. */
export const zResultado = z.object({
  ok: z.boolean(),
  capacidad: z.string(),
  texto: z.string(),
  // Evidencia del efecto real (id del evento, enlace del archivo, id del recordatorio).
  // Es lo que permite decir "listo" sin mentir: si esto viene vacío, no se ejecutó nada.
  evidencia: z.record(z.unknown()).nullable().default(null),
  error: zError.nullable().default(null),
  // Pregunta al usuario en vez de resultado. Excluyente con `evidencia`.
  aclaracion: z.object({
    pregunta: z.string(),
    opciones: z.array(z.object({ valor: z.string(), etiqueta: z.string() })).default([]),
    parcial: z.record(z.unknown()).default({}),
  }).nullable().default(null),
})

/** Resultado OK con evidencia. Un `ok:true` sin evidencia es un bug, no un éxito. */
/**
 * @param {object} [seguimiento] Lo que esta respuesta deja abierto: `{parcial, opciones}`, con
 *   la misma forma que una aclaración. Existe porque una respuesta también puede esperar
 *   respuesta — "te paso este archivo" admite un "no era ese" —, y sin dejar constancia el
 *   mensaje siguiente se interpreta desde cero y esa corrección se pierde. Opcional: una
 *   capacidad que no lo usa se comporta igual que antes.
 */
export function resultadoOk(capacidad, texto, evidencia, seguimiento = null) {
  return {
    ok: true, capacidad, texto, evidencia: evidencia ?? {}, error: null, aclaracion: null,
    seguimiento: seguimiento ?? null,
  }
}
export function resultadoError(capacidad, err) {
  return { ok: false, capacidad, texto: err.mensaje, evidencia: null, error: err, aclaracion: null }
}
export function resultadoAclaracion(capacidad, pregunta, opciones = [], parcial = {}) {
  return { ok: false, capacidad, texto: pregunta, evidencia: null, error: null, aclaracion: { pregunta, opciones, parcial } }
}

// ── Drive ────────────────────────────────────────────────────────────────────

export const zDriveBuscar = z.object({
  terminos: z.string().min(1),
  tipo: z.enum(['cualquiera', 'planilla', 'documento', 'pdf', 'carpeta']).default('cualquiera'),
  // El id que la persona ELIGIÓ de la lista que se le ofreció. Llega sólo en la segunda
  // vuelta, cuando contesta "el segundo": es el momento en que se sabe con certeza cuál era,
  // y por eso es también lo único que el buscador toma como aprendizaje.
  archivoId: z.string().min(1).optional(),
  // Lo que la persona dijo SOBRE el resultado anterior: "correcto", "no era ese", "por qué".
  // Es la otra mitad del aprendizaje — sin esto, una corrección gratis se perdía entera.
  feedback: z.enum(['confirma', 'rechaza', 'explica', 'cierre']).optional(),
  // La búsqueda a la que se refiere ese feedback, para no adivinar cuál era.
  eventoId: z.union([z.number(), z.string()]).optional(),
})

export const zDriveArchivo = z.object({
  id: z.string(),
  nombre: z.string(),
  tipo: z.string(),
  ubicacion: z.string().nullable().default(null),
  modificado: z.string().nullable().default(null),
  enlace: z.string(),
})

// ── Recordatorio interno ─────────────────────────────────────────────────────

export const ESTADO_RECORDATORIO = Object.freeze({
  ACTIVO: 'active', ENTREGADO: 'delivered', COMPLETADO: 'completed',
  CANCELADO: 'cancelled', FALLIDO: 'failed',
})

export const zRecordatorioCrear = zParametrosTiempo.extend({
  // `.trim()` antes del `.min(1)`: sin eso, "   " es un contenido válido y el OS te entrega
  // a las 8 de la mañana un recordatorio en blanco.
  contenido: z.string().trim().min(1),
  destinatario: z.string().nullable().default(null), // texto como lo dijo la persona
  destinatarioUserId: z.string().nullable().default(null), // ya resuelto a identidad real
})

export const zRecordatorio = z.object({
  id: z.string(),
  creadorUserId: z.string(),
  creadorDisplay: z.string().nullable().default(null),
  destinatarioUserId: z.string(),
  destinatarioDisplay: z.string().nullable().default(null),
  contenido: z.string(),
  cadencia: z.string().nullable().default(null),
  zonaHoraria: z.string().default(TZ_EMPRESA),
  proximaEjecucion: z.string(),
  estado: z.enum(['active', 'delivered', 'completed', 'cancelled', 'failed']),
})

// ── Google Calendar ──────────────────────────────────────────────────────────

export const zCalendarEvento = z.object({
  titulo: z.string().min(1),
  inicio: zInstante,
  fin: zInstante.nullable().default(null),
  duracionMin: z.number().int().positive().nullable().default(null),
  descripcion: z.string().nullable().default(null),
  participantes: z.array(z.string()).default([]),   // emails ya resueltos
})

export const zCalendarResultado = z.object({
  id: z.string(),
  enlace: z.string().nullable().default(null),
  titulo: z.string(),
  inicio: z.string(),
  fin: z.string(),
})

// ── Google Tasks ─────────────────────────────────────────────────────────────

export const zGoogleTarea = z.object({
  titulo: z.string().min(1),
  notas: z.string().nullable().default(null),
  vence: zInstante.nullable().default(null),
  lista: z.string().default('@default'),
})

export const zGoogleTareaResultado = z.object({
  id: z.string(),
  titulo: z.string(),
  vence: z.string().nullable().default(null),
  enlace: z.string().nullable().default(null),
})

// ── Contexto de ejecución ────────────────────────────────────────────────────
// Lo que toda capacidad recibe. Se declara acá para que ninguna capacidad invente su propia
// forma de acceder a la base, a Google o a la identidad de quien pide.

/**
 * @typedef {object} ContextoAsistente
 * @property {{query:Function, withTx:Function}} port      pool del OS
 * @property {object|null} google                          cliente Google del usuario (o null)
 * @property {import('zod').infer<typeof zIdentidad>} identidad  quién pide
 * @property {string|null} commEventId                     mensaje que originó el pedido
 * @property {string|null} correlationId
 * @property {string|null} channelId
 * @property {string|null} rootPostId
 * @property {object} [recordatorios]                     repositorio de recordatorios (inyectable)
 * @property {object} [googleDeps]                        puerta de inyección de `habilitada`
 * @property {object} [log]
 * @property {() => Date} [ahora]  RELOJ (se invoca): `ctx.ahora?.() ?? new Date()`.
 *   Ojo con la trampa: `tiempo.mjs` recibe `{ahora: Date}` — una FECHA, no el reloj. Quien
 *   cruza las dos capas traduce (`{ahora: ctx.ahora?.() ?? new Date()}`); pasar el reloj
 *   crudo revienta con "fecha.getTime is not a function", que ya pasó una vez.
 */
