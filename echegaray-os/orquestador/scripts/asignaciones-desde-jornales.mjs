#!/usr/bin/env node
// Reconstruye el historial de obra de cada persona en `obra_asignacion` a partir de las horas de
// JORNALES ya volcadas en `registros_hh` (`fuente_legacy = 'sheet:jornales'`). Orden del dueño
// (08/09/2026): «dejar el historial o cronología de obras correcto de dónde estuvo cada uno hasta
// hoy, según lo que dice el sheet JORNALES».
//
// EL DEFECTO ES NO ESCRIBIR. Sin `--aplicar` lee, arma los tramos y muestra qué insertaría, qué
// recorta y qué omite. Con `--aplicar` inserta en una transacción y relee. NUNCA toca ni borra una
// fila existente: las asignaciones creadas desde la web (notas sin la marca) son la verdad de hoy y
// el histórico se acomoda a ellas (ver `lib/asignaciones-desde-hh.mjs`).
//
//   node orquestador/scripts/asignaciones-desde-jornales.mjs                 # dry
//   node orquestador/scripts/asignaciones-desde-jornales.mjs --aplicar       # escribe y verifica
//   … --hoy 2026-09-08 --fichas "AGUERO CRISTIAN,QUIROGA ALEXANDER"          # opcional
import { query, withTx, closePool } from '../lib/db.mjs'
import { armarTramos, conciliar, fechaIso, MARCA_JORNALES } from '../lib/asignaciones-desde-hh.mjs'

const arg = (n, d = null) => { const i = process.argv.indexOf(`--${n}`); return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : d }
const APLICAR = process.argv.includes('--aplicar')
const HOY = arg('hoy') ?? new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10) // San Juan = UTC-3
const FICHAS = (arg('fichas') ?? 'AGUERO CRISTIAN,QUIROGA ALEXANDER,GONZALEZ CARLOS SAMUEL').split(',').map((s) => s.trim().toUpperCase())
const FUENTE = 'sheet:jornales'

const SQL_INSERT = `
  insert into obra_asignacion (persona_id, obra_id, rol, desde, hasta, notas)
  values ($1, $2, 'integrante', $3::date, $4::date, $5)
  returning id`

async function leer() {
  const [hh, personas, asig, obras] = await Promise.all([
    query(`select persona_id, fecha, obra_canonica_id as obra_id, horas, tipo_hora
           from registros_hh where fuente_legacy = $1 and persona_id is not null`, [FUENTE]),
    query(`select id, nombre_completo, en_la_empresa, fecha_egreso from personas`),
    query(`select id, persona_id, obra_id, desde, hasta, notas, creado_en from obra_asignacion`),
    query(`select id, nombre, estado from obra_canonica`),
  ])
  return { hh: hh.rows, personas: personas.rows, asig: asig.rows, obras: obras.rows }
}

const conteoPorOrigen = (asig) => {
  const c = { web: 0, jornales: 0, prueba: 0, abiertas_web: 0, abiertas_jornales: 0 }
  for (const a of asig) {
    const n = a.notas ?? ''
    if (/PRUEBA|ZZ-E2E/i.test(n) || /^ZZ/i.test(a.obra_id)) { c.prueba++; continue }
    if (n.includes(MARCA_JORNALES)) { c.jornales++; if (a.hasta === null) c.abiertas_jornales++ } else { c.web++; if (a.hasta === null) c.abiertas_web++ }
  }
  return c
}

const f = (d) => (d ? fechaIso(d) : '—')

async function main() {
  const { hh, personas, asig, obras } = await leer()
  const nombre = new Map(personas.map((p) => [p.id, p.nombre_completo]))
  const activos = new Set(personas.filter((p) => p.en_la_empresa && !p.fecha_egreso).map((p) => p.id))
  const obraNombre = new Map(obras.map((o) => [o.id, `${o.nombre} (${o.estado})`]))

  // Una obra cerrada no recibe historial nuevo (decisión del dueño 09/09/2026): sus días de horas
  // salen aparte, en «HORAS SOBRE OBRA CERRADA», y no arman tramo.
  const obrasCerradas = new Set(obras.filter((o) => o.estado === 'cerrada').map((o) => o.id))
  const { tramos, dobles, umbral, cerradas } = armarTramos(hh, { hoy: HOY, activos, obrasCerradas })
  const r = conciliar(tramos, asig, { obrasCerradas })

  console.log(`HOY ${HOY} · umbral de tramo abierto ${umbral} · filas HH ${hh.length} · personas ${new Set(hh.map((x) => x.persona_id)).size} (activas ${[...new Set(hh.map((x) => x.persona_id))].filter((p) => activos.has(p)).length})`)
  console.log(`tramos ${tramos.length} · abiertos ${tramos.filter((t) => t.abierto).length} · días con doble obra ${dobles.length}`)
  console.log(`horas sobre obra cerrada (no arman tramo, «obra cerrada: decidir»): ${cerradas.length} filas`)
  console.log(`\n== TRAMOS POR PERSONA`)
  let ultima = null
  for (const t of tramos) {
    if (t.persona_id !== ultima) { ultima = t.persona_id; console.log(`\n${nombre.get(t.persona_id) ?? t.persona_id}${activos.has(t.persona_id) ? '' : '  [inactivo]'}`) }
    console.log(`   ${t.obra_id.padEnd(26)} ${t.desde} → ${t.abierto ? 'ABIERTO   ' : t.hasta} · ${String(t.dias).padStart(3)} días · ${String(t.horas).padStart(7)} h`)
  }
  if (dobles.length) {
    console.log(`\n== DÍAS CON DOS OBRAS (se asignó a la de más horas)`)
    for (const d of dobles) console.log(`   ${nombre.get(d.persona_id)} ${d.fecha}: ${d.elegida} (${d.horas_elegida} h) vs ${d.descartadas.map((x) => `${x.obra_id} (${x.horas} h)`).join(', ')}`)
  }
  console.log(`\n== CONCILIACIÓN CON obra_asignacion`)
  console.log(`   a insertar ${r.insertar.length} (abiertas ${r.insertar.filter((i) => i.hasta === null).length}) · recortados por web misma obra ${r.recortados.length} · cerrados por web vigente en otra obra ${r.cerrados.length} · omitidos ${r.omitidos.length}`)
  for (const x of r.recortados) console.log(`   RECORTE  ${nombre.get(x.tramo.persona_id)} · ${x.tramo.obra_id} ${x.tramo.desde}→${x.hasta} (web ${x.contra.obra_id} desde ${f(x.contra.desde)})`)
  for (const x of r.cerrados) console.log(`   CIERRE   ${nombre.get(x.tramo.persona_id)} · ${x.tramo.obra_id} ${x.tramo.desde}→${x.tramo.hasta} (web vigente en ${x.contra.obra_id} desde ${f(x.contra.desde)})`)
  for (const x of r.omitidos) console.log(`   OMITIDO  ${nombre.get(x.tramo.persona_id)} · ${x.tramo.obra_id} ${x.tramo.desde}→${x.tramo.hasta} · ${x.motivo}${x.contra ? ` (web ${x.contra.obra_id} ${f(x.contra.desde)}→${f(x.contra.hasta)})` : ''}`)
  const dupWeb = r.omitidos.filter((x) => x.motivo === 'solapa_web').length
  const abiertasEnCerradas = r.insertar.filter((i) => i.hasta === null && !/\(activa\)$/.test(obraNombre.get(i.obra_id) ?? '')).map((i) => `${nombre.get(i.persona_id)} → ${i.obra_id}`)
  if (abiertasEnCerradas.length) console.log(`\n   FALTA_DATO · tramo abierto sobre obra NO activa (JORNALES rotula al nivel del cliente): ${abiertasEnCerradas.join(' · ')}`)

  const antes = conteoPorOrigen(asig)
  console.log(`\n== obra_asignacion ANTES: ${JSON.stringify(antes)}`)
  if (!APLICAR) { console.log(`\n(dry) Con --aplicar se insertarían ${r.insertar.length} filas. Duplicados sobre web: ${dupWeb}.`); return }
  if (r.insertar.length === 0) { console.log('Nada que insertar.'); return }

  const ids = await withTx(async (tx) => {
    const out = []
    for (const i of r.insertar) {
      const res = await tx.query(SQL_INSERT, [i.persona_id, i.obra_id, i.desde, i.hasta, i.notas])
      out.push(res.rows[0].id)
    }
    return out
  })
  console.log(`\nINSERTADAS ${ids.length} filas.`)

  // ═══ RELECTURA: el efecto, no el intento ═══
  const despues = await query(`select id, persona_id, obra_id, desde, hasta, notas from obra_asignacion`)
  console.log(`== obra_asignacion DESPUÉS: ${JSON.stringify(conteoPorOrigen(despues.rows))}`)
  const webAntes = new Map(asig.filter((a) => !(a.notas ?? '').includes(MARCA_JORNALES)).map((a) => [a.id, `${f(a.desde)}|${f(a.hasta)}|${a.obra_id}`]))
  const tocadas = despues.rows.filter((a) => webAntes.has(a.id) && webAntes.get(a.id) !== `${f(a.desde)}|${f(a.hasta)}|${a.obra_id}`)
  const perdidas = [...webAntes.keys()].filter((id) => !despues.rows.some((a) => a.id === id))
  console.log(`   asignaciones web modificadas: ${tocadas.length} · desaparecidas: ${perdidas.length}`)
  const dosVigentes = await query(`
    select p.nombre_completo n, array_agg(a.obra_id order by a.obra_id) obras
    from obra_asignacion a join personas p on p.id = a.persona_id
    where a.hasta is null and coalesce(a.notas,'') not like '%PRUEBA%' group by 1 having count(*) > 1 order by 1`)
  console.log(`   personas con más de una asignación vigente: ${dosVigentes.rowCount}${dosVigentes.rows.map((x) => `\n      ${x.n}: ${x.obras.join(', ')}`).join('')}`)
  const fijadasHoy = await query(`
    select p.nombre_completo n, a.obra_id, (select array_agg(b.obra_id) from obra_asignacion b where b.persona_id=a.persona_id and b.hasta is null) vigentes
    from obra_asignacion a join personas p on p.id=a.persona_id
    where a.desde >= '2026-09-01' and coalesce(a.notas,'') not like '%JORNALES%' and a.hasta is null order by 1`)
  console.log(`\n== FIJADAS POR EL DUEÑO (desde >= 2026-09-01, web): la obra vigente sigue siendo la suya`)
  for (const x of fijadasHoy.rows) console.log(`   ${x.n.padEnd(34)} web → ${x.obra_id.padEnd(22)} vigentes: ${x.vigentes.join(', ')} ${x.vigentes.length === 1 && x.vigentes[0] === x.obra_id ? 'OK' : 'REVISAR'}`)

  console.log(`\n== FICHAS (orden de la ficha: vigentes primero, luego desde descendente)`)
  for (const buscada of FICHAS) {
    const p = personas.find((x) => x.nombre_completo.toUpperCase().startsWith(buscada))
    if (!p) { console.log(`   ${buscada}: no está en personas`); continue }
    const fila = await query(`select obra_id, rol, desde, hasta, notas from obra_asignacion where persona_id=$1
      order by hasta asc nulls first, desde desc nulls last`, [p.id])
    console.log(`\n${p.nombre_completo}${activos.has(p.id) ? '' : ' [inactivo]'}`)
    for (const a of fila.rows) console.log(`   ${a.obra_id.padEnd(26)} ${f(a.desde)} → ${a.hasta ? f(a.hasta) : 'VIGENTE   '} · ${a.rol} · ${(a.notas ?? '').includes(MARCA_JORNALES) ? 'JORNALES' : 'web'}`)
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1 }).finally(closePool)
