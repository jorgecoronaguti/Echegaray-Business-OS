#!/usr/bin/env node
// ASISTENCIA (pestaña del Sheet de nómina) → la obra de cada DÍA en `registros_hh`, y de ahí el
// historial de `obra_asignacion`. Hallazgo del 08/09/2026: JORNALES rotula la QUINCENA entera de
// cada persona con UNA obra, pero la gente rota entre obras dentro de la quincena. Quien sabe dónde
// estuvo cada uno cada día es ASISTENCIA — el ledger diario que carga el encargado.
//
// SÓLO LEE DEL SHEET. Ni un `values.update`: la pestaña queda como está. Lo único que escribe es
// `public.registros_hh.obra_canonica_id` (UNA columna, nunca horas ni tipo_hora) y el historial de
// `obra_asignacion` marcado como JORNALES. Sin `--aplicar` no escribe nada.
//
//   node orquestador/scripts/asistencia-obra-por-dia.mjs                      # dry (default)
//   node orquestador/scripts/asistencia-obra-por-dia.mjs --desde 2026-07-25   # ventana de la corrección
//   node orquestador/scripts/asistencia-obra-por-dia.mjs --aplicar            # escribe, relee y verifica
//   node orquestador/scripts/asistencia-obra-por-dia.mjs --sin-asignaciones   # sólo mueve la obra del día
import { makeGoogleClient, READONLY_SCOPES } from '../lib/google.mjs'
import { operadorPara, getTokenFor } from '../lib/google-oauth.mjs'
import { loadConfig } from '../lib/config.mjs'
import { query, withTx, closePool } from '../lib/db.mjs'
import { fechaOperativaSanJuan } from '../comunicacion/asistencia-ui.mjs'
import { resolutorDeObra, normAlias } from '../lib/jornales-a-registros-hh.mjs'
import { armarTramos, planDeConjunto, MARCA_JORNALES, NOTAS_JORNALES } from '../lib/asignaciones-desde-hh.mjs'
import { revisarAsignaciones, formatearHallazgos, SQL_ASIGNACIONES, SQL_OBRAS } from '../lib/invariantes/asignaciones.mjs'
import {
  HOJA_ASISTENCIA, FUENTE_JORNALES, SQL_CORREGIR_OBRA,
  filasDeValues, agruparPorPersonaDia, planDeCorreccion, planillaSinHh,
} from '../lib/asistencia-obra-por-dia.mjs'

const arg = (n, d = null) => { const i = process.argv.indexOf(`--${n}`); return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : d }
const flag = (n) => process.argv.includes(`--${n}`)
const APLICAR = flag('aplicar')
const DETALLE = flag('detalle')
const SIN_ASIGNACIONES = flag('sin-asignaciones')
const HOY = arg('hoy', fechaOperativaSanJuan())
const DESDE = arg('desde', '2000-01-01')
for (const [n, v] of [['desde', DESDE], ['hoy', HOY]]) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error(`--${n} tiene que ser YYYY-MM-DD, no «${v}»`)
}
// El ID del Sheet de asistencia/nómina es el mismo que usa `legajos-sincronizar.mjs`.
const NOMINA_ID = process.env.ORQ_ASISTENCIA_ID || '18essEcZKxw1YARU4o6uNjapKCB1U1uKF-p7zWQ0YwJ0'
const RANGO = process.env.ORQ_ASISTENCIA_RANGO || 'A1:J5000'
const SQL_BORRAR_ASIG = `delete from public.obra_asignacion where id = $1 and coalesce(notas, '') like '%${MARCA_JORNALES}%' returning id`
const SQL_INSERT_ASIG = `insert into public.obra_asignacion (persona_id, obra_id, rol, desde, hasta, notas)
  values ($1, $2, 'integrante', $3::date, $4::date, $5) returning id`

async function catalogos() {
  const [personas, alias, canonicas, clienteAlias] = await Promise.all([
    query('select id, nombre_completo, en_la_empresa, fecha_egreso, es_prueba from public.personas'),
    query('select alias, obra_id from public.obra_alias where obra_id is not null'),
    query(`select id, nombre, cliente_texto, estado, to_char(fecha_fin_real, 'YYYY-MM-DD') as fecha_fin
             from public.obra_canonica`),
    query("select rotulo_clave, cliente_canonico from public.cliente_alias where fuente = 'JORNALES'"),
  ])
  return {
    personas: personas.rows,
    obras: canonicas.rows,
    resolver: resolutorDeObra({
      alias: new Map(alias.rows.map((r) => [normAlias(r.alias), r.obra_id])),
      canonicas: canonicas.rows,
      clienteAlias: new Map(clienteAlias.rows.map((r) => [normAlias(r.rotulo_clave), r.cliente_canonico])),
    }),
  }
}

const SQL_HH = `select id, persona_id, to_char(fecha, 'YYYY-MM-DD') fecha, obra_canonica_id, tipo_hora, horas, fuente_legacy
  from public.registros_hh where persona_id is not null and fecha >= $1::date`

async function leerPlanilla() {
  const op = await operadorPara()
  if (!op) throw new Error('no hay cuenta de Google autorizada (orq.google_tokens)')
  const google = makeGoogleClient({ config: loadConfig(), scopes: READONLY_SCOPES, getToken: getTokenFor(op) })
  // UNFORMATTED_VALUE: la fecha viene como serial. El valor formateado depende del locale del
  // documento y ya vació un parser antes (dd/mm/yy).
  const values = await google.readSheetValues(NOMINA_ID, `'${HOJA_ASISTENCIA}'!${RANGO}`, { render: 'UNFORMATTED_VALUE' })
  return filasDeValues(values ?? [])
}

function imprimirLectura({ filas, hallazgos, dias, sinPersona, sinObra, aproximadas }) {
  const fechas = filas.map((f) => f.fecha).sort()
  console.log(`\nASISTENCIA · ${filas.length} filas · ${fechas[0] ?? '—'} → ${fechas.at(-1) ?? '—'} · ${dias.size} pares persona-día resueltos`)
  for (const x of hallazgos.slice(0, DETALLE ? 500 : 10)) console.log(`  ! ${x.tipo} fila ${x.fila1} ${x.valor ?? x.fecha ?? ''}`)
  console.log(`  emparejadas por segunda oportunidad (rótulo abreviado): ${aproximadas.length}`)
  for (const a of aproximadas) console.log(`    «${a.nombre}» → ${a.persona} · ${a.criterio}`)
  console.log(`  FALTA_DATO · nombres de la planilla sin persona (no se crean): ${sinPersona.length}`)
  for (const p of sinPersona) console.log(`    ${p.nombre.padEnd(30)} ${p.estado} ${p.filas} filas${p.candidatos.length ? ' · candidatos: ' + p.candidatos.join(' / ') : ''}`)
  console.log(`  FALTA_DATO · rótulos CLIENTE·OBRA sin alias (filas ignoradas): ${sinObra.length}`)
  for (const o of sinObra) console.log(`    ${o.rotulo.padEnd(46)} ${o.filas} filas · ${o.dias[0]}..${o.dias.at(-1)}`)
}

function imprimirPlan(plan, sinHh) {
  console.log(`\nCRUCE con registros_hh (fecha >= ${DESDE})`)
  console.log(`  coinciden ${plan.coinciden} · A CORREGIR ${plan.corregir.length} · ambiguos ${plan.ambiguos.length} · contradicen web ${plan.contradiceWeb.length} · ausencia/licencia intactas ${plan.noTrabajadas.length} · filas sin día en la planilla ${plan.sinPlanilla}`)
  if (plan.corregir.length) console.log('\n  A CORREGIR (sólo obra_canonica_id)')
  for (const c of plan.corregir.slice(0, DETALLE ? 1000 : 40)) console.log(`    ${c.fecha} ${String(c.persona).padEnd(30)} ${String(c.de).padEnd(24)} → ${c.a}  (${c.tipo_hora} ${c.horas}h)`)
  if (plan.ambiguos.length) console.log('\n  PARA EL DUEÑO · dos obras el mismo día y una sola fila de horas: NO se reparte')
  for (const a of plan.ambiguos) console.log(`    ${a.fecha} ${String(a.persona).padEnd(30)} registrada ${a.registrada} vs ${a.obras.map((o) => `${o.obra_id} (${o.horas}h)`).join(' + ')}`)
  if (plan.contradiceWeb.length) console.log('\n  NO SE TOCAN · filas cargadas desde la web que dicen otra obra que la planilla')
  for (const c of plan.contradiceWeb.slice(0, DETALLE ? 500 : 20)) console.log(`    ${c.fecha} ${String(c.persona).padEnd(30)} ${c.fuente} ${c.base_obra} vs planilla ${c.planilla}`)
  console.log(`\n  PARA EL DUEÑO · días de la planilla sin ninguna hora trabajada en la base: ${sinHh.length}`)
  for (const s of sinHh.slice(0, DETALLE ? 500 : 20)) console.log(`    ${s.fecha} ${String(s.persona).padEnd(30)} ${s.obras.join(', ')}`)
}

/** Horas imputadas a una obra CERRADA: no arman historial (decisión del dueño 09/09/2026) y nadie
 *  las adivina por él. Se agrupan por persona y obra para que la decisión sea una por caso. */
function imprimirObrasCerradas(cerradas = [], personas = []) {
  const nombre = new Map(personas.map((p) => [p.id, p.nombre_completo]))
  const grupos = new Map()
  for (const c of cerradas) {
    const k = `${c.persona_id}|${c.obra_id}`
    if (!grupos.has(k)) grupos.set(k, { persona: nombre.get(c.persona_id) ?? c.persona_id, obra: c.obra_id, dias: [], horas: 0 })
    const g = grupos.get(k); g.dias.push(c.fecha); g.horas += c.horas
  }
  const orden = [...grupos.values()].sort((a, b) => b.dias.at(-1).localeCompare(a.dias.at(-1)))
  console.log(`\n  PARA EL DUEÑO · horas sobre OBRA CERRADA: no arman asignación · ${cerradas.length} filas en ${orden.length} casos`)
  for (const g of orden.slice(0, DETALLE ? 500 : 20)) {
    console.log(`    obra cerrada: decidir · ${String(g.obra).padEnd(24)} ${String(g.persona).padEnd(34)} ${g.dias.length} días ${g.dias[0]}..${g.dias.at(-1)} · ${g.horas} h`)
  }
}

async function corregirHh(corregir) {
  return withTx(async (tx) => {
    let n = 0
    for (const c of corregir) n += (await tx.query(SQL_CORREGIR_OBRA, [c.id, c.a])).rowCount
    return n
  })
}

/** El historial de JORNALES se recalcula ENTERO y se aplica como diferencia (ver `planDeConjunto`). */
async function planAsignaciones(personas, obrasCerradas) {
  const [hh, asig] = await Promise.all([
    query(`select persona_id, to_char(fecha, 'YYYY-MM-DD') fecha, obra_canonica_id as obra_id, horas, tipo_hora
             from public.registros_hh where fuente_legacy = $1 and persona_id is not null`, [FUENTE_JORNALES]),
    query('select id, persona_id, obra_id, desde, hasta, notas from public.obra_asignacion'),
  ])
  const activos = new Set(personas.filter((p) => p.en_la_empresa && !p.fecha_egreso).map((p) => p.id))
  const { tramos, cerradas } = armarTramos(hh.rows, { hoy: HOY, activos, obrasCerradas })
  return { ...planDeConjunto(tramos, asig.rows, { hoy: HOY, obrasCerradas }), tramos, cerradas }
}

async function aplicarAsignaciones({ insertar, borrar }) {
  return withTx(async (tx) => {
    let borradas = 0
    for (const b of borrar) borradas += (await tx.query(SQL_BORRAR_ASIG, [b.id])).rowCount
    let insertadas = 0
    for (const i of insertar) insertadas += (await tx.query(SQL_INSERT_ASIG, [i.persona_id, i.obra_id, i.desde, i.hasta, NOTAS_JORNALES])).rowCount
    return { borradas, insertadas }
  })
}

/** Sólo lectura, corre SIEMPRE (con y sin `--aplicar`): es el control, no el efecto. */
async function invariantes(nombre) {
  const [asig, obras] = await Promise.all([query(SQL_ASIGNACIONES), query(SQL_OBRAS)])
  const r = revisarAsignaciones({ asignaciones: asig.rows, obras: obras.rows })
  console.log(`\nINVARIANTES de obra_asignacion (${nombre}) · ${r.revisadas} filas · ${r.vigentes} vigentes · ${r.hallazgos.length ? `${r.hallazgos.length} ROJO` : 'VERDE'}`)
  if (r.hallazgos.length) console.log(formatearHallazgos(r.hallazgos))
  return r
}

async function main() {
  const [{ filas, hallazgos }, cat] = await Promise.all([leerPlanilla(), catalogos()])
  const { dias, sinPersona, sinObra, aproximadas } = agruparPorPersonaDia(filas, cat)
  imprimirLectura({ filas, hallazgos, dias, sinPersona, sinObra, aproximadas })

  const { rows: hh } = await query(SQL_HH, [DESDE])
  const plan = planDeCorreccion({ dias, hh })
  imprimirPlan(plan, planillaSinHh({ dias, hh }))

  // Map, no Set: el corte es la FECHA DE CIERRE, no el estado. Los días anteriores a `fecha_fin`
  // son historial legítimo — la obra estaba abierta y la gente estuvo ahí.
  const obrasCerradas = new Map(cat.obras.filter((o) => o.estado === 'cerrada').map((o) => [o.id, o.fecha_fin ?? null]))
  const antesAsig = await planAsignaciones(cat.personas, obrasCerradas)
  imprimirObrasCerradas(antesAsig.cerradas, cat.personas)
  console.log(`\nASIGNACIONES (historial JORNALES recalculado como conjunto): tramos ${antesAsig.tramos.length} · a insertar ${antesAsig.insertar.length} · a borrar ${antesAsig.borrar.length} · sin cambio ${antesAsig.conservar.length} · protegidas ${antesAsig.protegidas.length} · recortados al cierre de su obra ${antesAsig.recortadosPorCierre.length}`)
  for (const x of antesAsig.recortadosPorCierre.slice(0, DETALLE ? 500 : 20)) {
    console.log(`    RECORTE AL CIERRE  ${x.tramo.persona_id} · ${x.obra_id} ${x.tramo.desde}→${x.tramo.hasta_original ?? x.tramo.hasta} queda hasta ${x.fecha_fin}`)
  }

  if (!APLICAR) {
    await invariantes('estado actual')
    console.log(`\nENSAYO: no se escribió nada. Con --aplicar se corrigen ${plan.corregir.length} filas de registros_hh y se recalcula el historial.`)
    return
  }

  const movidas = await corregirHh(plan.corregir)
  console.log(`\nregistros_hh: ${movidas} filas con obra_canonica_id movido (transacción confirmada)`)

  // RELECTURA: el efecto, no el intento. El plan se recalcula contra la base ya escrita y tiene que
  // quedar en cero — si no, algo escribió distinto de lo que dijo.
  const { rows: hh2 } = await query(SQL_HH, [DESDE])
  const plan2 = planDeCorreccion({ dias, hh: hh2 })
  console.log(`  releído: quedan ${plan2.corregir.length} filas por corregir (tiene que ser 0) · coinciden ${plan2.coinciden}`)
  if (plan2.corregir.length) process.exitCode = 1

  if (!SIN_ASIGNACIONES) {
    const p = await planAsignaciones(cat.personas, obrasCerradas)
    const res = await aplicarAsignaciones(p)
    console.log(`obra_asignacion: ${res.borradas} borradas · ${res.insertadas} insertadas (sólo filas marcadas «${MARCA_JORNALES}»)`)
    const p2 = await planAsignaciones(cat.personas, obrasCerradas)
    console.log(`  releído: quedan ${p2.insertar.length} por insertar y ${p2.borrar.length} por borrar (tienen que ser 0)`)
    if (p2.insertar.length || p2.borrar.length) process.exitCode = 1
  }

  const inv = await invariantes('después de escribir')
  if (inv.hallazgos.length) console.log('\n  Los invariantes en rojo NO revierten nada: son una decisión del dueño (reabrir la obra o corregir la imputación).')
}

main().catch((e) => { console.error(e); process.exitCode = 1 }).finally(() => closePool().catch(() => {}))
