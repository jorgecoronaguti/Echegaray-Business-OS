// SOLO LECTURA — camina el calendario para ver el piso corrido en pesos. Se borra al terminar.
import { makeGoogleClient, WORKSPACE_SCOPES } from './orquestador/lib/google.mjs'
import { loadConfig } from './orquestador/lib/config.mjs'
import { leerFlujoDeFondos, vencidoComercialDe } from './orquestador/lib/tesoreria/lectura-flujo.mjs'

const fmt = (n) => '$' + Math.round(n).toLocaleString('es-AR')
const google = makeGoogleClient({ config: loadConfig(), scopes: WORKSPACE_SCOPES })
const hoy = new Date('2026-08-03T12:00:00')
const flujo = await leerFlujoDeFondos({ google }, { hoy, dias: 90 })

const ARS = 99078164, VAL = 10290000, VENCIDO = 4700000 + 6464412, RESERVA = 41004461
for (const factor of [1, 0.5, 0]) {
  let saldo = ARS - VENCIDO
  let min = saldo; let fmin = 'dia 0'
  const hitos = {}
  let i = 0
  for (const d of flujo.dias) {
    if (i === 3) saldo += VAL // acreditación de valores a depositar
    saldo += (Number(d.ingresos) || 0) * factor - (Number(d.egresos) || 0)
    if (saldo < min) { min = saldo; fmin = d.fecha }
    if ([30, 60, 90].includes(i)) hitos[i] = { neto: saldo, piso: min, fmin }
    i += 1
  }
  console.log(`\n--- factor ingresos ${factor} ---`)
  for (const h of [30, 60, 90]) {
    const x = hitos[h]
    if (!x) { console.log(`  ${h}d: sin cobertura`); continue }
    console.log(`  ${h}d: neto ${fmt(x.neto)} | piso ${fmt(x.piso)} (${x.fmin}) | excedente=piso-reserva ${fmt(x.piso - RESERVA)}`)
  }
}

// Días con mayor egreso
const top = [...flujo.dias].sort((a, z) => (z.egresos || 0) - (a.egresos || 0)).slice(0, 8)
console.log('\n--- días de mayor egreso ---')
for (const d of top) console.log(`  ${d.fecha}  egresos ${fmt(d.egresos || 0)}  ingresos ${fmt(d.ingresos || 0)}`)

// Cruce cheques vs Compras vencidas (doble conteo)
console.log('\n--- COMPRAS vencidas (posible doble conteo con cheques) ---')
for (const m of flujo.movimientos.filter((x) => x.status === 'vencido' && x.direction === 'out')) {
  console.log(`  ${m.sheet_name} | ${m.counterparty} | ${fmt(m.amount)} | ${m.expected_date}`)
}
console.log('\n--- CHEQUES EMITIDOS en calendario (proveedor) ---')
for (const m of flujo.movimientos.filter((x) => /Cheques/i.test(String(x.sheet_name)))) {
  console.log(`  ${m.counterparty} | ${fmt(m.amount)} | ${m.expected_date}`)
}
