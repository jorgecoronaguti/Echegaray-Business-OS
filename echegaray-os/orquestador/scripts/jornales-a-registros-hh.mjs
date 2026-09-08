#!/usr/bin/env node
// JORNALES → registros_hh. Lo que el dueño pidió el 08/09/2026: «leer el sheet jornales completo y
// dejar todo el año cargado según corresponde, empleados activos e inactivos, quiero que todo el
// registro esté en app.ecsas.com.ar».
//
// SÓLO LEE DEL SHEET. Ni un `values.update` ni un `batchUpdate`: JORNALES y el bot quedan como están.
// Lo que escribe es `public.registros_hh`, la tabla que leen /campo/asistencia, la grilla semanal
// de Administración y la ficha → Horas. La traducción es pura y vive en `lib/jornales-a-registros-hh.mjs`.
//
// EL DEFECTO ES NO ESCRIBIR. Sin `--aplicar` lee, traduce y muestra: personas, días, horas por mes y
// por obra, quién no emparejó, qué obra no se resolvió, qué celda no es horas, y qué día ya tenía una
// fila de otra fuente (esos días no se tocan). Con `--aplicar` hace el UPSERT en una transacción,
// VUELVE A LEER la base y muestra ANTES → DESPUÉS por mes y por obra, más `obra_plan_vs_real.hh_real`.
// Nunca borra: una fila propia que ya no sale de la planilla se declara obsoleta y queda.
//
//   node orquestador/scripts/jornales-a-registros-hh.mjs                     # 2026, ensayo
//   node orquestador/scripts/jornales-a-registros-hh.mjs --anio 2025         # JORNALES 25 + SERENOS
//   node orquestador/scripts/jornales-a-registros-hh.mjs --aplicar           # escribe y verifica
//   node orquestador/scripts/jornales-a-registros-hh.mjs --pestanas "Obreros 26" --detalle
//   node orquestador/scripts/jornales-a-registros-hh.mjs --hasta 2026-08-31   # sólo hasta esa fecha (default: hoy en San Juan)
import { makeGoogleClient, READONLY_SCOPES } from '../lib/google.mjs'
import { operadorPara, getTokenFor } from '../lib/google-oauth.mjs'
import { loadConfig } from '../lib/config.mjs'
import { query, withTx, closePool } from '../lib/db.mjs'
import { JORNALES_SPREADSHEET_ID } from '../lib/tools/jornales-asistencia.mjs'
import { fechaOperativaSanJuan } from '../comunicacion/asistencia-ui.mjs'
import {
  FUENTE, marcasDeGrid, planDeRegistros, resolutorDeObra, separarConflictos, resumir, columnasParaUpsert,
  SQL_UPSERT, SQL_MOVER, mapaDeRotulos, normAlias, separarAnticipadas,
} from '../lib/jornales-a-registros-hh.mjs'

const arg = (n, d = null) => { const i = process.argv.indexOf(`--${n}`); return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : d }
const flag = (n) => process.argv.includes(`--${n}`)
const APLICAR = flag('aplicar')
const DETALLE = flag('detalle')
const ANIO = Number(arg('anio', '2026'))
const HASTA = arg('hasta', fechaOperativaSanJuan())
if (!/^\d{4}-\d{2}-\d{2}$/.test(HASTA)) throw new Error(`--hasta tiene que ser YYYY-MM-DD, no «${HASTA}»`)
const PESTANAS_POR_ANIO = { 2026: ['Obreros 26', 'Oficina 26'], 2025: ['JORNALES 25', 'SERENOS'] }
const PESTANAS = arg('pestanas') ? arg('pestanas').split(',').map((s) => s.trim()) : (PESTANAS_POR_ANIO[ANIO] ?? [])
const RANGO = process.env.GOOGLE_JORNALES_RANGO_COMPLETO || 'A1:BB2600'
const h = (x) => Number(x ?? 0).toLocaleString('es-AR', { maximumFractionDigits: 1 })

async function catalogos() {
  const [personas, alias, canonicas, clienteAlias, asignaciones] = await Promise.all([
    query('select id, nombre_completo, en_la_empresa, es_prueba from public.personas'),
    query('select alias, obra_id from public.obra_alias where obra_id is not null'),
    query('select id, nombre, cliente_texto, jornada_horas from public.obra_canonica'),
    query("select rotulo_clave, cliente_canonico from public.cliente_alias where fuente = 'JORNALES'"),
    query("select persona_id, obra_id, to_char(desde, 'YYYY-MM-DD') desde, to_char(hasta, 'YYYY-MM-DD') hasta from public.obra_asignacion"),
  ])
  return {
    personas: personas.rows,
    resolver: resolutorDeObra({
      alias: new Map(alias.rows.map((r) => [normAlias(r.alias), r.obra_id])),
      canonicas: canonicas.rows,
      clienteAlias: new Map(clienteAlias.rows.map((r) => [normAlias(r.rotulo_clave), r.cliente_canonico])),
    }),
    asignaciones: asignaciones.rows,
    jornadaPorObra: new Map(canonicas.rows.map((r) => [r.id, Number(r.jornada_horas)])),
    nombreObra: new Map(canonicas.rows.map((r) => [r.id, r.nombre])),
  }
}

async function leerPestanas(google) {
  const tabs = await google.listTabs(JORNALES_SPREADSHEET_ID)
  const marcas = []; const hallazgos = []; const leidas = []
  for (const tab of PESTANAS) {
    if (!tabs.includes(tab)) { hallazgos.push({ tipo: 'pestana_inexistente', pestana: tab }); continue }
    const grid = await google.readSheetGrid(JORNALES_SPREADSHEET_ID, `'${tab}'!${RANGO}`)
    const r = marcasDeGrid(grid, { pestana: tab, anio: ANIO })
    marcas.push(...r.marcas); hallazgos.push(...r.hallazgos)
    leidas.push({ pestana: tab, filas: grid.filas.length, marcas: r.marcas.length })
  }
  return { tabs, marcas, hallazgos, leidas }
}

async function existentesEntre(desde, hasta) {
  const { rows } = await query(
    `select id, persona_id, to_char(fecha, 'YYYY-MM-DD') fecha, obra_canonica_id, tipo_hora, fuente_legacy, horas
       from public.registros_hh where persona_id is not null and fecha between $1 and $2`, [desde, hasta])
  return rows
}

/** Foto de la base: filas y horas por mes y por obra, y el hh_real que ve la web. */
async function foto() {
  const [mes, obra, pvr, fuentes] = await Promise.all([
    query(`select to_char(coalesce(fecha, fecha_inicio_semana), 'YYYY-MM') mes, count(*)::int filas, sum(horas) horas from public.registros_hh group by 1 order by 1`),
    query(`select coalesce(obra_canonica_id, 'legacy:' || obra_id::text) obra, count(*)::int filas, sum(horas) filter (where tipo_hora in ('normal','extra_50','extra_100')) horas from public.registros_hh group by 1 order by 1`),
    query(`select obra_id, hh_real from public.obra_plan_vs_real where hh_real is not null order by 1`),
    query(`select fuente_legacy, count(*)::int filas, sum(horas) horas from public.registros_hh group by 1 order by 1`),
  ])
  return { mes: mes.rows, obra: obra.rows, pvr: pvr.rows, fuentes: fuentes.rows }
}

function imprimirResumen({ leidas, hallazgos, marcas, filas, falta, conflictos, obsoletas, mover, nombreObra }) {
  console.log(`\nJORNALES → registros_hh · año ${ANIO} · ${APLICAR ? 'APLICAR' : 'ENSAYO (no escribe)'}`)
  for (const l of leidas) console.log(`  pestaña «${l.pestana}»: ${l.filas} filas leídas · ${l.marcas} celdas diarias escritas`)
  for (const x of hallazgos) console.log(`  ! ${x.tipo} ${x.pestana ?? ''} ${x.fila1 ? 'f' + x.fila1 : ''} ${x.detalle ?? ''}`)
  const r = resumir(filas)
  const activas = new Set(filas.filter((f) => f.en_la_empresa).map((f) => f.persona_id)).size
  console.log(`\n  ${marcas.length} celdas → ${r.filas} filas · ${r.personas} personas (${activas} activas, ${r.personas - activas} inactivas)`)
  const origenes = filas.reduce((a, f) => (a[f.origen_obra] = (a[f.origen_obra] ?? 0) + 1, a), {})
  console.log(`  obra resuelta por: ${Object.entries(origenes).map(([k, v]) => `${k}=${v}`).join(' · ')}`)
  console.log('\n  POR MES        filas   horas trab.  ausencias  licencias  personas')
  for (const m of r.por_mes) console.log(`  ${m.clave}        ${String(m.filas).padStart(5)}  ${h(m.horas).padStart(11)}  ${String(m.ausencias).padStart(9)}  ${String(m.licencias).padStart(9)}  ${String(m.personas).padStart(8)}`)
  console.log('\n  POR OBRA')
  for (const o of r.por_obra) console.log(`  ${String(o.clave).padEnd(32)} ${String(o.filas).padStart(5)} filas  ${h(o.horas).padStart(9)} h  ${o.ausencias} aus.  ${o.personas} pers.  ${nombreObra.get(o.clave) ?? ''}`)
  console.log('\n  RÓTULO DE LA PLANILLA → OBRA (por qué, filas, horas trabajadas)')
  for (const r of mapaDeRotulos(filas)) console.log(`    ${r.rotulo.padEnd(44)} → ${String(r.obra_id).padEnd(24)} ${r.origen.padEnd(24)} ${String(r.filas).padStart(5)}  ${h(r.horas).padStart(9)} h`)
  console.log(`\n  FALTA_DATO · personas de la planilla que no están en \`personas\` (no se crean): ${falta.personas.length}`)
  for (const p of falta.personas) console.log(`    ${p.nombre.padEnd(28)} ${p.estado.padEnd(22)} ${String(p.n_dias).padStart(3)} días  ${h(p.horas).padStart(7)} h  ${p.pestanas.join(',')}${p.candidatos.length ? '  candidatos: ' + p.candidatos.join(' / ') : ''}`)
  console.log(`  FALTA_DATO · rótulos de obra sin resolver (filas NO escritas): ${falta.obras.length}`)
  for (const o of falta.obras) console.log(`    ${(o.cliente + ' · ' + o.obra).padEnd(40)} ${h(o.horas).padStart(8)} h  ${o.n_dias} días  ${o.personas.length} pers.  ${o.dias[0]}..${o.dias[o.dias.length - 1]}`)
  console.log(`  FALTA_DATO · celdas que no son horas (no se escriben): ${falta.celdas.length}`)
  for (const c of falta.celdas.slice(0, DETALLE ? 200 : 12)) console.log(`    ${c.pestana} f${c.fila1} ${c.fecha} ${c.nombre}: «${c.valor}»`)
  console.log(`\n  CONFLICTOS · (persona, fecha) con fila de OTRA fuente — no se tocan: ${conflictos.length}`)
  for (const c of conflictos.slice(0, DETALLE ? 500 : 30)) console.log(`    ${c.fila.persona} ${c.fila.fecha} ${c.fila.obra_canonica_id} ${c.fila.tipo_hora} ${c.fila.horas}h  ← ya hay ${[...new Set(c.existentes.map((e) => `${e.fuente_legacy} ${e.horas}h ${e.tipo_hora}`))].join(', ')}`)
  console.log(`  A MOVER · filas ${FUENTE} cuyo rótulo hoy resuelve a otra obra (se actualizan, no se duplican): ${mover.length}`)
  for (const m of mover.slice(0, DETALLE ? 500 : 20)) console.log(`    ${m.fila.persona} ${m.fila.fecha} ${m.fila.tipo_hora}: ${m.desde} → ${m.fila.obra_canonica_id}`)
  console.log(`  OBSOLETAS · filas ${FUENTE} que ya no salen de la planilla (quedan, no se borran): ${obsoletas.length}`)
  if (DETALLE) for (const o of obsoletas) console.log(`    ${o}`)
}

function imprimirFoto(titulo, antes, despues) {
  console.log(`\n  ${titulo}`)
  const claves = [...new Set([...antes.map((r) => Object.values(r)[0]), ...despues.map((r) => Object.values(r)[0])])].sort()
  for (const k of claves) {
    const a = antes.find((r) => Object.values(r)[0] === k); const d = despues.find((r) => Object.values(r)[0] === k)
    const fmt = (r) => (r ? Object.entries(r).slice(1).map(([c, v]) => `${c}=${h(v)}`).join(' ') : '—')
    if (fmt(a) !== fmt(d)) console.log(`    ${String(k).padEnd(32)} ${fmt(a)}  →  ${fmt(d)}`)
  }
}

async function aplicar(escribir, mover) {
  const cols = columnasParaUpsert(escribir)
  return withTx(async (tx) => {
    let movidas = 0
    for (const m of mover) movidas += (await tx.query(SQL_MOVER, [m.id, m.fila.obra_canonica_id, m.fila.horas, m.fila.notas])).rowCount
    const { rows } = await tx.query(SQL_UPSERT, cols)
    return { insertadas: rows.filter((r) => r.insertada).length, actualizadas: rows.filter((r) => !r.insertada).length, movidas }
  })
}

async function main() {
  const op = await operadorPara()
  if (!op) throw new Error('no hay cuenta de Google autorizada')
  const google = makeGoogleClient({ config: loadConfig(), scopes: READONLY_SCOPES, getToken: getTokenFor(op) })
  const [{ marcas, hallazgos, leidas, tabs }, cat] = await Promise.all([leerPestanas(google), catalogos()])
  console.log(`pestañas del archivo: ${tabs.join(' · ')}`)
  const plan = planDeRegistros(marcas, cat)
  const { importar: filas, anticipadas } = separarAnticipadas(plan.filas, HASTA)
  const falta = plan.falta
  console.log(`  hasta ${HASTA} (hoy en San Juan salvo --hasta): ${anticipadas.length} filas ANTICIPADAS en la planilla quedan afuera (${h(anticipadas.reduce((a, f) => a + f.horas, 0))} h)`)
  const fechas = filas.map((f) => f.fecha).sort()
  const existentes = fechas.length ? await existentesEntre(fechas[0], fechas[fechas.length - 1]) : []
  const { escribir, conflictos, obsoletas, mover } = separarConflictos(filas, existentes)
  imprimirResumen({ leidas, hallazgos, marcas, filas, falta, conflictos, obsoletas, mover, nombreObra: cat.nombreObra })
  console.log(`\n  A ESCRIBIR: ${escribir.length} filas · ${h(escribir.filter((f) => f.tipo_hora !== 'ausencia' && f.tipo_hora !== 'licencia').reduce((a, f) => a + f.horas, 0))} h trabajadas`)
  if (!APLICAR) { console.log('\nENSAYO: no se escribió nada. Con --aplicar se escribe y se relee.'); return }

  const antes = await foto()
  const res = await aplicar(escribir, mover)
  const despues = await foto()
  console.log(`\n  ESCRITO: ${res.insertadas} insertadas · ${res.actualizadas} actualizadas · ${res.movidas} movidas de obra (transacción confirmada)`)
  const { rows: [chk] } = await query(`select count(*)::int filas, sum(horas) horas from public.registros_hh where fuente_legacy = $1`, [FUENTE])
  console.log(`  RELEÍDO de la base: ${chk.filas} filas ${FUENTE} · ${h(chk.horas)} h (plan: ${escribir.length + mover.length} filas propias)`)
  imprimirFoto('registros_hh por MES · antes → después', antes.mes, despues.mes)
  imprimirFoto('registros_hh por OBRA (horas trabajadas) · antes → después', antes.obra, despues.obra)
  imprimirFoto('obra_plan_vs_real.hh_real · antes → después', antes.pvr, despues.pvr)
  imprimirFoto('por fuente · antes → después', antes.fuentes, despues.fuentes)
  if (chk.filas < escribir.length + mover.length) { console.error(`\nLa base tiene menos filas ${FUENTE} que el plan: revisar.`); process.exitCode = 1 }
}

main().catch((e) => { console.error(e); process.exitCode = 1 }).finally(() => closePool().catch(() => {}))
