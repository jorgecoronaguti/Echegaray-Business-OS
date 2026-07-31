import test from 'node:test'
import assert from 'node:assert/strict'
import { parsearDJIVA, posicionOficialIva, montoAR } from './iva-ddjj.mjs'

// Texto REAL de las F.2051 presentadas (tal como las devuelve la lectura del PDF). Dos formatos
// conviven: el nuevo (jun/may, rótulo e importe en el mismo renglón) y el viejo (ene–abr, partidos
// en varias líneas). El parser normaliza el espacio, así que ambos deben dar el mismo resultado.

const JUN = `F.2051 - DJ IVA - SIMPLE
CUIT 30-71630464-3
Período 202606
Fecha de Presentación 20/07/2026
Denominación ECHEGARAY CONSTRUCCIONES S.A.S.
Nro. de Transacción 1183696115
Determinación del impuesto
Total del débito fiscal del período $ 6.958.948,76
Total del crédito fiscal del período $ 3.682.742,64
Saldo técnico a favor del contribuyente del período anterior $ 4.898.024,80
Saldo técnico a favor del contribuyente $ 1.621.818,68
Determinación de la posición mensual
Saldo técnico a favor de ARCA $ 0,00
Saldo técnico a favor del contribuyente $ 1.621.818,68
Saldo a favor de libre disponibilidad del período anterior neto de usos $ 19.318.255,41
Total de retenciones, percepciones y pagos a cuenta neto de restituciones $ 26.655,16
Saldo de libre disponibilidad a favor del contribuyente del período $ 19.344.910,57`

// Marzo: el ÚNICO mes con posición a favor de ARCA (se debe), y con el formato viejo partido.
const MAR = `F.2051 - DJ IVA - SIMPLE
IMPUESTO AL VALOR
AGREGADO
CUIT
30-71630464-3
Período
202603
Fecha de Presentación
20/04/2026
Nro. de Transacción
1164476413
Determinación del impuesto
Total del débito fiscal del período
$ 16.475.540,46
Total del crédito fiscal del período
$ 1.643.214,68
Saldo técnico a favor del contribuyente del período anterior
$ 4.083.049,77
Saldo técnico a favor de ARCA
$ 10.749.276,01
Determinación de la posición mensual
Saldo técnico a favor de ARCA
$ 10.749.276,01
Saldo a favor de libre disponibilidad del período anterior neto de usos
$ 25.836.240,88
Total de retenciones, percepciones y pagos a cuenta neto de restituciones
$ 1.326.038,20
Saldo de libre disponibilidad a favor del contribuyente del período
$ 16.413.003,07`

test('montoAR: es-AR con signo $ y decimales', () => {
  assert.equal(montoAR('$ 19.344.910,57'), 19344910.57)
  assert.equal(montoAR('0,00'), 0)
})

test('parsearDJIVA (junio): saldo a favor, libre disponibilidad y sin pago en efectivo', () => {
  const d = parsearDJIVA(JUN)
  assert.equal(d.periodo, '2026-06')
  assert.equal(d.fecha_presentacion, '20/07/2026')
  assert.equal(d.nro_transaccion, '1183696115')
  assert.equal(d.debito, 6958948.76)
  assert.equal(d.credito, 3682742.64)
  assert.equal(d.saldo_contrib, 1621818.68)
  assert.equal(d.debe_arca, false)                 // junio está a favor del contribuyente
  assert.equal(d.posicion_tecnica, -1621818.68)    // negativo = a favor
  assert.equal(d.libre_disp, 19344910.57)          // la plata inmovilizada real
  assert.equal(d.a_pagar_efectivo, 0)              // NO sale plata por IVA
})

test('parsearDJIVA (marzo): posición a favor de ARCA absorbida por el crédito (0 en efectivo)', () => {
  const d = parsearDJIVA(MAR)
  assert.equal(d.periodo, '2026-03')
  assert.equal(d.debito, 16475540.46)
  assert.equal(d.credito, 1643214.68)
  assert.equal(d.saldo_arca, 10749276.01)
  assert.equal(d.debe_arca, true)                  // marzo debe técnicamente
  assert.equal(d.posicion_tecnica, 10749276.01)    // positivo = se debe
  assert.equal(d.libre_disp, 16413003.07)
  // NO se paga en efectivo: lo absorbe el crédito de libre disponibilidad que venía.
  assert.equal(d.a_pagar_efectivo, 0)
  // Coherencia contable del F.2051: libre_disp_ant + retenc − deuda_arca = libre_disp del período.
  assert.equal(
    Math.round((d.libre_disp_anterior + d.retenciones_percep - d.saldo_arca) * 100) / 100,
    16413003.07,
  )
})

test('posicionOficialIva: toma el último mes y detecta que NO se paga IVA en efectivo', () => {
  const pos = posicionOficialIva([parsearDJIVA(MAR), parsearDJIVA(JUN)])
  assert.equal(pos.ultima.periodo, '2026-06')
  assert.equal(pos.libre_disponibilidad, 19344910.57)  // la de junio, el mes más nuevo
  assert.equal(pos.paga_iva_efectivo, false)           // ningún mes sale plata
  assert.equal(pos.meses.length, 2)
})
