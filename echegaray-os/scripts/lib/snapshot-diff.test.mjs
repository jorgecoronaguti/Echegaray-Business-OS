#!/usr/bin/env node
// Validación local del comparador de snapshots (scripts/lib/snapshot-diff.mjs).
// Datos sintéticos, sin secretos. Exit 0 = OK, exit 1 = falla.
//
// Uso: node scripts/lib/snapshot-diff.test.mjs

import { mismosDatosReales, datosReales } from './snapshot-diff.mjs'

let ok = 0
let fail = 0
function check(nombre, actual, esperado) {
  if (JSON.stringify(actual) === JSON.stringify(esperado)) {
    ok++
  } else {
    fail++
    console.error(`FALLA: ${nombre}\n  esperado: ${JSON.stringify(esperado)}\n  obtenido: ${JSON.stringify(actual)}`)
  }
}

// Snapshot base sintético con datos reales + frescura.
const base = {
  saldoHoy: 1000,
  vencidos: [{ fecha: '2026-07-01', tipo: 'cobro', quien: 'X', detalle: 'y', monto: 500 }],
  dias: [
    {
      fecha: '2026-07-11',
      movimientos: [{ fecha: '2026-07-11', tipo: 'pago', quien: 'Z', detalle: 'w', monto: -200 }],
      neto: -200,
      acumulado: 800,
    },
  ],
  totalCobros: 500,
  totalPagos: -200,
  leidoEn: '11/7/2026, 07:00:00',
}
const clon = (o) => JSON.parse(JSON.stringify(o))

// 1) Mismo contenido + distinto leidoEn => SIN cambio de datos.
const soloFrescura = clon(base)
soloFrescura.leidoEn = '11/7/2026, 11:00:00'
check('mismos datos + distinto leidoEn = sin cambio', mismosDatosReales(base, soloFrescura), true)

// 2) Cambio en saldoHoy => cambio real.
const cambioSaldo = clon(base)
cambioSaldo.saldoHoy = 1234
cambioSaldo.leidoEn = base.leidoEn // mismo timestamp: aísla el cambio al saldo
check('cambio en saldoHoy = cambio real', mismosDatosReales(base, cambioSaldo), false)

// 3) Cambio en movimientos (dias) => cambio real.
const cambioMovs = clon(base)
cambioMovs.dias[0].movimientos[0].monto = -999
check('cambio en movimientos = cambio real', mismosDatosReales(base, cambioMovs), false)

// 4) Cambio en vencidos => cambio real.
const cambioVenc = clon(base)
cambioVenc.vencidos.push({ fecha: '2026-07-02', tipo: 'cobro', quien: 'N', detalle: 'm', monto: 10 })
check('cambio en vencidos = cambio real', mismosDatosReales(base, cambioVenc), false)

// 5) Cambio en totales => cambio real.
const cambioTot = clon(base)
cambioTot.totalPagos = -201
check('cambio en totalPagos = cambio real', mismosDatosReales(base, cambioTot), false)

// 6) Sin snapshot anterior (primera corrida) => se considera cambio (escribir).
check('sin anterior = cambio (escribe)', mismosDatosReales(base, null), false)

// 7) datosReales ignora leidoEn y solo expone los 5 campos.
check('datosReales no incluye leidoEn', Object.keys(datosReales(base)).sort(), ['dias', 'saldoHoy', 'totalCobros', 'totalPagos', 'vencidos'])

console.log(`\ncomparador snapshot: ${ok} OK, ${fail} FALLA(S)`)
process.exit(fail === 0 ? 0 : 1)
