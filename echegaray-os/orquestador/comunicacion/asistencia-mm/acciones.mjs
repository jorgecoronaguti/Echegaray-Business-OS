// EL RUTEADOR DE ACCIONES. Traduce lo que Mattermost manda cuando alguien aprieta un
// botón, elige en un desplegable o envía un diálogo, y devuelve la respuesta que
// RE-RENDERIZA el mismo post.
//
// DÓNDE VIVE EL ESTADO, Y POR QUÉ. En la SESIÓN del servidor
// (`comunicacion.asistencia_sesiones`), nunca en el `context` de la acción. El context da
// la vuelta por el cliente: quien lo devuelve puede cambiarlo. Del context se lee sólo la
// INTENCIÓN (qué paso, qué opción se eligió); la fecha, la obra y las excepciones se leen
// de la sesión, que es del servidor y tiene dueño, vencimiento y confirmación de un solo
// uso. La identidad tampoco se cree: viene del `user_id` del pedido autenticado de
// Mattermost y se contrasta contra la sesión abierta de esa persona.
//
// QUÉ NO SE REIMPLEMENTA ACÁ:
//   · idempotencia y concurrencia → las resuelve el núcleo (huella de celda + clave estable)
//     y la sesión (`confirmar` es un UPDATE condicionado a 'abierta': el segundo click
//     pierde la carrera y no escribe);
//   · qué celda se toca, cuántas horas valen, cómo se separa el extra → el núcleo;
//   · qué motivo es válido → el catálogo de `asistencia-motivos.mjs`.
//
// ERRORES. Siempre `ephemeral_text` en castellano, con la frase que le sirve al jefe de
// obra. Nunca un stack, una ruta, un id interno ni un secreto: lo técnico va al log.

import { EVENTO, ORIGEN, payloadRechazo, sanitizarError } from '../../lib/asistencia-auditoria.mjs'
import { MOTIVO as MOTIVO_NUCLEO } from '../../lib/tools/jornales-asistencia.mjs'
import { ESTADO_SESION, RECHAZO } from '../asistencia-sesion.mjs'
import { diaAnterior, hoyIso, validarFecha } from '../../lib/asistencia-servicio/fechas.mjs'
import { resumirCuadrilla } from '../../lib/asistencia-servicio/mapeo.mjs'
import {
  TIPO, URL_ACCION_DEFAULT, dialogoExcepcion, dialogoFecha,
  mensajeCancelado, mensajeConfirmado, mensajeCuadrilla, mensajeInicial,
} from './mensaje.mjs'
import {
  celdasParaMostrar, contextoDelDia, escribir, leerCuadrilla, planDe, razonesDeConfirmacion,
} from './operaciones.mjs'
import { fechaDeDialogo, leerEstado, novedadDeDialogo } from './dialogos.mjs'

// Un paso existe si y sólo si está en el mapa de rutas de abajo: un botón que emite un paso
// sin ruta cae en "acción desconocida" y el jefe de obra se come un error mudo.
export const PASO = Object.freeze({
  FECHA: 'fecha', OBRA: 'obra', EXCEPCION: 'excepcion',
  REGISTRAR: 'registrar', CANCELAR: 'cancelar',
})

/** Diálogos: el `callback_id` es lo que dice de qué formulario vuelve la respuesta. */
const CALLBACK = Object.freeze({ EXCEPCION: 'asistencia.excepcion', FECHA: 'asistencia.fecha' })

/** Clave reservada dentro de `marcas` donde vive el estado del formulario (no es una persona). */
const META = '__meta'

export const TEXTO = Object.freeze({
  PAYLOAD: 'No entendí esa acción. Volvé a escribir «asistencia» para empezar de nuevo.',
  SIN_PERMISO: 'No tenés habilitada la carga de asistencia. Pedísela a Dirección.',
  SIN_SESION: 'Este formulario ya se cerró. Escribí «asistencia» para abrir uno nuevo.',
  SESION_AJENA: 'Ese formulario lo abrió otra persona. Escribí «asistencia» para abrir el tuyo.',
  SESION_VENCIDA: 'El formulario venció. Escribí «asistencia» para abrir uno nuevo.',
  ELEGI_OBRA: 'Primero elegí la obra.',
  PERSONA_DESCONOCIDA: 'Esa persona ya no figura en la obra. Volvé a elegir la obra.',
  SIN_DIALOGO: 'No se pudo abrir el formulario. Probá de nuevo desde el celular.',
  YA_REGISTRADA: 'Esta carga ya se registró. No se escribió dos veces.',
  REVISAR_FORMULARIO: 'Revisá los campos marcados y volvé a guardar.',
  CUADRILLA_CAMBIO: 'La cuadrilla de la obra cambió en la planilla. Revisá la lista y volvé a apretar Registrar.',
  ERROR: 'No se pudo completar la acción. Probá de nuevo; si sigue igual, avisá a Dirección.',
})

const efimero = (texto) => ({ status: 200, body: { ephemeral_text: texto } })

const actualizar = (msg, extra = {}) => ({
  status: 200,
  body: { update: { message: msg.message, props: msg.props }, skip_slack_parsing: true, ...extra },
})

/**
 * Crea el ruteador. Todo lo externo se inyecta, para poder probar el flujo entero sin red
 * ni base: núcleo, sesiones, permisos, catálogo de motivos, cliente de Mattermost y reloj.
 *
 * @param {{google:object, nucleo:object, sesiones:object, permisos:object, motivos:object,
 *          mattermost:object, port?:object, jornadaConfig?:Function, auditar?:Function,
 *          url?:string, hoy?:Function, log?:object}} deps
 * @returns {(pedido:{payload:object})=>Promise<{status:number, body:object}>}
 */
export function crearRuteadorAcciones(deps = {}) {
  validarDeps(deps)
  const d = {
    ...deps,
    url: deps.url ?? URL_ACCION_DEFAULT,
    hoy: deps.hoy ?? (() => hoyIso()),
    auditar: deps.auditar ?? (async () => ({ ok: true })),
    port: deps.port ?? null,
  }
  return async function rutear({ payload } = {}) {
    try {
      return await despachar(d, payload)
    } catch (e) {
      d.log?.error?.('asistencia-mm: acción fallida', { error: sanitizarError(e) })
      return efimero(TEXTO.ERROR)
    }
  }
}

const NUCLEO_REQUERIDO = [
  'listarObrasPorFecha', 'listarPersonalPorObraYFecha', 'planificarAsistencia', 'registrarAsistencia',
]

function validarDeps(deps) {
  const faltan = ['google', 'nucleo', 'sesiones', 'permisos', 'motivos', 'mattermost']
    .filter((k) => !deps?.[k])
  for (const f of NUCLEO_REQUERIDO) {
    if (deps?.nucleo && typeof deps.nucleo[f] !== 'function') faltan.push(`nucleo.${f}`)
  }
  if (typeof deps?.motivos?.validarNovedad !== 'function') faltan.push('motivos.validarNovedad')
  if (faltan.length) throw new Error(`crearRuteadorAcciones: faltan dependencias: ${faltan.join(', ')}`)
}

// ── BORDE: identidad, permiso, sesión ───────────────────────────────────────────

/**
 * Deja constancia de un rechazo. Nunca cambia el veredicto ni el mensaje al usuario: si la
 * auditoría no se puede escribir, el rechazo se devuelve igual.
 */
async function anotarRechazo(d, payload, { motivo, detalle, dialogo = false }) {
  await Promise.resolve(d.auditar(EVENTO.DENIED, payloadRechazo({
    origen: dialogo ? ORIGEN.DIALOGO : ORIGEN.ACCION,
    motivo,
    detalle,
    actor: { plataforma_user_id: payload?.user_id ?? null, plataforma_username: payload?.user_name ?? null },
    channelId: payload?.channel_id ?? null,
    teamId: payload?.team_id ?? null,
  }))).catch(() => {})
}

async function despachar(d, payload) {
  const p = normalizarPayload(payload)
  if (!p.ok) {
    // Un payload que no se entiende también se anota: es la forma que tiene un intento
    // de sondeo de verse desde afuera.
    await anotarRechazo(d, payload, { motivo: 'payload', detalle: 'payload_invalido' })
    return { status: 400, body: { ephemeral_text: TEXTO.PAYLOAD } }
  }
  const permiso = await d.permisos.tienePermiso(d.port, { plataformaUserId: p.userId })
  if (!permiso.ok) {
    await anotarRechazo(d, payload, { motivo: 'permiso', detalle: permiso.motivo, dialogo: p.dialogo })
    return p.dialogo ? { status: 200, body: { error: TEXTO.SIN_PERMISO } } : efimero(TEXTO.SIN_PERMISO)
  }
  const s = await d.sesiones.abiertaDe({ plataformaUserId: p.userId })
  if (!s.ok) {
    const texto = s.motivo === RECHAZO.VENCIDA ? TEXTO.SESION_VENCIDA
      : s.motivo === RECHAZO.AJENA ? TEXTO.SESION_AJENA : TEXTO.SIN_SESION
    // Formulario ajeno, vencido o inexistente: los tres se distinguen en `error_code`.
    await anotarRechazo(d, payload, {
      motivo: 'sesion',
      detalle: s.motivo === RECHAZO.VENCIDA ? 'sesion_vencida'
        : s.motivo === RECHAZO.AJENA ? 'sesion_ajena' : 'sesion_inexistente',
      dialogo: p.dialogo,
    })
    return p.dialogo ? { status: 200, body: { error: texto } } : efimero(texto)
  }
  return atender(d, p, s.sesion)
}

/** Un pedido de acción y uno de diálogo son dos formas distintas: se normalizan a una. */
function normalizarPayload(payload) {
  if (!payload || typeof payload !== 'object') return { ok: false }
  const userId = String(payload.user_id ?? '').trim()
  if (!userId) return { ok: false }
  const comun = {
    ok: true, userId,
    username: payload.user_name ? String(payload.user_name) : null,
    channelId: payload.channel_id ?? null,
    teamId: payload.team_id ?? null,
    postId: payload.post_id ?? null,
    triggerId: payload.trigger_id ?? null,
  }
  if (payload.type === 'dialog_submission' || payload.callback_id) {
    return {
      ...comun, dialogo: true, callbackId: String(payload.callback_id ?? ''),
      cancelado: payload.cancelled === true,
      estado: leerEstado(payload.state), submission: payload.submission ?? {},
    }
  }
  const ctx = payload.context && typeof payload.context === 'object' ? payload.context : {}
  return {
    ...comun, dialogo: false, paso: String(ctx.paso ?? ''),
    valor: ctx.valor ?? null,
    tipo: ctx.tipo ?? null, // qué clase de excepción: la eligió el desplegable, no un campo
    seleccion: ctx.selected_option ?? null,
    confirmar: ctx.confirmar === true,
  }
}

async function atender(d, p, sesion) {
  const anotar = (detalle) => anotarRechazo(d, {
    user_id: p.userId, user_name: p.username, channel_id: p.channelId, team_id: p.teamId,
  }, { motivo: 'payload', detalle, dialogo: p.dialogo })

  if (p.dialogo) {
    if (p.cancelado) return { status: 200, body: {} }
    if (p.callbackId === CALLBACK.FECHA) return pasoFechaEscrita(d, p, sesion)
    if (p.callbackId === CALLBACK.EXCEPCION) return pasoAplicar(d, p, sesion)
    await anotar('formulario_invalido')
    return { status: 200, body: { error: TEXTO.PAYLOAD } }
  }
  const pasos = {
    [PASO.FECHA]: pasoFecha, [PASO.OBRA]: pasoObra, [PASO.EXCEPCION]: pasoExcepcion,
    [PASO.REGISTRAR]: pasoRegistrar, [PASO.CANCELAR]: pasoCancelar,
  }
  const fn = pasos[p.paso]
  if (!fn) {
    await anotar('paso_desconocido')
    return efimero(TEXTO.PAYLOAD)
  }
  return fn(d, p, sesion)
}

// ── ESTADO DEL FORMULARIO, dentro de la sesión ──────────────────────────────────

const metaDe = (sesion) => sesion?.marcas?.[META] ?? {}

function marcasDe(sesion) {
  const m = { ...(sesion?.marcas ?? {}) }
  delete m[META]
  return m
}

const postDe = (sesion) => sesion?.root_post_id ?? metaDe(sesion).post_id ?? null

/** Guarda excepciones + estado del formulario. Cambiar las marcas invalida el plan previo. */
function guardar(d, sesion, { marcas = {}, fecha, obra = null, refs = [], postId }) {
  return d.sesiones.guardarMarcas(sesion.id, {
    ...marcas,
    [META]: { fecha, obra, refs, post_id: postId ?? postDe(sesion) ?? null },
  })
}

function renderCuadrilla(d, c, { marcas, aviso = null, confirmacion = null }) {
  return mensajeCuadrilla({
    fecha: c.fecha, obra: c.obra, jornada: c.jornada, personal: c.personal, marcas,
    resumen: resumirCuadrilla({ personal: c.personal, marcas, jornada: c.jornada }),
    url: d.url, aviso, confirmacion,
  })
}

// ── PASOS ───────────────────────────────────────────────────────────────────────

/** Botones Hoy / Ayer / Otra fecha…. La futura se rechaza antes de tocar la planilla. */
async function pasoFecha(d, p, sesion) {
  if (p.valor === 'otra') {
    const abierto = await abrirDialogo(d, dialogoFecha({
      fecha: metaDe(sesion).fecha ?? d.hoy(), triggerId: p.triggerId, url: d.url,
      estado: { sesion_id: sesion.id },
    }))
    return abierto ? { status: 200, body: {} } : efimero(TEXTO.SIN_DIALOGO)
  }
  const hoy = d.hoy()
  return irAInicial(d, p, sesion, p.valor === 'ayer' ? diaAnterior(hoy) : hoy)
}

/** El diálogo "Otra fecha…": vuelve por la API, así que el post se actualiza a mano. */
async function pasoFechaEscrita(d, p, sesion) {
  const f = fechaDeDialogo({ submission: p.submission, hoy: d.hoy() })
  if (!f.ok) return { status: 200, body: { errors: f.errors } }
  const r = await irAInicial(d, p, sesion, f.fecha)
  if (r.body?.update) await actualizarPost(d, sesion, r.body.update)
  return { status: 200, body: r.body?.ephemeral_text ? { error: r.body.ephemeral_text } : {} }
}

/** Publica el mensaje inicial para una fecha. Cambiar de fecha BORRA las excepciones. */
async function irAInicial(d, p, sesion, fecha) {
  const v = validarFecha(fecha, { hoy: d.hoy() })
  if (!v.ok) return efimero(v.error)
  const ctx = await contextoDelDia(d, { fecha: v.fecha })
  const obras = ctx.ok ? ctx.obras : []
  await d.sesiones.guardarContexto(sesion.id, { fechaOperativa: v.fecha })
  await guardar(d, sesion, { marcas: {}, fecha: v.fecha, obra: null, refs: [], postId: p.postId })
  return actualizar(mensajeInicial({
    fecha: v.fecha, obras, jornada: ctx.ok ? ctx.jornada : null, url: d.url,
    aviso: ctx.ok ? null : ctx.texto,
  }))
}

/** Elegir la obra: llega la cuadrilla entera, ya precargada. Es el segundo de los dos toques. */
async function pasoObra(d, p, sesion) {
  const clave = String(p.seleccion ?? '').trim()
  if (!clave) return efimero(TEXTO.ELEGI_OBRA)
  const v = validarFecha(metaDe(sesion).fecha ?? sesion.fecha_operativa ?? d.hoy(), { hoy: d.hoy() })
  if (!v.ok) return efimero(v.error)
  const c = await leerCuadrilla(d, { fecha: v.fecha, claveObra: clave })
  if (!c.ok) {
    const ctx = await contextoDelDia(d, { fecha: v.fecha })
    return actualizar(mensajeInicial({
      fecha: v.fecha, obras: ctx.ok ? ctx.obras : [], jornada: ctx.ok ? ctx.jornada : null,
      url: d.url, aviso: c.texto,
    }))
  }
  await d.sesiones.guardarContexto(sesion.id, {
    fechaOperativa: v.fecha, claveObra: clave,
    spreadsheetId: c.ctx.spreadsheet_id, pestana: c.ctx.pestana,
  })
  await guardar(d, sesion, { marcas: {}, fecha: v.fecha, obra: clave, refs: refsDe(c), postId: p.postId })
  await d.auditar(EVENTO.SHEET_READ, {
    status: 'read', origen: 'mattermost', fecha_operativa: v.fecha, sheet_name: c.ctx.pestana,
    obra_normalizada: clave, mattermost_user_id: p.userId, cantidad_trabajadores: c.personal.length,
  })
  return actualizar(renderCuadrilla(d, c, { marcas: {} }))
}

const refsDe = (c) => c.personal.map((x) => x.ref)

/** "Marcar excepción": abre el diálogo de UNA persona y deja el desplegable limpio. */
const TIPOS_EXCEPCION = new Set([TIPO.AUSENCIA, TIPO.PARCIAL, TIPO.EXTRA])

/**
 * La respuesta de error de un diálogo, SIEMPRE con una frase en castellano arriba.
 *
 * POR QUÉ (31/07). El cliente de Mattermost, cuando la respuesta trae sólo `errors` por campo,
 * pone de su cosecha un encabezado en inglés: "Submission failed with validation errors". Si en
 * cambio viene un `error` de primer nivel, muestra ESE texto. Así que se manda siempre uno: el
 * jefe de obra no tiene por qué leer inglés para entender qué corregir.
 */
function errorDeFormulario(n) {
  const campos = n?.errors && Object.keys(n.errors).length ? n.errors : null
  const arriba = n?.error
    ?? (campos ? Object.values(n.errors).find((v) => typeof v === 'string') : null)
    ?? TEXTO.REVISAR_FORMULARIO
  return { ...(campos ? { errors: campos } : {}), error: arriba }
}

/**
 * Los motivos que corresponden a ESTE tipo, pedidos al catálogo — nunca una lista escrita acá.
 *
 * · ausencia → los de "no vino"
 * · parcial  → los de jornada incompleta (se pregunta por media hora menos que la jornada, que
 *              es la forma de decirle al catálogo "esto es una jornada parcial")
 * · extra    → NINGUNO: el núcleo calcula el extra y no hay novedad que explicar
 */
function motivosDelTipo(d, tipo, jornada) {
  if (tipo === TIPO.EXTRA) return []
  if (tipo === TIPO.AUSENCIA) return d.motivos.motivosPara({ presente: false, horas: 0 })
  const j = Number.isFinite(jornada?.horas) && !jornada?.requiere_manual ? Number(jornada.horas) : null
  return d.motivos.motivosPara({ presente: true, horas: j == null ? null : j - 0.5, jornada: j })
}

async function pasoExcepcion(d, p, sesion) {
  const meta = metaDe(sesion)
  if (!meta.obra) return efimero(TEXTO.ELEGI_OBRA)
  const c = await leerCuadrilla(d, { fecha: meta.fecha, claveObra: meta.obra })
  if (!c.ok) return efimero(c.texto)
  const marcas = marcasDe(sesion)
  const persona = c.personal.find((x) => x.ref === String(p.seleccion ?? ''))
  if (!persona) return efimero(TEXTO.PERSONA_DESCONOCIDA)
  if (persona.bloqueado) return efimero(`${persona.nombre}: ${persona.bloqueado}.`)
  // El TIPO decide qué formulario se abre y, sobre todo, QUÉ MOTIVOS entran en él. Antes se
  // pasaba el catálogo entero y por eso se podía elegir "trabajó 5 h · Faltó con aviso".
  const tipo = TIPOS_EXCEPCION.has(p.tipo) ? p.tipo : TIPO.PARCIAL
  const abierto = await abrirDialogo(d, dialogoExcepcion({
    tipo,
    persona: { ...persona, novedad: marcas[persona.ref] ?? persona },
    motivos: motivosDelTipo(d, tipo, c.jornada),
    obras: c.obras.filter((o) => o.clave !== meta.obra),
    jornada: c.jornada, triggerId: p.triggerId, url: d.url,
    estado: { sesion_id: sesion.id, ref: persona.ref, tipo },
  }))
  if (!abierto) return efimero(TEXTO.SIN_DIALOGO)
  return actualizar(renderCuadrilla(d, c, { marcas }))
}

/** El diálogo de excepción, ya enviado: se valida, se guarda y se re-renderiza el post. */
async function pasoAplicar(d, p, sesion) {
  const meta = metaDe(sesion)
  const ref = String(p.estado?.ref ?? '')
  if (!meta.obra || !ref) return { status: 200, body: { error: TEXTO.SIN_SESION } }
  const c = await leerCuadrilla(d, { fecha: meta.fecha, claveObra: meta.obra })
  if (!c.ok) return { status: 200, body: { error: c.texto } }
  const persona = c.personal.find((x) => x.ref === ref)
  if (!persona) return { status: 200, body: { error: TEXTO.PERSONA_DESCONOCIDA } }
  const n = novedadDeDialogo(d, {
    submission: p.submission, jornada: c.jornada,
    obrasValidas: new Set(c.obras.map((o) => o.clave)),
    tipo: TIPOS_EXCEPCION.has(p.estado?.tipo) ? p.estado.tipo : null,
  })
  if (!n.ok) return { status: 200, body: errorDeFormulario(n) }
  const marcas = { ...marcasDe(sesion), [ref]: n.novedad }
  await guardar(d, sesion, { marcas, fecha: c.fecha, obra: meta.obra, refs: refsDe(c), postId: p.postId })
  await actualizarPost(d, sesion, renderCuadrilla(d, c, { marcas }))
  return { status: 200, body: {} }
}

/** Registrar: planifica, pide el sí que falte, cierra la sesión y recién ahí escribe. */
async function pasoRegistrar(d, p, sesion) {
  const meta = metaDe(sesion)
  if (!meta.obra) return efimero(TEXTO.ELEGI_OBRA)
  const v = validarFecha(meta.fecha, { hoy: d.hoy() })
  if (!v.ok) return efimero(v.error)
  const actor = { plataforma_user_id: p.userId, plataforma_username: p.username }
  const marcas = marcasDe(sesion)
  const r = await planDe(d, { fecha: v.fecha, claveObra: meta.obra, marcas, actor })
  if (!r.ok) {
    return r.cuadrilla
      ? actualizar(renderCuadrilla(d, r.cuadrilla, { marcas, aviso: r.texto }), { ephemeral_text: r.texto })
      : efimero(r.texto)
  }
  const c = r.cuadrilla
  if (cambio(meta.refs, refsDe(c))) {
    await guardar(d, sesion, { marcas, fecha: v.fecha, obra: meta.obra, refs: refsDe(c), postId: p.postId })
    return actualizar(renderCuadrilla(d, c, { marcas, aviso: TEXTO.CUADRILLA_CAMBIO }),
      { ephemeral_text: TEXTO.CUADRILLA_CAMBIO })
  }
  const razones = razonesDeConfirmacion(r.plan)
  if (razones.length && !p.confirmar) {
    return actualizar(renderCuadrilla(d, c, {
      marcas, confirmacion: { texto: razones.join(' ') }, aviso: `${razones.join(' ')} Apretá «Registrar igual» si querés seguir.`,
    }))
  }
  return confirmarYEscribir(d, p, sesion, { plan: r.plan, cuadrilla: c, novedades: r.novedades, marcas })
}

/** ¿La obra cambió de gente desde que el jefe miró la lista? */
function cambio(antes, ahora) {
  const a = [...(antes ?? [])].sort()
  const b = [...(ahora ?? [])].sort()
  return a.length !== b.length || a.some((x, i) => x !== b[i])
}

/**
 * El único punto de escritura. `confirmar` es un UPDATE condicionado a que la sesión siga
 * abierta: si el jefe aprieta Registrar dos veces, la segunda pierde la carrera y no
 * escribe. Si la escritura falla, la sesión se cierra como `fallida` para que la clave de
 * idempotencia NO quede quemada y se pueda reintentar.
 */
async function confirmarYEscribir(d, p, sesion, { plan, cuadrilla, novedades, marcas }) {
  const c = await d.sesiones.confirmar(sesion.id, { idempotencyKey: plan.idempotency_key })
  if (!c.ok || c.duplicado) return efimero(TEXTO.YA_REGISTRADA)
  await d.auditar(EVENTO.CONFIRMED, {
    status: 'confirmed', origen: 'mattermost', fecha_operativa: plan.fecha, sheet_name: plan.pestana,
    obra_normalizada: plan.clave_obra, idempotency_key: plan.idempotency_key,
    mattermost_user_id: p.userId,
  })
  const r = await escribir(d, { plan, confirmar: true })
  if (!r.ok) {
    await d.sesiones.cerrar(sesion.id, ESTADO_SESION.FALLIDA)
    await d.auditar(r.motivo === MOTIVO_NUCLEO.CONFLICTO_CONCURRENCIA ? EVENTO.CONFLICT : EVENTO.FAILED, {
      status: 'failed', origen: 'mattermost', fecha_operativa: plan.fecha,
      obra_normalizada: plan.clave_obra, error_code: r.motivo ?? null, mattermost_user_id: p.userId,
    })
    return actualizar(renderCuadrilla(d, cuadrilla, { marcas, aviso: r.texto }), { ephemeral_text: r.texto })
  }
  await d.auditar(EVENTO.WRITTEN, {
    status: 'written', origen: 'mattermost', fecha_operativa: plan.fecha, sheet_name: plan.pestana,
    obra_normalizada: plan.clave_obra, idempotency_key: plan.idempotency_key,
    mattermost_user_id: p.userId, cantidad_trabajadores: plan.resumen?.trabajadores ?? 0, novedades,
  })
  return actualizar(mensajeConfirmado({
    resumen: plan.resumen, celdas: celdasParaMostrar(r), actor: { username: p.username, userId: p.userId },
    fecha: plan.fecha, obra: cuadrilla.obra, pestana: plan.pestana, columna: plan.columna_letra,
  }))
}

/** Cancelar: se cierra la sesión y el post queda diciendo que no se escribió nada. */
async function pasoCancelar(d, p, sesion) {
  await d.sesiones.cerrar(sesion.id, ESTADO_SESION.CANCELADA)
  await d.auditar(EVENTO.CANCELLED, {
    status: 'cancelled', origen: 'mattermost', mattermost_user_id: p.userId,
    fecha_operativa: metaDe(sesion).fecha ?? null,
  })
  return actualizar(mensajeCancelado())
}

// ── CLIENTE DE MATTERMOST (inyectado) ───────────────────────────────────────────

/** Abre un diálogo. Un fallo acá NO tumba la acción: se avisa y el post queda como estaba. */
async function abrirDialogo(d, dialogo) {
  if (!dialogo.trigger_id || typeof d.mattermost?.abrirDialogo !== 'function') return false
  try {
    const r = await d.mattermost.abrirDialogo(dialogo)
    return r?.ok !== false
  } catch (e) {
    d.log?.error?.('asistencia-mm: no se pudo abrir el diálogo', { error: sanitizarError(e) })
    return false
  }
}

/** La respuesta de un diálogo no puede re-renderizar el post: eso se hace por la API. */
async function actualizarPost(d, sesion, { message, props }) {
  const postId = postDe(sesion)
  if (!postId || typeof d.mattermost?.actualizarPost !== 'function') {
    d.log?.warn?.('asistencia-mm: sin post que actualizar tras el diálogo')
    return false
  }
  try {
    const r = await d.mattermost.actualizarPost({ postId, message, props })
    return r?.ok !== false
  } catch (e) {
    d.log?.error?.('asistencia-mm: no se pudo actualizar el post', { error: sanitizarError(e) })
    return false
  }
}
