// NORMALIZAR LA CRONOLOGÍA YA GUARDADA — el plan, sin base. Lo escribe
// `orquestador/scripts/cronologia-asignaciones-normalizar.mjs`.
//
// Las reglas están en `cronologia-asignaciones.mjs`. Acá sólo cómo se aplican a lo que ya existe:
//
//   1. FILAS DE PERSONA (app y dueño) se re-juegan en el orden en que se cargaron (`creado_en`): cada
//      una es el gesto que rige desde su comienzo, y lo cargado ANTES cede según la regla a). De esa
//      regla la normalización aplica UNA sola cosa —cerrar `hasta`— porque es lo único que la regla c)
//      le permite al orquestador. Reemplazar, recortar o partir una fila de persona se lista para el
//      dueño y no se escribe.
//   2. FILAS RECONSTRUIDAS ceden ante lo que queda de las de persona (regla b): se recortan, se parten
//      o se borran. Es exactamente lo que `conciliar` produce para el timer, así que la corrida
//      siguiente de `asistencia-obra-por-dia` las encuentra iguales y no las reescribe.
//
// Toda fila tocada lleva la constancia en `notas`. En una reconstruida la constancia se AGREGA después
// de la marca: la marca es lo que la identifica como reconstruida, y perderla la convertiría en una
// fila de persona que el orquestador ya no podría volver a tocar.

import {
  MARCA_ANULADA, MARCA_RECONSTRUIDA, cederAnteLaApp, esDePersona, esDePrueba, esUnDia, origenDe, planDeAsignacion,
  tramoEfectivo,
} from './cronologia-asignaciones.mjs'

const iso = (x) => (x instanceof Date ? x.toISOString().slice(0, 10) : x ? String(x).slice(0, 10) : null)
const conNota = (notas, texto) => (notas && notas.trim() ? `${notas} · ${texto}` : texto)
// `pg` DEVUELVE `creado_en` COMO `Date`, y `String(Date)` da «Thu Aug 20 2026…»: ordenaba por el nombre
// del día de la semana. Pasó en el primer ensayo contra la base (Pastran, Zogbe salieron invertidos).
const instante = (x) => (x instanceof Date ? x.toISOString() : String(x ?? ''))
const ordenDeCarga = (a, b) =>
  instante(a.creado_en).localeCompare(instante(b.creado_en)) || String(a.id).localeCompare(String(b.id))

/** El orquestador sólo escribe con estas sentencias. Viven acá para que un test pueda leer sus guardas. */
export const SQL = Object.freeze({
  // Fila de persona: SÓLO `hasta` y `notas`, y sólo si nadie la cambió desde la lectura.
  cerrarDePersona: `update public.obra_asignacion set hasta = $2::date, notas = $3
    where id = $1 and hasta is not distinct from $4::date and notas is not distinct from $5
      and coalesce(notas, '') not like '%${MARCA_RECONSTRUIDA}%'
    returning id`,
  // Día suelto corregido por carga posterior: SÓLO `notas`, y sólo si siguen siendo las que se leyeron.
  anularDePersona: `update public.obra_asignacion set notas = $2
    where id = $1 and notas is not distinct from $3 and coalesce(notas, '') not like '%${MARCA_RECONSTRUIDA}%'
    returning id`,
  recortarReconstruida: `update public.obra_asignacion set desde = $2::date, hasta = $3::date, notas = $4
    where id = $1 and coalesce(notas, '') like '%${MARCA_RECONSTRUIDA}%' returning id`,
  borrarReconstruida: `delete from public.obra_asignacion
    where id = $1 and coalesce(notas, '') like '%${MARCA_RECONSTRUIDA}%' returning id`,
  insertarReconstruida: `insert into public.obra_asignacion (persona_id, obra_id, rol, desde, hasta, notas)
    values ($1, $2, 'integrante', $3::date, $4::date, $5) returning id`,
})

/** Paso 1: las filas de persona, re-jugadas en orden de carga. Muta `vivas` (copias) y anota. */
function cerrarLoDePersona(vivas, { cambios, paraDueno, fecha }) {
  const porPersona = new Map()
  for (const a of vivas.filter(esDePersona)) {
    if (!porPersona.has(a.persona_id)) porPersona.set(a.persona_id, [])
    porPersona.get(a.persona_id).push(a)
  }
  for (const filas of porPersona.values()) {
    filas.sort(ordenDeCarga)
    filas.forEach((g, k) => aplicarGesto(filas, g, k, { cambios, paraDueno, fecha }))
  }
}

/** Una fila de persona como gesto contra lo cargado ANTES: cierra y anula; lo demás se lista. */
function aplicarGesto(filas, g, k, { cambios, paraDueno, fecha }) {
  const t = tramoEfectivo(g)
  if (esUnDia(g) || t.sinFecha || !t.desde) return
  const plan = planDeAsignacion(filas.slice(0, k),
    { obra_id: g.obra_id, desde: t.desde, hasta: g.hasta, unDia: false, creado_en: g.creado_en })
  const porId = new Map(filas.map((f) => [f.id, f]))
  const motivo = `${g.obra_id} rige desde ${t.desde}, cargada ${instante(g.creado_en).slice(0, 16)}`
  // La normalización SÍ acorta una cerrada (la orden del 14/09 le permite cerrar `hasta` según la regla
  // a); lo que en la app pide confirmación, acá lo confirma el dueño al decidir si se aplica el plan.
  for (const c of [...plan.cerrar, ...plan.acortar.map((a) => ({ ...a, continua: null }))]) {
    const f = porId.get(c.id)
    if (c.continua) { paraDueno.push({ tipo: 'partir', fila: f, contra: g, detalle: `seguía después: ${c.continua.desde}→${c.continua.hasta ?? 'abierta'}` }); continue }
    if (f.hasta && f.hasta <= c.hasta) continue
    anotar(cambios, f, 'cerrar', c.hasta, `cronología ${fecha}: hasta ${f.hasta ?? 'abierta'} → ${c.hasta} (${motivo})`)
  }
  // GANA LA CARGA POSTERIOR (dueño, 14/09/2026): el día suelto del mismo día cargado antes se marca
  // anulado con nota. Sus fechas no se tocan; la lectura ignora las anuladas.
  for (const a of plan.anular) {
    const f = porId.get(a.id)
    if ((f.notas ?? '').includes(MARCA_ANULADA)) continue
    anotar(cambios, f, 'anular', f.hasta, `${MARCA_ANULADA} ${fecha}: día suelto corregido por carga posterior (${motivo})`)
  }
  for (const r of plan.reemplazar) paraDueno.push({ tipo: 'reemplazar', fila: porId.get(r.id), contra: g, detalle: motivo })
  for (const r of plan.recortar) paraDueno.push({ tipo: 'recortar', fila: porId.get(r.id), contra: g, detalle: `quedaría desde ${r.desde}` })
}

/** UN cambio por fila: dos gestos sobre la misma fila se funden, y `antes` sigue siendo lo leído de la
 *  base. Dos cambios sueltos harían que el segundo `update` fallara su guarda contra un `antes` que
 *  sólo existió en memoria. */
function anotar(cambios, f, tipo, hasta, texto) {
  const notas = conNota(f.notas, texto)
  const previo = cambios.find((c) => c.fila === f)
  if (previo) {
    Object.assign(previo, { tipo: previo.tipo === 'cerrar' || tipo === 'cerrar' ? 'cerrar' : tipo, notas, despues: { desde: f.desde, hasta } })
  } else {
    cambios.push({ tipo, fila: f, antes: { desde: f.desde, hasta: f.hasta, notas: f.notas ?? null }, despues: { desde: f.desde, hasta }, notas })
  }
  f.hasta = hasta
  f.notas = notas
}

/** Paso 2: cada reconstruida, contra lo que quedó de las filas de persona. */
function cederReconstruidas(vivas, { cambios, fecha }) {
  for (const r of vivas.filter((a) => origenDe(a) === 'reconstruida')) {
    const pedazos = cederAnteLaApp([r], vivas)
    if (pedazos.length === 1 && pedazos[0].desde === r.desde && pedazos[0].hasta === r.hasta) continue
    const antes = { desde: r.desde, hasta: r.hasta }
    const texto = (d) => `cronología ${fecha}: ${r.desde}→${r.hasta ?? 'abierta'} ${d} (cede ante la app)`
    if (pedazos.length === 0) {
      cambios.push({ tipo: 'borrar', fila: r, antes, despues: null, motivo: 'tapada entera por la app' })
      continue
    }
    const [primero, ...resto] = pedazos
    const notas = conNota(r.notas, texto(`queda ${pedazos.map((p) => `${p.desde}→${p.hasta ?? 'abierta'}`).join(' + ')}`))
    cambios.push({ tipo: 'recortar', fila: r, antes, despues: { desde: primero.desde, hasta: primero.hasta }, notas, motivo: 'cede ante la app' })
    for (const p of resto) {
      cambios.push({ tipo: 'insertar', fila: r, antes: null, despues: { desde: p.desde, hasta: p.hasta }, notas, motivo: 'pedazo posterior de la reconstruida partida' })
    }
  }
}

/**
 * @param filas  `obra_asignacion` entera `{ id, persona_id, obra_id, desde, hasta, notas, creado_en }`
 * @param opts   `{ fecha: 'DD/MM/YYYY' }` — sólo para la constancia
 * @returns `{ cambios, paraDueno }`. `cambios[].tipo`: cerrar (persona) | recortar | borrar | insertar
 *   (reconstruida). `paraDueno`: lo que la regla pide y el orquestador no puede escribir.
 */
export function planDeNormalizacion(filas = [], { fecha }) {
  const vivas = filas.filter((a) => !esDePrueba(a))
    .map((a) => ({ ...a, desde: iso(a.desde), hasta: iso(a.hasta) }))
  const cambios = []
  const paraDueno = []
  cerrarLoDePersona(vivas, { cambios, paraDueno, fecha })
  cederReconstruidas(vivas, { cambios, fecha })
  return { cambios, paraDueno }
}

/**
 * LA RELECTURA DE `--aplicar` SE COMPARA CONTRA EL RESPALDO, NO CONTRA EL PLAN RECALCULADO (auditoría,
 * 14/09/2026). Que el plan dé cero después de escribir prueba que la base quedó coherente con la regla,
 * no que las filas de persona sigan intactas: un borrado de más también deja el plan en cero.
 *
 * @param antes    el respaldo (la tabla leída antes de escribir)
 * @param despues  la tabla releída
 * @returns `{ ok, problemas }`: el conteo es el esperado, y cada fila de persona sigue con su obra y su
 *   `desde`, y con `hasta`/`notas` iguales al respaldo salvo lo que el plan dijo que cambiaba.
 */
export function verificarContraRespaldo(antes, despues, { cambios }) {
  const problemas = []
  const esperado = antes.length - cambios.filter((c) => c.tipo === 'borrar').length
    + cambios.filter((c) => c.tipo === 'insertar').length
  if (despues.length !== esperado) problemas.push(`hay ${despues.length} filas y se esperaban ${esperado}`)
  const ahora = new Map(despues.map((a) => [a.id, a]))
  const tocadas = new Map(cambios.filter((c) => ['cerrar', 'anular'].includes(c.tipo)).map((c) => [c.fila.id, c]))
  for (const a of antes.filter(esDePersona)) {
    const b = ahora.get(a.id)
    if (!b) { problemas.push(`la fila de persona ${a.id} desapareció`); continue }
    const c = tocadas.get(a.id)
    const quiere = { obra_id: a.obra_id, desde: iso(a.desde), hasta: c ? c.despues.hasta : iso(a.hasta), notas: c ? c.notas : (a.notas ?? null) }
    const hay = { obra_id: b.obra_id, desde: iso(b.desde), hasta: iso(b.hasta), notas: b.notas ?? null }
    if (JSON.stringify(quiere) !== JSON.stringify(hay)) problemas.push(`fila de persona ${a.id}: quedó ${JSON.stringify(hay)}, se esperaba ${JSON.stringify(quiere)}`)
  }
  return { ok: problemas.length === 0, problemas }
}

/** Cómo quedaría la tabla con el plan aplicado. Para el invariante y para el ensayo. */
export function aplicarEnMemoria(filas, { cambios }) {
  const out = filas.map((a) => ({ ...a, desde: iso(a.desde), hasta: iso(a.hasta) }))
  const porId = new Map(out.map((a) => [a.id, a]))
  let n = 0
  for (const c of cambios) {
    if (c.tipo === 'borrar') { out.splice(out.indexOf(porId.get(c.fila.id)), 1); continue }
    if (c.tipo === 'insertar') { out.push({ ...c.fila, id: `nueva-${++n}`, ...c.despues, notas: c.notas }); continue }
    Object.assign(porId.get(c.fila.id), c.despues, { notas: c.notas })
  }
  return out
}
