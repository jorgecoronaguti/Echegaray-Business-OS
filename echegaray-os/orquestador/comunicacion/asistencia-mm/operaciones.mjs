// LO QUE LE PIDE ESTE FRENTE AL NÚCLEO. Nada más que eso.
//
// REGLA QUE GOBIERNA ESTE ARCHIVO: acá no se decide nada que ya decida el núcleo. Qué fila
// es cada persona, cuántas horas vale la jornada, cómo se separa normal de extra, qué celda
// se escribe, cómo se detecta un conflicto y cómo se verifica lo escrito: todo eso ya está
// resuelto en `lib/tools/jornales-asistencia.mjs`, `lib/horas-extra.mjs` y
// `lib/asistencia-motivos.mjs`. Este archivo traduce una intención de la interfaz a esas
// funciones, y traduce la respuesta a castellano.
//
// La escritura pasa SIEMPRE por `registrarAsistencia`, que ya hace
// validar → releer → comparar huella → escribir en batch → releer → verificar.
// Nadie escribe en Google Sheets desde acá.
//
// Todo lo externo llega inyectado en `deps`: en los tests entra un doble, no la red.

import { obrasDeBloque } from '../../lib/jornales-estructura.mjs'
import { SIN_CAMBIO } from '../../lib/tools/jornales-asistencia.mjs'
import { sanitizarError } from '../../lib/asistencia-auditoria.mjs'
import {
  mapearObras, mapearPersona, marcaDe, mensajeDeMotivo, novedadDe, resolverJornada,
} from '../../lib/asistencia-servicio/mapeo.mjs'

/** Horas de jornada como NÚMERO, que es lo que espera el validador de motivos.
 *  Pasarle el objeto entero lo deja siempre en `null` y deja de exigir motivo en una
 *  jornada parcial — el bug silencioso más caro que tiene esta traducción. */
export const jornadaNumero = (j) => (j?.requiere_manual ? null : (j?.horas ?? null))

const fallo = (motivo, fecha) => ({ ok: false, motivo, texto: mensajeDeMotivo(motivo, { fecha }) })

/** Jornada del día: la configuración (feriado / media jornada) sobre la calibración. */
async function jornadaDe(deps, { fecha, planilla }) {
  let config = null
  try {
    config = deps.jornadaConfig ? await deps.jornadaConfig(deps.port, { fecha }) : null
  } catch {
    config = null // sin configuración manda la planilla; nunca se inventa un número
  }
  return resolverJornada({ config, planilla })
}

/** Fecha + jornada + obras del día. Es lo que necesita el mensaje inicial. */
export async function contextoDelDia(deps, { fecha }) {
  const r = await deps.nucleo.listarObrasPorFecha(deps.google, { fecha })
  if (!r.ok) return fallo(r.motivo, fecha)
  return {
    ok: true, fecha,
    jornada: await jornadaDe(deps, { fecha, planilla: r.jornada }),
    obras: mapearObras(r.obras),
    pestana: r.pestana ?? null,
  }
}

/**
 * La cuadrilla de una obra ese día, ya precargada, más el contexto de la planilla y las
 * obras del día (que el diálogo de excepción necesita para "estuvo en otra obra").
 * Una sola lectura del Sheet: `listarPersonalPorObraYFecha` ya devuelve su propio contexto.
 */
export async function leerCuadrilla(deps, { fecha, claveObra }) {
  const r = await deps.nucleo.listarPersonalPorObraYFecha(deps.google, { fecha, claveObra })
  if (!r.ok) return fallo(r.motivo, fecha)
  const jornada = await jornadaDe(deps, { fecha, planilla: r.jornada })
  return {
    ok: true, fecha, ctx: r.ctx, jornada,
    obra: { clave: r.obra.clave, nombre: r.obra.etiqueta ?? r.obra.clave },
    obras: mapearObras(obrasDeBloque(r.ctx.grid, r.ctx.bloque)),
    personal: r.personal.map((p) => mapearPersona(p, { jornada })),
  }
}

/**
 * Valida cada persona con el catálogo de motivos y arma las marcas del núcleo.
 * Ninguna regla se replica acá: la validación es la del catálogo, la traducción a estado
 * del núcleo es la de `marcaDe`. Lo único propio es cortar cuando faltan las horas, que es
 * la forma de no fabricar el dato que la planilla no da.
 */
export function armarMarcas(deps, { personal, marcas, jornada, obrasValidas }) {
  const salida = []
  const novedades = []
  const jn = jornadaNumero(jornada)
  for (const p of personal) {
    const n = novedadDe(p, marcas)
    if (n.sin_cambio) { salida.push({ ref: p.ref, estado: SIN_CAMBIO }); continue }
    if (n.horas == null) {
      return { ok: false, texto: `${p.nombre}: faltan las horas. Marcalo con «Marcar excepción».` }
    }
    if (n.obra_realizada && !obrasValidas.has(n.obra_realizada)) {
      return { ok: false, texto: `${p.nombre}: esa obra no figura en la planilla para esa fecha.` }
    }
    const v = deps.motivos.validarNovedad({
      presente: n.presente === true, horas: n.horas, jornada: jn,
      motivo: n.motivo ?? null, aclaracion: n.aclaracion ?? null,
      obra_realizada: n.obra_realizada ?? null,
    })
    if (!v.ok) return { ok: false, texto: `${p.nombre}: ${v.error}` }
    salida.push(marcaDe({ ref: p.ref, novedad: n, jornada }))
    novedades.push({ ref: p.ref, nombre: p.nombre, ...v.novedad })
  }
  return { ok: true, marcas: salida, novedades }
}

/**
 * El plan de escritura: exactamente qué celdas se tocarían y cuáles no. NO escribe.
 * Relee la cuadrilla, así que también es el punto donde se detecta que la obra cambió
 * de gente desde que el jefe miró la lista.
 */
export async function planDe(deps, { fecha, claveObra, marcas, actor }) {
  const c = await leerCuadrilla(deps, { fecha, claveObra })
  if (!c.ok) return c
  const obrasValidas = new Set(c.obras.map((o) => o.clave))
  const m = armarMarcas(deps, { personal: c.personal, marcas, jornada: c.jornada, obrasValidas })
  if (!m.ok) return { ok: false, texto: m.texto, cuadrilla: c }
  const plan = deps.nucleo.planificarAsistencia(c.ctx, { claveObra, marcas: m.marcas, actor })
  const bloqueada = plan.items.find((i) => i.bloqueada)
  if (bloqueada) {
    return { ok: false, texto: mensajeDeMotivo(bloqueada.bloqueada, { fecha }), cuadrilla: c }
  }
  return { ok: true, plan, cuadrilla: c, novedades: m.novedades }
}

/** ¿Este plan toca algo que exige un sí aparte del jefe? Y por qué, en castellano. */
export function razonesDeConfirmacion(plan) {
  const r = plan?.resumen ?? {}
  const razones = []
  if (plan?.requiere_confirmacion_sobrescritura) {
    razones.push(`Se pisan ${r.celdas_modificadas} carga(s) que ya estaban en la planilla.`)
  }
  if (plan?.requiere_confirmacion_formula) {
    razones.push(`Hay ${r.reemplazan_formula} celda(s) con una fórmula que no se puede separar en normal y extra.`)
  }
  if (plan?.pierde_horas_extra) {
    razones.push(`Se borran ${r.horas_extra_borradas} h extra ya cargadas.`)
  }
  return razones
}

/** El único camino de escritura. Nunca lanza: devuelve la frase que ve el jefe. */
export async function escribir(deps, { plan, confirmar = false }) {
  let r
  try {
    r = await deps.nucleo.registrarAsistencia(deps.google, {
      plan, confirmarSobrescritura: confirmar, confirmarReemplazoFormula: confirmar,
    })
  } catch (e) {
    return {
      ok: false, motivo: 'error_escribiendo', error: sanitizarError(e),
      texto: 'No se pudo escribir en la planilla. No quedó nada a medias: volvé a intentar en un minuto.',
    }
  }
  if (!r?.ok) {
    return { ok: false, motivo: r?.motivo ?? null, texto: mensajeDeMotivo(r?.motivo, { fecha: plan.fecha }) }
  }
  return { ok: true, ...r }
}

/** Las celdas escritas, tal como las muestra el mensaje de confirmación. */
export function celdasParaMostrar(resultado) {
  return (resultado?.celdas ?? []).map((c) => ({
    celda: c.celda_a1, nombre: c.nombre_original,
    horas: c.new_total_hours, normales: c.new_normal_hours, extra: c.new_extra_hours,
  }))
}
