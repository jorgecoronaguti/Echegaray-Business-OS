// ROUTER DEL ASISTENTE — de un mensaje a un efecto, o a UNA pregunta.
//
// Orden fijo, y cada paso existe por un error concreto que evita:
//   identidad → aclaración pendiente → interpretar → capacidad → habilitada → personas →
//   validación → idempotencia → ejecución.
//
// UNA SOLA PREGUNTA. Si falta un dato imprescindible se pregunta una vez y se guarda lo ya
// entendido en `comunicacion.asistente_pendientes`. La respuesta se resuelve CONTRA ESA FILA
// —sin volver a molestar al modelo si eligió una opción ofrecida— y un pedido que llegó por
// esa vía ya no abre otra pregunta: un asistente que repregunta tres veces es peor que uno
// que dice qué le falta.
//
// IDEMPOTENCIA DEL EFECTO EXTERNO. El Work Fabric reintenta tareas: sin esta barrera, un
// reintento crearía un SEGUNDO evento de Calendar. Antes de ejecutar algo con efecto externo
// se consulta `(comm_event_id, capacidad)` en `asistente_ejecuciones`; si ya salió bien, se
// devuelve el mismo resultado en vez de volver a hacerlo.
//
// NUNCA DECIR QUE ALGO SE HIZO SIN EVIDENCIA. Lo que llega al chat es el `texto` de la
// capacidad, y sólo se lo trata como éxito si vino con evidencia del efecto real.
//
// La auditoría (orq.emit_event) NO es de este archivo: se expone `ctx.auditar` y quien
// integre decide qué registrar.

import {
  CAPACIDAD, INTENCION, ERROR, TZ_EMPRESA,
  errorAsistente, resultadoOk, resultadoError, resultadoAclaracion,
} from './contratos.mjs'
import { capacidadPorId, capacidadesHabilitadas, catalogoCompacto, renderAyuda } from './registro.mjs'
import { interpretar as interpretarDefault, interpretarDeterministico, parametrosPorIntencion, PREGUNTA_TIPO, plano } from './interpretar.mjs'
import { identidadDe, resolverPersona, emailDe, nombreCorto } from './identidades.mjs'
import { parseCuando } from './tiempo.mjs'
import { googleDe } from './google-cliente.mjs'
import { interpretarFeedback } from '../../lib/drive-busqueda/feedback.mjs'

const PLATAFORMA = 'mattermost'
const MINUTOS_PENDIENTE = 20

/** El campo temporal de cada capacidad: el mismo dato con tres nombres distintos. */
const CAMPO_TIEMPO = {
  [CAPACIDAD.RECORDATORIO_CREAR]: 'cuando',
  [CAPACIDAD.CALENDAR_EVENTO_CREAR]: 'inicio',
  [CAPACIDAD.TASKS_TAREA_CREAR]: 'vence',
}
const CAMPOS_TIEMPO = new Set(Object.values(CAMPO_TIEMPO))

/** Las tres formas de "creá algo con fecha", para la pregunta que las separa. */
const OPCIONES_TIPO = [
  { valor: CAPACIDAD.RECORDATORIO_CREAR, etiqueta: 'recordatorio interno' },
  { valor: CAPACIDAD.CALENDAR_EVENTO_CREAR, etiqueta: 'evento de Calendar' },
  { valor: CAPACIDAD.TASKS_TAREA_CREAR, etiqueta: 'tarea de Google Tasks' },
]

// ── Identidad ────────────────────────────────────────────────────────────────

/**
 * Quién pide. Si no está en la tabla no se lo rechaza: se arma una identidad provisoria con
 * lo que trajo Mattermost. Sin email, las capacidades que dependen de Google quedan
 * deshabilitadas solas — que es exactamente lo que corresponde, sin un caso especial acá.
 */
async function identidadDeQuienPide(port, ctx) {
  const id = ctx.actor?.plataformaUserId ?? ctx.actor?.plataforma_user_id ?? null
  if (!id) return null
  const guardada = await identidadDe(port, id, { plataforma: ctx.plataforma ?? PLATAFORMA })
  if (guardada) return guardada
  const nombre = ctx.actor?.plataformaUsername ?? ctx.actor?.plataforma_username ?? String(id)
  return {
    plataforma: ctx.plataforma ?? PLATAFORMA, plataformaUserId: String(id), plataformaUsername: nombre,
    nombreVisible: nombre, alias: [], email: null, zonaHoraria: TZ_EMPRESA, activo: true, provisoria: true,
  }
}

// ── Aclaraciones pendientes ──────────────────────────────────────────────────

/** La pregunta abierta de esta persona. Una vencida no contamina el pedido nuevo: se cierra. */
async function pendienteVigente(port, identidad, ahora) {
  if (!port?.query || !identidad) return null
  const { rows } = await port.query(
    `select id, capacidad, parcial, pregunta, opciones, expira_at
       from comunicacion.asistente_pendientes
      where plataforma = $1 and plataforma_user_id = $2 and estado = 'abierta'
      order by creado_at desc limit 1`,
    [identidad.plataforma, identidad.plataformaUserId],
  )
  if (!rows.length) return null
  const p = rows[0]
  if (new Date(p.expira_at).getTime() <= ahora.getTime()) {
    await cerrarPendiente(port, p.id, 'vencida')
    return null
  }
  return { ...p, parcial: p.parcial ?? {}, opciones: p.opciones ?? [] }
}

async function cerrarPendiente(port, id, estado) {
  await port.query(
    `update comunicacion.asistente_pendientes set estado = $2, actualizado_at = now() where id = $1`,
    [id, estado],
  )
}

/** Guarda la pregunta. Reemplaza cualquier otra abierta: el asistente no acumula preguntas. */
async function guardarPendiente(port, identidad, ctx, { capacidad, parcial, pregunta, opciones }) {
  if (!port?.query) return null
  await port.query(
    `update comunicacion.asistente_pendientes set estado = 'cancelada', actualizado_at = now()
      where plataforma = $1 and plataforma_user_id = $2 and estado = 'abierta'`,
    [identidad.plataforma, identidad.plataformaUserId],
  )
  const { rows } = await port.query(
    `insert into comunicacion.asistente_pendientes
       (plataforma, plataforma_user_id, channel_id, root_post_id, capacidad, parcial, pregunta, opciones, expira_at)
     values ($1,$2,$3,$4,$5,$6::jsonb,$7,$8::jsonb, now() + make_interval(mins => $9))
     returning id`,
    [identidad.plataforma, identidad.plataformaUserId, ctx.channelId ?? null, ctx.rootPostId ?? null,
      capacidad, JSON.stringify(parcial), pregunta, JSON.stringify(opciones ?? []), MINUTOS_PENDIENTE],
  )
  return rows[0]?.id ?? null
}

const norm = (t) => plano(t).replace(/[¿?¡!.]/g, '').trim()
const ORDINALES = {
  1: ['1', 'el primero', 'la primera', 'primero', 'primera', 'el 1', 'la 1'],
  2: ['2', 'el segundo', 'la segunda', 'segundo', 'segunda', 'el 2', 'la 2'],
  3: ['3', 'el tercero', 'la tercera', 'tercero', 'tercera', 'el 3', 'la 3'],
  4: ['4', 'el cuarto', 'la cuarta', 'cuarto', 'cuarta', 'el 4', 'la 4'],
  5: ['5', 'el quinto', 'la quinta', 'quinto', 'quinta', 'el 5', 'la 5'],
}
/** "ese", "ese mismo": señalan lo que se acaba de mostrar. En una lista ordenada por
 *  relevancia, eso es el primero — que es el que el buscador puso arriba justamente porque
 *  es el más probable. */
const DEICTICOS = new Set([
  'ese', 'esa', 'este', 'esta', 'ese mismo', 'esa misma', 'este mismo', 'esta misma',
  'el mismo', 'la misma', 'ese si', 'esa si', 'dale ese', 'ese dale', 'el de arriba', 'el primero si',
])
/** Un pedazo de texto tan corto que puede aparecer por casualidad dentro de una etiqueta
 *  (una fecha, un número de orden) no alcanza para elegir un archivo. */
const MIN_SUBSTRING = 4
/** "El otro", "abrí el otro": no es el primero — es el que NO era. En una lista de dos, es
 *  el segundo; en una más larga, el siguiente al que se propuso. */
const OTROS = new Set([
  'el otro', 'la otra', 'otro', 'otra', 'el otro si', 'abri el otro', 'abrime el otro',
  'pasame el otro', 'dame el otro', 'el que sigue', 'el siguiente',
])

/**
 * ¿La respuesta es una de las opciones que se ofrecieron? Valor, etiqueta, ordinal o deíctico.
 *
 * EL ORDEN DE LAS COMPARACIONES ES EL ARREGLO. Antes el substring se probaba ANTES que el
 * ordinal, y contra etiquetas que llevan la fecha del archivo: escribir "2" matcheaba el
 * "2" de "15/07/2026" en la PRIMERA opción y devolvía el archivo equivocado. La persona pedía
 * el segundo, recibía el primero, y nada fallaba. Ahora el ordinal manda, y el substring
 * exige cuatro caracteres para no volver a ganar por casualidad.
 */
function elegirOpcion(opciones, texto) {
  const t = norm(texto)
  if (!t || !opciones?.length) return null
  if (DEICTICOS.has(t)) return opciones[0]
  if (OTROS.has(t)) return opciones[1] ?? null
  // 1) Ordinal y valor exacto: lo que la persona escribe para elegir, sin ambigüedad.
  for (const [i, o] of opciones.entries()) {
    if ((ORDINALES[i + 1] ?? []).includes(t) || t === norm(o.valor)) return o
  }
  // 2) La etiqueta, entera o en un pedazo suficientemente largo para identificar algo.
  for (const o of opciones) {
    const etiqueta = norm(o.etiqueta)
    if (!etiqueta) continue
    if (t === etiqueta) return o
    if (t.length >= MIN_SUBSTRING && (etiqueta.includes(t) || t.includes(etiqueta))) return o
  }
  return null
}

/**
 * El mensaje siguiente a una pregunta, leído COMO RESPUESTA (0 API). Tres desenlaces:
 *   {solicitud}      → respondió y se puede seguir
 *   {nuevoTema:true} → escribió otro pedido reconocible; la pregunta vieja se descarta
 *   {sinDato:true}   → contestó, pero lo que dijo no trae el dato ("cuando puedas")
 * El tercero existe para no responder "no entendí nada" a alguien que SÍ estaba contestando.
 */
function respuestaAPendiente(pendiente, texto, ahora) {
  const parcial = pendiente.parcial ?? {}
  const faltante = parcial.faltante ?? null
  const parametros = { ...(parcial.parametros ?? {}) }
  const elegida = elegirOpcion(pendiente.opciones, texto)

  // EL FEEDBACK SE LEE ANTES QUE "CAMBIÓ DE TEMA", Y NO ES UN DETALLE DE ORDEN.
  //
  // "correcto" es una palabra sola, y el intérprete reconoce sustantivos sueltos como pedidos
  // de archivo: sin esto, confirmar un resultado disparaba una búsqueda de la palabra
  // "correcto". Sólo se evalúa si la capacidad declaró que espera feedback, así que ninguna
  // otra cambia de comportamiento.
  if (!elegida && parcial.feedback) {
    const f = interpretarFeedback(texto)
    if (f) return { solicitud: solicitudDeAclaracion(parcial.intencion ?? pendiente.capacidad, { ...parametros, feedback: f }) }
  }

  // Cambió de tema: si el texto es un pedido reconocible POR SÍ MISMO, no es una respuesta a
  // la pregunta anterior. "el jueves a las 10" no se reconoce solo — y por eso es respuesta.
  const otroPedido = interpretarDeterministico(texto, { ahora })
  if (!elegida && otroPedido && otroPedido.intencion !== INTENCION.DESCONOCIDO) return { nuevoTema: true }

  if (faltante === 'capacidad') {
    // Sin una opción elegida no se adivina entre recordatorio, evento y tarea.
    if (!elegida) return { sinDato: true, faltante }
    const b = { contenido: parametros.contenido ?? '', titulo: parametros.contenido ?? '', terminos: parametros.contenido ?? '', cuando: parametros.cuando ?? null, cadencia: parametros.cadencia ?? null }
    return { solicitud: solicitudDeAclaracion(elegida.valor, parametrosPorIntencion(elegida.valor, b, parametros.destinatario ?? null)) }
  }

  const intencion = parcial.intencion ?? pendiente.capacidad
  if (elegida) return { solicitud: solicitudDeAclaracion(intencion, { ...parametros, [faltante]: elegida.valor }) }
  if (!faltante) return { nuevoTema: true }

  if (CAMPOS_TIEMPO.has(faltante)) {
    const t = parseCuando(texto, { ahora })
    if (!t) return { sinDato: true, faltante }
    return { solicitud: solicitudDeAclaracion(intencion, { ...parametros, [faltante]: t.instante }) }
  }
  return { solicitud: solicitudDeAclaracion(intencion, { ...parametros, [faltante]: String(texto).trim() }) }
}

const solicitudDeAclaracion = (intencion, parametros) =>
  ({ intencion, via: 'aclaracion', confianza: 1, parametros, faltantes: [], ambiguedad: null })

// ── Personas nombradas en el pedido ──────────────────────────────────────────

/**
 * "avisale a Rodrigo" → un user_id real, o una pregunta, o un error. Nunca el más parecido.
 * @returns {Promise<{ok:true}|{aclaracion:object}|{error:object}>}
 */
async function resolverPersonasDelPedido(port, solicitud, identidad) {
  const p = solicitud.parametros
  if (solicitud.intencion === CAPACIDAD.RECORDATORIO_CREAR && !p.destinatarioUserId) {
    if (!p.destinatario) { p.destinatarioUserId = identidad.plataformaUserId; return { ok: true } }
    const r = await resolverPersona(port, p.destinatario, { plataforma: identidad.plataforma })
    if (r.unica) {
      p.destinatarioUserId = r.unica.plataformaUserId
      p.destinatario = nombreCorto(r.unica)
      // Lo que se había tomado por nombre y era el pedido vuelve al contenido: sin esto,
      // "recordale a Rodrigo BUSCAR las llaves" le llegaba a Rodrigo como "las llaves".
      if (r.sobrante) p.contenido = `${r.sobrante} ${p.contenido ?? ''}`.trim()
      return { ok: true }
    }
    if (r.ambiguas) {
      return {
        aclaracion: {
          campo: 'destinatarioUserId',
          pregunta: `Hay más de un "${p.destinatario}". ¿A cuál le aviso?`,
          opciones: r.ambiguas.map((i) => ({ valor: i.plataformaUserId, etiqueta: nombreCorto(i) })),
        },
      }
    }
    return { error: errorAsistente(ERROR.USUARIO_INEXISTENTE, `No tengo registrado a "${p.destinatario}" en el chat, así que no puedo avisarle.`) }
  }

  if (solicitud.intencion === CAPACIDAD.CALENDAR_EVENTO_CREAR && Array.isArray(p.invitados) && p.invitados.length) {
    const emails = [...(p.participantes ?? [])]
    for (const nombre of p.invitados) {
      const r = await resolverPersona(port, nombre, { plataforma: identidad.plataforma })
      if (r.ambiguas) {
        return {
          aclaracion: {
            campo: 'participantes',
            pregunta: `Hay más de un "${nombre}". ¿A cuál invito?`,
            opciones: r.ambiguas.map((i) => ({ valor: emailDe(i) ?? i.plataformaUserId, etiqueta: nombreCorto(i) })),
          },
        }
      }
      if (!r.unica) return { error: errorAsistente(ERROR.USUARIO_INEXISTENTE, `No tengo registrado a "${nombre}", así que no lo puedo invitar.`) }
      const mail = emailDe(r.unica)
      if (!mail) return { error: errorAsistente(ERROR.DATO_FALTANTE, `${nombreCorto(r.unica)} no tiene mail cargado en el OS: no puedo invitarlo al evento.`) }
      emails.push(mail)
    }
    p.participantes = [...new Set(emails)]
    delete p.invitados
  }
  return { ok: true }
}

// ── Idempotencia del efecto externo ──────────────────────────────────────────

async function ejecucionPrevia(port, commEventId, capacidad) {
  if (!port?.query || !commEventId) return null
  const { rows } = await port.query(
    `select estado, resultado from comunicacion.asistente_ejecuciones
      where comm_event_id = $1::uuid and capacidad = $2 limit 1`, [commEventId, capacidad],
  )
  return rows.length ? rows[0] : null
}

async function registrarEjecucion(port, ctx, identidad, capacidad, resultado) {
  if (!port?.query || !ctx.commEventId) return
  await port.query(
    `insert into comunicacion.asistente_ejecuciones
       (comm_event_id, capacidad, plataforma_user_id, estado, resultado, error_codigo)
     values ($1::uuid,$2,$3,$4,$5::jsonb,$6)
     on conflict (comm_event_id, capacidad) do nothing`,
    [ctx.commEventId, capacidad, identidad?.plataformaUserId ?? null,
      resultado.ok ? 'ok' : 'error',
      JSON.stringify({ texto: resultado.texto, evidencia: resultado.evidencia ?? null }),
      resultado.error?.codigo ?? null],
  )
}

// ── El router ────────────────────────────────────────────────────────────────

/**
 * Atiende un pedido de punta a punta.
 *
 * @param {object} o
 * @param {string} o.texto
 * @param {object} o.ctx    { port, actor, google, commEventId, correlationId, channelId, rootPostId, log, ahora, auditar }
 * @param {object} [o.deps] { interpretar, registro } — inyectables para los tests
 * @returns {Promise<object>} resultado (zResultado) + { via, intencion }
 */
export async function atenderPedido({ texto, ctx = {}, deps = {} } = {}) {
  const port = ctx.port
  const ahora = ctx.ahora ? ctx.ahora() : new Date()
  const registro = deps.registro ?? { capacidadPorId, capacidadesHabilitadas }
  const interpretarFn = deps.interpretar ?? interpretarDefault

  const identidad = ctx.identidad ?? await identidadDeQuienPide(port, ctx)
  if (!identidad) {
    return final(resultadoError('asistente', errorAsistente(ERROR.USUARIO_INEXISTENTE, 'No pude identificar quién me está escribiendo.')), 'sin_identidad', null)
  }
  // CON QUÉ CUENTA DE GOOGLE. Se resuelve ACÁ, desde la identidad de quien pide, y NUNCA se
  // hereda el cliente que traiga el contexto. Costó descubrirlo en producción: el handler de
  // comunicación le pasa a todo especialista el cliente de la cuenta operadora del OS —
  // correcto para Personal IA, que escribe JORNALES como el OS— y el asistente lo estaba
  // usando para las cosas de cada persona. El resultado no fue un error: la tarea "llamar a
  // Santander" se creó de verdad, con id y todo, en la lista de tareas de la cuenta de
  // servicio. El asistente dijo "listo" y Jorge no la vio nunca. Un efecto en la cuenta
  // equivocada es peor que un fallo, porque no se nota.
  const google = typeof ctx.googleDe === 'function'
    ? await ctx.googleDe(identidad)
    : await googleDe({ identidad, config: ctx.config ?? undefined })
  const base = { ...ctx, port, identidad, registro, google, ahora: () => ahora }
  const habilitadas = await registro.capacidadesHabilitadas(base)

  // 1) ¿Esto es la respuesta a algo que pregunté?
  let veniaDePendiente = false
  let solicitud = null
  const pendiente = await pendienteVigente(port, identidad, ahora)
  if (pendiente) {
    const r = respuestaAPendiente(pendiente, texto, ahora)
    await cerrarPendiente(port, pendiente.id, r.solicitud ? 'resuelta' : 'cancelada')
    if (r.sinDato) {
      const err = errorAsistente(ERROR.DATO_FALTANTE, `Sigo sin saber ${etiquetaCampo(r.faltante)}. Pedímelo de nuevo con ese dato incluido.`)
      return final(resultadoError(pendiente.capacidad, err), 'aclaracion', pendiente.parcial?.intencion ?? null)
    }
    if (r.solicitud) { solicitud = r.solicitud; veniaDePendiente = true }
  }

  // 2) Interpretar (gratis primero; el modelo sólo si hizo falta).
  if (!solicitud) {
    solicitud = await interpretarFn(texto, {
      ...base,
      // El intérprete espera un INSTANTE; las capacidades reciben un reloj (`() => Date`).
      // Se traduce acá, en el único lugar donde se cruzan las dos convenciones.
      ahora,
      catalogo: catalogoCompacto(habilitadas),
      idsHabilitados: habilitadas.map((c) => c.id),
      quienPide: nombreCorto(identidad),
    })
  }

  const preguntar = crearPreguntador({ port, identidad, ctx: base, permitido: !veniaDePendiente })
  return resolverSolicitud({ solicitud, base, habilitadas, registro, preguntar, identidad, port })
}

/** Lo que no se entendió: se pregunta el tipo si esa era la única duda, o se ofrece la ayuda. */
async function sinIntencion({ solicitud, habilitadas, preguntar }) {
  if (solicitud.ambiguedad === PREGUNTA_TIPO) {
    const opciones = OPCIONES_TIPO.filter((o) => habilitadas.some((c) => c.id === o.valor))
    if (opciones.length > 1) {
      return preguntar({
        capacidad: INTENCION.DESCONOCIDO, intencion: INTENCION.DESCONOCIDO,
        parametros: solicitud.parametros, faltante: 'capacidad', pregunta: PREGUNTA_TIPO, opciones,
      })
    }
  }
  const err = errorAsistente(ERROR.INTERPRETACION, `No entendí qué necesitás.\n\n${renderAyuda(habilitadas)}`)
  return final(resultadoError('asistente', err), solicitud.via, INTENCION.DESCONOCIDO)
}

/** La capacidad que corresponde, sólo si existe Y está habilitada para esta persona. */
async function capacidadPara(intencion, { registro, habilitadas, via }) {
  const capacidad = await registro.capacidadPorId(intencion)
  if (!capacidad) {
    const err = errorAsistente(ERROR.DEFINITIVO, `Eso todavía no lo sé hacer.\n\n${renderAyuda(habilitadas)}`)
    return { fallo: final(resultadoError(intencion, err), via, intencion) }
  }
  if (!habilitadas.some((c) => c.id === capacidad.id)) {
    const err = errorAsistente(ERROR.CAPACIDAD_DESHABILITADA, `Entendí lo que pedís, pero ahora mismo no tengo habilitado "${capacidad.nombre}" para vos.`)
    return { fallo: final(resultadoError(capacidad.id, err), via, intencion) }
  }
  return { capacidad }
}

/** El pedido ya interpretado: capacidad, permisos, personas, validación y ejecución. */
async function resolverSolicitud({ solicitud, base, habilitadas, registro, preguntar, identidad, port }) {
  const { intencion } = solicitud
  if (intencion === INTENCION.DESCONOCIDO) return sinIntencion({ solicitud, habilitadas, preguntar })

  const elegida = await capacidadPara(intencion, { registro, habilitadas, via: solicitud.via })
  if (elegida.fallo) return elegida.fallo
  const { capacidad } = elegida

  // Personas nombradas: se resuelven ANTES de validar, porque el schema pide ids y emails.
  const personas = await resolverPersonasDelPedido(port, solicitud, identidad)
  if (personas.error) return final(resultadoError(capacidad.id, personas.error), solicitud.via, intencion)
  if (personas.aclaracion) {
    return preguntar({
      capacidad: capacidad.id, intencion, parametros: solicitud.parametros,
      faltante: personas.aclaracion.campo, pregunta: personas.aclaracion.pregunta, opciones: personas.aclaracion.opciones,
    })
  }

  // Ambigüedad de fecha declarada por tiempo.mjs: dos lecturas legítimas, se elige una vez.
  if (solicitud.ambiguedad && solicitud.opcionesTiempo?.length) {
    const campo = CAMPO_TIEMPO[capacidad.id] ?? 'cuando'
    return preguntar({
      capacidad: capacidad.id, intencion, parametros: solicitud.parametros,
      faltante: campo, pregunta: `${solicitud.ambiguedad}`, opciones: solicitud.opcionesTiempo,
    })
  }

  // `entrada` es un schema Zod por contrato. Si una capacidad llega sin él, no se la
  // ejecuta a ciegas ni se la valida a medias: se dice que está mal declarada.
  if (typeof capacidad.entrada?.safeParse !== 'function') {
    const err = errorAsistente(ERROR.DEFINITIVO, 'Esa capacidad está mal declarada, no la puedo ejecutar.', `${capacidad.id}: entrada no es un schema Zod`)
    return final(resultadoError(capacidad.id, err), solicitud.via, intencion)
  }
  const validacion = capacidad.entrada.safeParse(solicitud.parametros)
  const faltante = solicitud.faltantes?.[0] ?? primerFaltante(validacion)
  if (faltante) {
    return preguntar({
      capacidad: capacidad.id, intencion, parametros: solicitud.parametros,
      faltante, pregunta: preguntaPor(faltante, capacidad), opciones: [],
    })
  }
  if (!validacion.success) {
    const err = errorAsistente(ERROR.DATO_FALTANTE, 'Me falta información para hacer eso.', JSON.stringify(validacion.error.issues).slice(0, 300))
    return final(resultadoError(capacidad.id, err), solicitud.via, intencion)
  }

  return ejecutar({ capacidad, parametros: validacion.data, base, port, identidad, via: solicitud.via })
}

/** Ejecuta pasando por la barrera de idempotencia si el efecto es externo. */
async function ejecutar({ capacidad, parametros, base, port, identidad, via }) {
  if (capacidad.efectoExterno) {
    const previa = await ejecucionPrevia(port, base.commEventId, capacidad.id)
    if (previa?.estado === 'ok') {
      const r = previa.resultado ?? {}
      base.log?.info?.('asistente: efecto externo ya ejecutado, no se repite', { capacidad: capacidad.id })
      return final(resultadoOk(capacidad.id, r.texto ?? 'Eso ya lo había hecho.', r.evidencia ?? {}), via, capacidad.id, { repetida: true })
    }
  }

  let resultado
  try {
    resultado = await capacidad.ejecutar(parametros, base)
  } catch (e) {
    const err = errorAsistente(ERROR.TEMPORAL, 'No pude completarlo ahora. Probá de nuevo en un rato.', e?.message)
    resultado = resultadoError(capacidad.id, err)
  }
  // Un `ok:true` sin evidencia sería decir "listo" sin haber hecho nada verificable.
  if (resultado.ok && !resultado.evidencia) {
    resultado = resultadoError(capacidad.id, errorAsistente(ERROR.DEFINITIVO, 'No pude confirmar que se haya hecho, así que no te digo que sí.'))
  }
  if (capacidad.efectoExterno) await registrarEjecucion(port, base, identidad, capacidad.id, resultado)
  await base.auditar?.({ evento: 'asistente.ejecucion', capacidad: capacidad.id, ok: resultado.ok, via })

  // UNA PREGUNTA DE LA CAPACIDAD TAMBIÉN ES UNA PREGUNTA.
  //
  // El router persistía como pendiente sólo lo que preguntaba ÉL (un parámetro que faltaba).
  // Cuando la que preguntaba era la capacidad —"encontré varios, ¿cuál te paso?"— no se
  // guardaba nada: la lista se mostraba, la persona contestaba "el segundo", y ese mensaje se
  // interpretaba desde cero como si fuera un pedido nuevo. La pregunta era decorativa.
  //
  // Se guarda acá, en un solo lugar, para cualquier capacidad que pregunte. `parcial` viene
  // de la propia capacidad y trae el `faltante` que su respuesta va a completar.
  if (resultado.aclaracion?.opciones?.length && resultado.aclaracion.parcial?.faltante) {
    await guardarPendiente(port, identidad, base, {
      capacidad: capacidad.id,
      parcial: resultado.aclaracion.parcial,
      pregunta: resultado.texto,
      opciones: resultado.aclaracion.opciones,
    })
  }

  // UNA RESPUESTA TAMBIÉN PUEDE ESPERAR RESPUESTA.
  //
  // "Te paso este archivo" admite un "no era ese" — y ese "no" es la corrección más barata que
  // existe: alguien diciéndote que te equivocaste, gratis, en el momento. Se perdía entera,
  // porque sin una fila abierta el mensaje siguiente se interpreta desde cero y "no" no es un
  // pedido de nada. La capacidad declara qué deja abierto; el router lo guarda igual que una
  // pregunta, en el mismo lugar y con el mismo vencimiento.
  if (resultado.ok && resultado.seguimiento?.parcial) {
    await guardarPendiente(port, identidad, base, {
      capacidad: capacidad.id,
      parcial: resultado.seguimiento.parcial,
      pregunta: resultado.texto,
      opciones: resultado.seguimiento.opciones ?? [],
    })
  }
  return final(resultado, via, capacidad.id)
}

// ── Preguntar (una sola vez) ─────────────────────────────────────────────────

function crearPreguntador({ port, identidad, ctx, permitido }) {
  return async function preguntar({ capacidad, intencion, parametros, faltante, pregunta, opciones }) {
    // Ya se preguntó una vez por esta solicitud: no se abre una segunda ronda.
    if (!permitido) {
      const err = errorAsistente(ERROR.DATO_FALTANTE, `Sigo sin tener un dato para hacerlo: ${etiquetaCampo(faltante)}. Pedímelo de nuevo con ese dato incluido.`)
      return final(resultadoError(capacidad, err), 'aclaracion', intencion)
    }
    const texto = opciones?.length
      ? `${pregunta}\n${opciones.map((o, i) => `${i + 1}. ${o.etiqueta}`).join('\n')}`
      : pregunta
    await guardarPendiente(port, identidad, ctx, {
      capacidad, parcial: { intencion, parametros, faltante }, pregunta: texto, opciones,
    })
    await ctx.auditar?.({ evento: 'asistente.aclaracion', capacidad, faltante })
    return final(resultadoAclaracion(capacidad, texto, opciones ?? [], parametros), 'aclaracion', intencion)
  }
}

/** El primer campo que el schema de la capacidad reclama, con su nombre real. */
function primerFaltante(validacion) {
  if (validacion.success) return null
  const issue = validacion.error.issues.find((i) => i.path?.length)
  return issue ? String(issue.path[0]) : null
}

const ETIQUETAS = {
  cuando: 'cuándo', inicio: 'cuándo empieza', vence: 'para cuándo', contenido: 'qué hay que recordar',
  titulo: 'de qué se trata', terminos: 'qué busco', destinatario: 'a quién', destinatarioUserId: 'a quién',
  participantes: 'a quién invito', referencia: 'cuál',
}
const etiquetaCampo = (c) => ETIQUETAS[c] ?? c

function preguntaPor(campo, capacidad) {
  if (CAMPOS_TIEMPO.has(campo)) return '¿Para cuándo?'
  if (campo === 'contenido' || campo === 'titulo') return `¿Qué anoto en ${capacidad.nombre.toLowerCase()}?`
  if (campo === 'terminos') return '¿Qué archivo estás buscando?'
  return `Me falta un dato: ${etiquetaCampo(campo)}.`
}

/** Forma única de salida: el resultado más la trazabilidad de cómo se llegó. */
function final(resultado, via, intencion, extra = {}) {
  return { ...resultado, via, intencion, ...extra }
}
