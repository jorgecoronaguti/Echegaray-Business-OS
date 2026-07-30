// API DE LA PANTALLA DE ASISTENCIA — tres rutas, sin lógica de negocio propia.
//
// REGLA QUE GOBIERNA ESTE ARCHIVO: acá no se decide nada que ya decida el núcleo. Qué
// fila es cada persona, cuántas horas vale la jornada, cómo se separa normal de extra,
// qué celda se escribe, cómo se detecta un conflicto y cómo se audita: todo eso ya está
// resuelto en `lib/tools/jornales-asistencia.mjs`, `lib/horas-extra.mjs`,
// `lib/asistencia-permisos.mjs` y `lib/asistencia-auditoria.mjs`. Este archivo traduce un
// pedido HTTP a esas funciones y traduce la respuesta a castellano.
//
// La escritura pasa SIEMPRE por `registrarAsistencia`, que ya hace
// validar → releer → comparar huella → escribir en batch → releer → verificar.
// Nadie escribe en Google Sheets desde acá.

import { createHash, randomUUID } from 'node:crypto'
import {
  contextoParaFecha, listarObrasPorFecha, listarPersonalPorObraYFecha,
  planificarAsistencia, registrarAsistencia, SIN_CAMBIO, MOTIVO as MOTIVO_NUCLEO,
} from '../tools/jornales-asistencia.mjs'
import { obrasDeBloque } from '../jornales-estructura.mjs'
import { normalizarHoras } from '../horas-extra.mjs'
import { tienePermiso } from '../asistencia-permisos.mjs'
import { crearAuditor, EVENTO, payloadConfirmacion, sanitizarError } from '../asistencia-auditoria.mjs'
import { validarFecha, hoyIso } from './fechas.mjs'
import { mapearObras, mapearPersona, marcaDe, mensajeDeMotivo, resolverJornada } from './mapeo.mjs'
import { crearRegistroMemoria } from './idempotencia.mjs'
import { dameMotivos, dameJornadaConfig } from './dependencias.mjs'

const MAX_ITEMS = 300

const err = (status, error) => ({ status, body: { error } })
const ok = (body) => ({ status: 200, body })

/** Crea la API. Todo lo externo se inyecta: en los tests entra un doble, no la red. */
export function crearApi({
  google, port = null, motivos = null, jornadaConfig = null,
  idempotencia = crearRegistroMemoria(), crearAuditorFn = crearAuditor, hoy = hoyIso,
} = {}) {
  const dep = { google, port, idempotencia, crearAuditorFn, hoy }
  const cargar = async () => {
    dep.motivos ??= await dameMotivos(motivos)
    dep.jornadaConfig ??= await dameJornadaConfig(jornadaConfig)
    return dep
  }
  return {
    contexto: (p) => cargar().then((d) => contexto(d, p)),
    cuadrilla: (p) => cargar().then((d) => cuadrilla(d, p)),
    registrar: (p) => cargar().then((d) => registrar(d, p)),
  }
}

/** Identidad + permiso. Sin identidad no se opera: sin ella no hay a quién auditar. */
async function guardia(dep, actor, auditar) {
  if (!actor?.userId) return err(401, 'Tu sesión venció. Volvé a pedir el enlace en Mattermost.')
  const permiso = await tienePermiso(dep.port, { plataformaUserId: actor.userId })
  if (permiso.ok) return null
  if (auditar) await auditar(EVENTO.DENIED, { status: 'denied', motivo: permiso.motivo, mattermost_user_id: actor.userId })
  return err(403, 'No tenés habilitada la carga de asistencia. Pedísela a Dirección.')
}

/** Jornada del día: configuración (feriado / media jornada) sobre calibración de planilla. */
async function jornadaDe(dep, { fecha, planilla }) {
  const config = await dep.jornadaConfig(dep.port, { fecha })
  return resolverJornada({ config, planilla })
}

/** GET /asistencia/api/contexto — fecha, jornada, obras del día y catálogo de motivos. */
async function contexto(dep, { actor, params } = {}) {
  const g = await guardia(dep, actor)
  if (g) return g
  const f = validarFecha(params?.get('fecha'), { hoy: dep.hoy() })
  if (!f.ok) return err(400, f.error)
  const r = await listarObrasPorFecha(dep.google, { fecha: f.fecha })
  if (!r.ok) return err(409, mensajeDeMotivo(r.motivo, { fecha: f.fecha }))
  const jornada = await jornadaDe(dep, { fecha: f.fecha, planilla: r.jornada })
  return ok({
    fecha: f.fecha,
    hoy: dep.hoy(),
    jornada,
    obras: mapearObras(r.obras),
    motivos: dep.motivos.CATALOGO ?? [],
    pestana: r.pestana ?? null,
  })
}

/** GET /asistencia/api/cuadrilla — la gente de esa obra ese día, ya precargada. */
async function cuadrilla(dep, { actor, params, correlationId } = {}) {
  const auditar = dep.crearAuditorFn(dep.port, { correlationId })
  const g = await guardia(dep, actor, auditar)
  if (g) return g
  const f = validarFecha(params?.get('fecha'), { hoy: dep.hoy() })
  if (!f.ok) return err(400, f.error)
  const clave = String(params?.get('obra') ?? '').trim()
  if (!clave) return err(400, 'Elegí una obra.')
  const r = await listarPersonalPorObraYFecha(dep.google, { fecha: f.fecha, claveObra: clave })
  if (!r.ok) {
    const status = r.motivo === MOTIVO_NUCLEO.OBRA_DESCONOCIDA ? 404 : 409
    return { status, body: { error: mensajeDeMotivo(r.motivo, { fecha: f.fecha }), personal: [] } }
  }
  const jornada = await jornadaDe(dep, { fecha: f.fecha, planilla: r.jornada })
  await auditar(EVENTO.SHEET_READ, {
    status: 'read', origen: 'web', fecha_operativa: f.fecha, sheet_name: r.pestana,
    obra_normalizada: clave, mattermost_user_id: actor.userId, cantidad_trabajadores: r.personal.length,
  })
  return ok({
    fecha: f.fecha,
    obra: { clave: r.obra.clave, nombre: r.obra.etiqueta ?? r.obra.clave },
    jornada,
    personal: r.personal.map((p) => mapearPersona(p, { jornada })),
  })
}

/** Horas inválidas → frase, no código. */
function mensajeHoras(h) {
  if (h.motivo === 'vacio') return 'faltan las horas.'
  if (h.motivo === 'negativo') return 'las horas no pueden ser negativas.'
  if (h.motivo === 'mayor_al_maximo') return `no puede tener más de ${h.max} horas en un día.`
  return 'las horas tienen que ser un número.'
}

/**
 * Valida cada persona y arma las marcas del núcleo.
 * La validación del motivo la hace el catálogo del frente A: acá no se replica la regla.
 */
function armarMarcas({ items, jornada, motivos, obrasValidas }) {
  const marcas = []
  const novedades = []
  const vistos = new Set()
  for (const it of items) {
    const ref = typeof it?.ref === 'string' ? it.ref.trim() : ''
    if (!ref) return { ok: false, error: 'Llegó una persona sin identificar. Recargá la pantalla.' }
    if (vistos.has(ref)) return { ok: false, error: 'Llegó dos veces la misma persona. Recargá la pantalla.' }
    vistos.add(ref)
    const quien = typeof it?.nombre === 'string' && it.nombre.trim() ? it.nombre.trim() : 'Esa persona'
    if (it?.sin_cambio === true) { marcas.push({ ref, estado: SIN_CAMBIO }); continue }
    const presente = it?.presente === true
    let horas = 0
    if (presente) {
      const h = normalizarHoras(it?.horas)
      if (!h.ok) return { ok: false, error: `${quien}: ${mensajeHoras(h)}` }
      horas = h.horas
    }
    const obraRealizada = it?.obra_realizada ? String(it.obra_realizada) : null
    if (obraRealizada && !obrasValidas.has(obraRealizada)) {
      return { ok: false, error: `${quien}: esa obra no figura en la planilla para esa fecha.` }
    }
    const v = motivos.validarNovedad({
      presente, horas, jornada,
      motivo: it?.motivo ? String(it.motivo) : null,
      aclaracion: it?.aclaracion ? String(it.aclaracion) : null,
      obra_realizada: obraRealizada,
    })
    if (!v.ok) return { ok: false, error: `${quien}: ${v.error}` }
    const novedad = { presente, horas, motivo: v.novedad?.motivo ?? (it?.motivo || null) }
    marcas.push(marcaDe({ ref, novedad, jornada }))
    novedades.push({ ref, nombre: quien, ...novedad, aclaracion: it?.aclaracion ?? null, obra_realizada: obraRealizada })
  }
  return { ok: true, marcas, novedades }
}

/** Valida la forma del cuerpo antes de tocar la planilla. */
function validarCuerpo(body, hoy) {
  if (!body || typeof body !== 'object') return { ok: false, error: 'No llegó la carga.' }
  const f = validarFecha(body.fecha, { hoy })
  if (!f.ok) return { ok: false, error: f.error }
  const obra = String(body.obra ?? '').trim()
  if (!obra) return { ok: false, error: 'Elegí una obra.' }
  const items = Array.isArray(body.items) ? body.items : null
  if (!items?.length) return { ok: false, error: 'No hay ninguna persona para registrar.' }
  if (items.length > MAX_ITEMS) return { ok: false, error: 'Llegaron demasiadas personas en una sola carga.' }
  return { ok: true, fecha: f.fecha, obra, items }
}

/** Clave de deduplicación: la del cliente Y la que calcula el servidor. Las dos. */
function claveDedup(delCliente, delPlan) {
  return createHash('sha256').update(`${String(delCliente ?? '')}|${delPlan}`).digest('hex').slice(0, 32)
}

/** POST /asistencia/api/registrar — el único camino de escritura. */
async function registrar(dep, { actor, body, correlationId = randomUUID() } = {}) {
  const auditar = dep.crearAuditorFn(dep.port, { correlationId })
  const g = await guardia(dep, actor, auditar)
  if (g) return g
  const c = validarCuerpo(body, dep.hoy())
  if (!c.ok) return err(400, c.error)

  const ctx = await contextoParaFecha(dep.google, { fecha: c.fecha })
  if (!ctx.ok) return err(409, mensajeDeMotivo(ctx.motivo, { fecha: c.fecha }))
  const obrasValidas = new Set(obrasDeBloque(ctx.grid, ctx.bloque).map((o) => o.clave))
  if (!obrasValidas.has(c.obra)) {
    return err(404, mensajeDeMotivo(MOTIVO_NUCLEO.OBRA_DESCONOCIDA, { fecha: c.fecha }))
  }
  const jornada = await jornadaDe(dep, { fecha: c.fecha, planilla: ctx.jornada })
  const m = armarMarcas({ items: c.items, jornada, motivos: dep.motivos, obrasValidas })
  if (!m.ok) return err(400, m.error)

  const actorNucleo = { plataforma_user_id: actor.userId, plataforma_username: actor.username ?? null }
  const plan = planificarAsistencia(ctx, { claveObra: c.obra, marcas: m.marcas, actor: actorNucleo })
  const bloqueada = plan.items.find((i) => i.bloqueada)
  if (bloqueada) return err(409, mensajeDeMotivo(bloqueada.bloqueada, { fecha: c.fecha }))

  const clave = claveDedup(body.idempotency_key, plan.idempotency_key)
  const previo = await dep.idempotencia.ver(clave)
  if (previo.hit) return ok({ ...previo.valor, repetido: true })

  const pendiente = confirmacionPendiente(plan, body)
  if (pendiente) return pendiente
  return escribir(dep, { plan, clave, actor: actorNucleo, novedades: m.novedades, body, auditar, correlationId })
}

/** Pisar una carga previa o reemplazar una fórmula que no se entiende exige un sí aparte. */
function confirmacionPendiente(plan, body) {
  if (plan.requiere_confirmacion_sobrescritura && body.confirmar_sobrescritura !== true) {
    return {
      status: 409,
      body: {
        requiere_confirmacion: 'sobrescritura',
        error: `${mensajeDeMotivo('sobrescritura_no_confirmada')} ¿Los reemplazo?`,
        resumen: plan.resumen,
      },
    }
  }
  if (plan.requiere_confirmacion_formula && body.confirmar_formula !== true) {
    return {
      status: 409,
      body: {
        requiere_confirmacion: 'formula',
        error: `${mensajeDeMotivo('reemplazo_formula_no_confirmado')} ¿La reemplazo igual?`,
        resumen: plan.resumen,
      },
    }
  }
  return null
}

/** Escribe (o declara que no había nada que escribir), audita y responde. */
async function escribir(dep, { plan, clave, actor, novedades, body, auditar, correlationId }) {
  const base = { actor, plan, sesion: null, confirmadoEn: new Date().toISOString() }
  if (!plan.escribibles.length) {
    return ok({
      ok: true, celdas: [], resumen: plan.resumen, correlation_id: correlationId,
      nota: 'No había nada para cambiar: la planilla ya decía lo mismo.',
    })
  }
  await auditar(EVENTO.CONFIRMED, {
    status: 'confirmed', origen: 'web', fecha_operativa: plan.fecha, sheet_name: plan.pestana,
    obra_normalizada: plan.clave_obra, idempotency_key: plan.idempotency_key,
    mattermost_user_id: actor.plataforma_user_id,
  })
  let resultado
  try {
    resultado = await registrarAsistencia(dep.google, {
      plan,
      confirmarSobrescritura: body.confirmar_sobrescritura === true,
      confirmarReemplazoFormula: body.confirmar_formula === true,
    })
  } catch (e) {
    resultado = { ok: false, motivo: 'error_escribiendo', error: sanitizarError(e), celdas: [] }
  }
  if (!resultado.ok) {
    const evento = resultado.motivo === MOTIVO_NUCLEO.CONFLICTO_CONCURRENCIA ? EVENTO.CONFLICT : EVENTO.FAILED
    await auditar(evento, { ...payloadConfirmacion({ ...base, resultado, status: 'failed' }), origen: 'web', novedades })
    return err(409, mensajeDeMotivo(resultado.motivo, { fecha: plan.fecha }))
  }
  // El motivo, la aclaración y la obra realizada NO tienen columna en JORNALES: viven en
  // la auditoría, que es donde se pueden leer después sin fabricar un dato en la planilla.
  await auditar(EVENTO.WRITTEN, { ...payloadConfirmacion({ ...base, resultado, status: 'written' }), origen: 'web', novedades })
  const respuesta = {
    ok: true,
    celdas: resultado.celdas.map((c) => ({
      celda: c.celda_a1, nombre: c.nombre_original,
      horas: c.new_total_hours, normales: c.new_normal_hours, extra: c.new_extra_hours,
    })),
    resumen: plan.resumen,
    correlation_id: correlationId,
  }
  await dep.idempotencia.guardar(clave, respuesta)
  return ok(respuesta)
}
