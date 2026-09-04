#!/usr/bin/env node
// ¿QUÉ PRONOSTICA MEJOR LA CAJA DE ESTA EMPRESA? Se contesta con backtest, no con opinión.
//
// Antes de instalar 2 GB de torch para un modelo de fundación hay que saber contra qué compite. Si
// «mañana es parecido a hoy» ya explica la serie, un modelo que no le gane es peso muerto.
//
//   node orquestador/scripts/forecast-benchmark.mjs [--h 7]

import { query } from '../lib/db.mjs'
import { backtest } from '../lib/ml/forecast.mjs'

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? Number(process.argv[i + 1]) : d }
const H = arg('--h', 7)

async function main() {
  // Neto diario del banco: lo que entró menos lo que salió, por día. Es la serie que decide si hay
  // plata la semana que viene.
  const q = await query(`
    select fecha::date d, sum(importe)::float8 neto,
           sum(case when importe > 0 then importe else 0 end)::float8 entradas,
           sum(case when importe < 0 then -importe else 0 end)::float8 salidas
      from public.banco_movimientos
     group by 1 order by 1`)

  if (q.rows.length < 30) { console.log(`sólo ${q.rows.length} días de serie: no alcanza para un backtest honesto`); return }

  // LOS DÍAS SIN MOVIMIENTO SON CEROS, NO HUECOS. Saltearlos comprime la semana y destruye la
  // estacionalidad: el domingo desaparece y el lunes queda pegado al viernes.
  // LA CLAVE DEL DÍA TIENE QUE SER ISO, Y `String(unDate)` NO LO ES.
  //
  // `pg` devuelve `fecha::date` como un objeto Date, y `String(...)` sobre eso da «Thu May 28 2026
  // 00:00:00 GMT-0300», cuyos diez primeros caracteres son «Thu May 28». Ninguna clave coincidía y
  // la serie entera salía en CERO — con MAE $0 para los cinco métodos, que parecía un empate
  // perfecto y era una serie vacía. Un cero es un valor válido: por eso el defecto no se ve solo.
  const iso = (d) => (d instanceof Date ? d.toISOString() : String(d)).slice(0, 10)
  const d0 = new Date(q.rows[0].d), d1 = new Date(q.rows.at(-1).d)
  const porDia = new Map(q.rows.map((r) => [iso(r.d), r]))
  const serie = [], entradas = [], salidas = [], fechas = []
  for (let t = +d0; t <= +d1; t += 86400000) {
    const k = new Date(t).toISOString().slice(0, 10)
    const r = porDia.get(k)
    fechas.push(k); serie.push(r ? Number(r.neto) : 0)
    entradas.push(r ? Number(r.entradas) : 0); salidas.push(r ? Number(r.salidas) : 0)
  }

  const $ = (n) => (n == null ? '—' : `$${Math.round(n).toLocaleString('es-AR')}`)
  const pc = (n) => (n == null ? '—' : `${(n * 100).toFixed(1)}%`)
  console.log(`SERIE      ${fechas[0]} → ${fechas.at(-1)} · ${serie.length} días (${q.rows.length} con movimiento, ${serie.length - q.rows.length} en cero)`)
  console.log(`           neto diario mediano ${$(mediana(serie))} · entradas ${$(suma(entradas))} · salidas ${$(suma(salidas))}\n`)

  for (const [rotulo, s] of [['NETO DIARIO', serie], ['SALIDAS DIARIAS', salidas], ['ENTRADAS DIARIAS', entradas]]) {
    const r = backtest(s, { h: H, minimo: 21 })
    const ordenado = Object.entries(r).sort((a, b) => (a[1].wape ?? 9) - (b[1].wape ?? 9))
    console.log(`── ${rotulo} · horizonte ${H} días · ${ordenado[0][1].ventanas} ventanas ──`)
    console.log('   método               MAE            WAPE')
    for (const [n, v] of ordenado) console.log(`   ${n.padEnd(20)} ${$(v.mae).padStart(14)}  ${pc(v.wape).padStart(7)}`)
    console.log(`   → gana «${ordenado[0][0]}»\n`)
  }

  // ── LA MISMA SERIE, AGREGADA POR SEMANA ──
  //
  // La caja no se decide por día: se decide por semana. Y agregar cambia el problema — el ruido de
  // «este pago cayó martes o miércoles» desaparece, y queda la señal de cuánta plata se mueve. Si
  // la serie es predecible en algún lado, es acá.
  const semanal = (a) => {
    const out = []
    for (let i = 0; i + 7 <= a.length; i += 7) out.push(a.slice(i, i + 7).reduce((x, y) => x + y, 0))
    return out
  }
  console.log('══ LA MISMA SERIE, POR SEMANA ══')
  for (const [rotulo, s] of [['NETO SEMANAL', semanal(serie)], ['SALIDAS SEMANALES', semanal(salidas)]]) {
    const r = backtest(s, { h: 2, minimo: 6 })
    const ordenado = Object.entries(r).sort((a, b) => (a[1].wape ?? 9) - (b[1].wape ?? 9))
    console.log(`\n── ${rotulo} · ${s.length} semanas · horizonte 2 semanas · ${ordenado[0][1].ventanas} ventanas ──`)
    for (const [n, v] of ordenado) console.log(`   ${n.padEnd(20)} ${$(v.mae).padStart(14)}  ${pc(v.wape).padStart(7)}`)
  }

  console.log('\nLO QUE ESTO DECIDE: si el mejor de estos deja un WAPE alto, un modelo de fundación')
  console.log('tiene lugar. Si ya explica la serie, instalarlo sería peso muerto.')
}

const suma = (a) => a.reduce((x, y) => x + y, 0)
const mediana = (a) => { const s = a.slice().sort((x, y) => x - y); const k = Math.floor(s.length / 2); return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2 }

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then(() => process.exit(0)).catch((e) => { console.error('ERROR:', e.stack || e.message); process.exit(1) })
}
