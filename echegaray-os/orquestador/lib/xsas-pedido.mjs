// EL PEDIDO QUE ENTRA A XSAS — un solo contrato para app.ecsas, Mattermost, workers y timers.
//
// ═══ POR QUÉ EXISTE ═══
//
// XSAS Core ya existía entero (estado, Plan→Real, aprendizaje, agentes, tools, skills, el ruteo de
// 4 niveles y la puerta hacia el modelo). Lo que NO existía era una puerta de ENTRADA común: cada
// cara armaba su propio pedido con su propia forma. Mattermost mandaba un `post` crudo, el worker
// un `task.inputs`, y la web no tenía por dónde entrar. Tres formas del mismo hecho —«alguien le
// pide algo al OS»— significan tres lugares donde arreglar el mismo defecto.
//
// ═══ LA REGLA QUE GOBIERNA ESTE ARCHIVO ═══
//
// **EL CONTEXTO DE ENTIDAD NO SE CREE, SE VERIFICA.** Un pedido puede decir `obra_id: X`, pero eso
// sólo vale si alguien del lado del servidor comprobó que ese actor puede ver esa obra. Por eso el
// contexto de entidad viaja junto a `verificado_por`, y `normalizarPedido` DESCARTA el contexto que
// llega sin esa firma en vez de pasarlo adentro. Un navegador que manda `obra_id` de otro no
// consigue nada: el gateway trabaja sin contexto y lo dice.
//
// No hay lógica de negocio acá: esto valida forma, no decide nada.
import { z } from 'zod'
import { randomUUID } from 'node:crypto'

/** Por dónde entró el pedido. No es cosmético: decide qué contexto es creíble y cómo se responde. */
export const CANAL = Object.freeze({
  APP: 'app',              // app.ecsas.com.ar (cockpit humano)
  MATTERMOST: 'mattermost',
  WORKER: 'worker',        // el Work Fabric ejecutando una tarea
  TIMER: 'timer',          // una corrida programada
  CLI: 'cli',              // un script del OS o Claude Code
})

/** Qué trae el pedido. Los tres son entradas legítimas y se rutean distinto. */
export const TIPO = Object.freeze({
  MENSAJE: 'mensaje',      // lenguaje natural de una persona
  INTENCION: 'intencion',  // una capacidad pedida por su nombre (un botón, un script)
  EVENTO: 'evento',        // algo que pasó (un comprobante que llegó, un saldo que cambió)
})

/** Quién puede firmar que un contexto de entidad es de verdad de ese actor. */
/**
 * CLAVES DE `contexto` QUE NOMBRAN UNA ENTIDAD. Sin firma, no viajan.
 *
 * La lista es de nombres, no de formas, porque lo que las hace peligrosas es que una tool las pueda
 * recibir como argumento: `argumentosPara` busca en `contexto` por el NOMBRE del parámetro. Agregar
 * un parámetro llamado `obra` a cualquier tool futura la vuelve alcanzable desde acá.
 */
export const CLAVES_DE_ENTIDAD_EN_CONTEXTO = Object.freeze([
  'obra', 'obra_id', 'obra_nombre',
  'cliente', 'cliente_id', 'comitente',
  'proveedor', 'proveedor_id', 'cuit',
  'proyecto', 'presupuesto', 'cotizacion', 'persona', 'legajo',
])

export const VERIFICADOR = Object.freeze({
  APP_SERVER: 'app-server',       // Next comprobó contra Supabase CON la sesión del usuario (RLS)
  CANAL_MATTERMOST: 'canal-mattermost', // el binding canal→área, que es dato del OS
  OS: 'os',                       // el propio OS (worker/timer): no hay navegador de por medio
})

const ENTIDAD = z.object({
  obra_id: z.string().min(1).optional(),
  cliente_id: z.string().min(1).optional(),
  presupuesto_id: z.string().min(1).optional(),
  proveedor_id: z.string().min(1).optional(),
  persona_id: z.string().min(1).optional(),
  compra_id: z.string().min(1).optional(),
  documento: z.string().min(1).optional(),
}).strict()

const ACTOR = z.object({
  id: z.string().min(1),
  nombre: z.string().optional().nullable(),
  rol: z.string().min(1),
  // Las capabilities que este actor tiene. Las llena el ADAPTER desde la fuente real
  // (`orq.agent_capabilities` para un agente, el rol de `perfiles` para una persona), nunca el
  // cliente. Vacío = no puede ejecutar ninguna tool: falla cerrado.
  permisos: z.array(z.string()).default([]),
})

const ESQUEMA = z.object({
  actor: ACTOR,
  canal: z.enum(Object.values(CANAL)),
  origen: z.string().optional().nullable(),
  tipo: z.enum(Object.values(TIPO)).optional(),
  mensaje: z.string().optional().nullable(),
  intencion: z.string().optional().nullable(),
  evento: z.object({ nombre: z.string().min(1), datos: z.unknown().optional() }).optional().nullable(),
  contexto: z.record(z.unknown()).default({}),
  entidad: ENTIDAD.default({}),
  verificado_por: z.enum(Object.values(VERIFICADOR)).optional().nullable(),
  correlation_id: z.string().optional().nullable(),
  request_id: z.string().optional().nullable(),
  // Un adjunto puede ser un id/ruta (string, el contrato original), el CONTENIDO en texto con su
  // nombre (un CSV, un extracto pegado — tope 512 KB), o el contenido BINARIO en base64 (un PDF,
  // un Excel; tope ~8 MB de archivo ≈ 11 MB de base64). El binario no se interpreta acá: la
  // ingesta detecta el formato por los bytes.
  adjuntos: z.array(z.union([
    z.string(),
    z.object({ nombre: z.string().max(200), contenido: z.string().max(512 * 1024) }),
    z.object({ nombre: z.string().max(200), contenido_base64: z.string().max(11 * 1024 * 1024) }),
  ])).max(10).default([]),
})

export class PedidoInvalido extends Error {
  constructor(motivo) { super(motivo); this.name = 'PedidoInvalido' }
}

/** El tipo que se deduce de lo que vino, cuando el caller no lo declaró. */
function tipoDe(p) {
  if (p.tipo) return p.tipo
  if (p.evento) return TIPO.EVENTO
  if (p.intencion) return TIPO.INTENCION
  return TIPO.MENSAJE
}

/**
 * VALIDA Y NORMALIZA UN PEDIDO. Pura: no toca base, ni red, ni reloj salvo el id.
 *
 * @param {object} bruto
 * @param {{nuevoId?:()=>string}} [opts]
 * @returns {object} pedido normalizado, con `entidad` vacía si nadie la verificó
 * @throws {PedidoInvalido}
 */
export function normalizarPedido(bruto, { nuevoId = randomUUID } = {}) {
  const r = ESQUEMA.safeParse(bruto ?? {})
  if (!r.success) {
    const primero = r.error.issues[0]
    throw new PedidoInvalido(`pedido inválido: ${primero.path.join('.') || '(raíz)'} — ${primero.message}`)
  }
  const p = r.data
  const tipo = tipoDe(p)
  const mensaje = typeof p.mensaje === 'string' ? p.mensaje.trim() : ''
  if (tipo === TIPO.MENSAJE && !mensaje) throw new PedidoInvalido('pedido inválido: un mensaje vacío no es un pedido')
  if (tipo === TIPO.INTENCION && !p.intencion) throw new PedidoInvalido('pedido inválido: falta la intención')

  // ═══ ACÁ SE CAE EL CONTEXTO QUE NADIE FIRMÓ ═══
  // Se descarta en silencio para el caller pero se DECLARA en el pedido: el gateway responde sin
  // ese contexto y dice por qué. Tapar la diferencia sería peor que no tener contexto.
  const hayEntidad = Object.keys(p.entidad).length > 0
  const verificado = Boolean(p.verificado_por)
  // ═══ Y ACÁ TAMBIÉN, QUE ES DONDE FALTABA (27/08/2026, auditoría independiente) ═══
  //
  // La regla del encabezado se aplicaba SÓLO a `entidad`. `contexto` es un objeto libre y pasaba
  // entero, y del otro lado `argumentosPara` lo usa como PRIMERA fuente para llenar los argumentos
  // de una tool. Un caller que simplemente NO manda `entidad.obra_id` y manda `contexto.obra` no
  // tenía nada que verificar: nombraba la obra que quisiera. La auditoría lo probó contra la puerta
  // viva y sacó el costo real de una obra con un rol que no debía verlo.
  //
  // Nombrar una entidad es nombrar una entidad, venga por el campo que venga. Mismo criterio,
  // misma firma.
  const contextoFiltrado = {}
  const contextoDescartado = []
  for (const [clave, valor] of Object.entries(p.contexto)) {
    if (!verificado && CLAVES_DE_ENTIDAD_EN_CONTEXTO.includes(clave)) { contextoDescartado.push(clave); continue }
    contextoFiltrado[clave] = valor
  }
  return Object.freeze({
    actor: Object.freeze({ ...p.actor, nombre: p.actor.nombre ?? null }),
    canal: p.canal,
    origen: p.origen ?? null,
    tipo,
    mensaje: mensaje || null,
    intencion: p.intencion ?? null,
    evento: p.evento ?? null,
    contexto: Object.freeze(contextoFiltrado),
    contextoDescartado: Object.freeze(contextoDescartado),
    entidad: Object.freeze(hayEntidad && verificado ? { ...p.entidad } : {}),
    entidadDescartada: hayEntidad && !verificado ? Object.keys(p.entidad) : [],
    verificadoPor: p.verificado_por ?? null,
    adjuntos: Object.freeze([...p.adjuntos]),
    correlationId: p.correlation_id || nuevoId(),
    requestId: p.request_id || nuevoId(),
  })
}

/** El texto sobre el que se rutea: el mensaje, o el nombre de la intención/evento. */
export function textoDePedido(p) {
  if (p.tipo === TIPO.MENSAJE) return p.mensaje ?? ''
  if (p.tipo === TIPO.INTENCION) return p.intencion ?? ''
  return p.evento?.nombre ?? ''
}
