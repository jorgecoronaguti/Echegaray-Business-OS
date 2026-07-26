// EL MAPA DE IMPACTO NO PUEDE TENER AGUJEROS.
//
// El valor de este archivo es un invariante: TODO movimiento que el banco puede mandar tiene un
// destino declarado en el Sheet. Si alguien agrega una naturaleza nueva a clasificarMovimiento y se
// olvida de asignarle destino, un evento bancario entraría al OS sin que se sepa a dónde impacta —
// exactamente el "no sólo en CAJA" que el dueño pidió que no pasara. Acá se cae el test antes.

import test from 'node:test'
import assert from 'node:assert/strict'
import { MOVIMIENTOS, MOVIMIENTOS_DIA } from './banco-santander.mjs'
import {
  DESTINOS, IMPACTO_UNIVERSAL, destinoDeMovimiento, resumirImpacto, creditosParaConciliar,
} from './impacto-bancario.mjs'

test('el extracto real ENTERO tiene destino para cada movimiento — ninguno queda sin mapear', () => {
  const todos = [...MOVIMIENTOS, ...MOVIMIENTOS_DIA]
  assert.ok(todos.length > 100, 'el extracto de referencia tiene que estar cargado')
  for (const m of todos) {
    // Si destinoDeMovimiento tira, es porque clasificarMovimiento emitió un bucket sin destino.
    const d = destinoDeMovimiento(m)
    assert.ok(d.destino.pestaña, `"${m.concepto}" (${d.bucket}) quedó sin pestaña destino`)
    assert.ok(d.destino.fuente, `"${d.bucket}" no declara su fuente en el código`)
  }
})

test('cada evento del impacto universal declara pestaña, mecanismo y fuente', () => {
  assert.ok(IMPACTO_UNIVERSAL.length >= 2)
  for (const e of IMPACTO_UNIVERSAL) {
    assert.ok(e.pestaña && e.mecanismo && e.fuente, `impacto universal incompleto: ${e.evento}`)
  }
})

test('los eventos clave caen en la pestaña correcta', () => {
  const dest = (concepto) => destinoDeMovimiento({ concepto, importe: -1 }).destino.pestaña
  assert.equal(dest('Impuesto ley 25.413 debito 0,6%'), 'Impuestos y Financieros')
  assert.equal(dest('Cobro de interes por descubierto - Del 08/06/26 al 07/07/26'), 'Caja')
  assert.equal(dest('Prestamos prendarios - 0179-039101464204'), 'Impuestos y Financieros')
  assert.equal(dest('Cheque debitado'), 'Cheques Emitidos')
  assert.match(dest('Transferencia realizada - A herrajes san juan'), /Compras/)
})

test('el impuesto al cheque cae a Impuestos y NO crea fila propia (lo lee de _BANCO_RAW)', () => {
  const d = destinoDeMovimiento({ concepto: 'Impuesto ley 25.413 debito 0,6%', importe: -1200 })
  assert.equal(d.bucket, 'Impuesto al cheque (Ley 25.413)')
  assert.equal(d.destino.escribe, 'no')
})

test('el cheque debitado escribe en la columna DEBITADO de Cheques Emitidos', () => {
  const d = destinoDeMovimiento({ concepto: 'Cheque debitado - Nº 221', importe: -200000 })
  assert.equal(d.destino.pestaña, 'Cheques Emitidos')
  assert.equal(d.destino.escribe, 'columna DEBITADO')
})

test('resumirImpacto agrupa por naturaleza con monto y cantidad', () => {
  const movs = [
    { concepto: 'Impuesto ley 25.413 debito 0,6%', importe: -1000 },
    { concepto: 'Impuesto ley 25.413 debito 0,6%', importe: -2000 },
    { concepto: 'Cheque debitado', importe: -200000 },
  ]
  const r = resumirImpacto(movs)
  const imp = r.find((x) => x.bucket === 'Impuesto al cheque (Ley 25.413)')
  assert.equal(imp.cantidad, 2)
  assert.equal(imp.monto, -3000)
  assert.equal(r.find((x) => x.bucket === 'Cheques y echeq').cantidad, 1)
})

test('creditosParaConciliar separa cobranza de traslado y financiero (no todo crédito es ingreso)', () => {
  const movs = [
    { concepto: 'Deposito de efectivo', importe: 6440000 }, // traslado: plata propia
    { concepto: 'Transferencia recibida - credin - Id debin cuit 30710630670', importe: 11913568.24 }, // Balanz → financiero
    { concepto: 'Transferencia recibida - De un cliente', importe: 500000 }, // cobranza
    { concepto: 'Pago haberes - 260717507', importe: -250000 }, // débito: no entra
  ]
  const c = creditosParaConciliar(movs)
  assert.equal(c.traslado.length, 1)
  assert.equal(c.financiero.length, 1)
  assert.equal(c.cobranza.length, 1)
  assert.equal(c.cobranza[0].importe, 500000)
})

test('destinoDeMovimiento tira si una naturaleza no tiene destino declarado (el invariante)', () => {
  // Se simula el agujero: una naturaleza que existe en DESTINOS se borra y tiene que gritar.
  const guardado = DESTINOS['Cheques y echeq']
  try {
    delete DESTINOS['Cheques y echeq']
    assert.throws(() => destinoDeMovimiento({ concepto: 'Cheque debitado', importe: -1 }), /sin destino declarado/)
  } finally {
    DESTINOS['Cheques y echeq'] = guardado
  }
})
