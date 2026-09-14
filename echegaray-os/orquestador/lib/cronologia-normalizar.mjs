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
  MARCA_RECONSTRUIDA, cederAnteLaApp, esDePersona, esDePrueba, esUnDia, origenDe, planDeAsignacion,
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
    where id = $1 and hasta is not distinct from $4::date and coalesce(notas, '') not like '%${MARCA_RECONSTRUIDA}%'
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
    filas.forEach((g, k) => {
      const t = tramoEfectivo(g)
      if (esUnDia(g) || t.sinFecha || !t.desde) return
      const plan = planDeAsignacion(filas.slice(0, k), { obra_id: g.obra_id, desde: t.desde, hasta: g.hasta, unDia: false })
      const porId = new Map(filas.map((f) => [f.id, f]))
      const motivo = `${g.obra_id} rige desde ${t.desde}`
      for (const c of plan.cerrar) {
        const f = porId.get(c.id)
        if (c.continua) { paraDueno.push({ tipo: 'partir', fila: f, contra: g, detalle: `seguía después: ${c.continua.desde}→${c.continua.hasta ?? 'abierta'}` }); continue }
        if (f.hasta && f.hasta <= c.hasta) continue
        const notas = conNota(f.notas, `cronología ${fecha}: hasta ${f.hasta ?? 'abierta'} → ${c.hasta} (${motivo})`)
        cambios.push({ tipo: 'cerrar', fila: f, antes: { desde: f.desde, hasta: f.hasta }, despues: { desde: f.desde, hasta: c.hasta }, notas, motivo })
        f.hasta = c.hasta
        f.notas = notas
      }
      for (const r of plan.reemplazar) paraDueno.push({ tipo: 'reemplazar', fila: porId.get(r.id), contra: g, detalle: motivo })
      for (const r of plan.recortar) paraDueno.push({ tipo: 'recortar', fila: porId.get(r.id), contra: g, detalle: `quedaría desde ${r.desde}` })
    })
  }
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
