import { makeGoogleClient, WRITE_SCOPES } from './orquestador/lib/google.mjs'
import { loadConfig } from './orquestador/lib/config.mjs'
import { query, closePool } from './orquestador/lib/db.mjs'
import { lotesDeHaberes, pagoDeQuincena, mesDe, semanaDe, iso } from './orquestador/lib/jornales-fecha-pago.mjs'
import { parseMonto, parseFecha } from './orquestador/lib/cash-briefing.mjs'

const ID = '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const g = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })

const { rows } = await query('select fecha, concepto, importe from public.banco_movimientos order by fecha')
const lotes = lotesDeHaberes(rows.map((r) => ({ fecha: r.fecha, concepto: r.concepto, importe: Number(r.importe) })))
console.log('LOTES DE HABERES EN EL EXTRACTO')
for (const l of lotes) console.log(`  ${iso(l.fecha)}  ${String(l.movimientos).padStart(3)} movs  $${Math.round(l.total).toLocaleString('es-AR')}`)

const v = await g.readSheetValues(ID, `'Jornales por Quincena'!A1:L90`)
const reales = [], proys = []
v.forEach((f, i) => {
  const fila = i + 1
  const desde = parseFecha(f?.[0]), hasta = parseFecha(f?.[1])
  if (!desde || !hasta) return
  if (fila >= 60 && fila <= 73) reales.push({ fila, desde, hasta, total: parseMonto(f?.[9]), clase: 'real' })
  if (fila >= 18 && fila <= 27) proys.push({ fila, desde, hasta, total: parseMonto(f?.[6]), clase: 'proyeccion' })
})
const todas = [...reales, ...proys]
const ars = (n) => '$' + Math.round(n).toLocaleString('es-AR')

console.log(`\nQUINCENAS: ${reales.length} reales + ${proys.length} proyectadas`)
const porMes = new Map(), porSem = new Map()
const bump = (m, k, v) => m.set(k, (m.get(k) ?? 0) + v)
console.log('\nquincena            total        HOY(hasta)    PAGO        origen      mes hoy→mes pago   semana hoy→semana pago')
for (const q of todas) {
  const manual = iso(q.hasta) === '2026-07-31' ? '2026-08-03' : null
  const r = pagoDeQuincena(q.hasta, lotes, { manual })
  const m0 = mesDe(q.hasta), m1 = mesDe(r.pago)
  const s0 = semanaDe(q.hasta), s1 = semanaDe(r.pago)
  if (m0 !== m1) { bump(porMes, m0, -q.total); bump(porMes, m1, q.total) }
  if (s0 !== s1) { bump(porSem, s0, -q.total); bump(porSem, s1, q.total) }
  console.log(`${iso(q.desde)}→${iso(q.hasta)} ${ars(q.total).padStart(12)}  ${iso(q.hasta)}  ${iso(r.pago)}  ${r.origen.padEnd(10)} ${m0.slice(0, 7)}→${m1.slice(0, 7)}  ${s0}→${s1}  ${m0 !== m1 ? '⇐ CAMBIA DE MES' : ''}`)
}
console.log('\nMOVIMIENTO NETO POR MES (mensual):')
for (const [k, n] of [...porMes].sort()) console.log(`  ${k.slice(0, 7)}  ${n >= 0 ? '+' : ''}${ars(n)}`)
console.log('\nMOVIMIENTO NETO POR SEMANA (semanal):')
for (const [k, n] of [...porSem].sort()) console.log(`  semana del ${k}  ${n >= 0 ? '+' : ''}${ars(n)}`)
console.log(`\nTOTAL de las 24 quincenas: ${ars(todas.reduce((s, q) => s + q.total, 0))}`)
console.log(`  reales ${ars(reales.reduce((s, q) => s + q.total, 0))} · proyectadas ${ars(proys.reduce((s, q) => s + q.total, 0))}`)
// ── LA COLUMNA MENSUAL, ANTES Y DESPUÉS ──
const antes = new Map(), despues = new Map()
for (const q of todas) {
  const manual = iso(q.hasta) === '2026-07-31' ? '2026-08-03' : null
  const r = pagoDeQuincena(q.hasta, lotes, { manual })
  bump(antes, mesDe(q.hasta), q.total)
  bump(despues, mesDe(r.pago), q.total)
}
console.log('\nLINEA "Nomina · Jornales de obra" DEL CASH FLOW MENSUAL')
console.log('mes        por HASTA (hoy)      por FECHA DE PAGO      diferencia')
const listaMeses = [...new Set([...antes.keys(), ...despues.keys()])].sort()
let t0 = 0, t1 = 0
for (const m of listaMeses) {
  const a = antes.get(m) ?? 0, d = despues.get(m) ?? 0
  t0 += a; t1 += d
  console.log(`${m.slice(0, 7)}   ${ars(a).padStart(16)}   ${ars(d).padStart(18)}   ${(d - a >= 0 ? '+' : '') + ars(d - a)}`)
}
console.log(`TOTAL     ${ars(t0).padStart(16)}   ${ars(t1).padStart(18)}`)
const en2026 = listaMeses.filter((m) => m.startsWith('2026'))
console.log(`ANIO 2026 ${ars(en2026.reduce((s, m) => s + (antes.get(m) ?? 0), 0)).padStart(16)}   ${ars(en2026.reduce((s, m) => s + (despues.get(m) ?? 0), 0)).padStart(18)}`)

await closePool()
