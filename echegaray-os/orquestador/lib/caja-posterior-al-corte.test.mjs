import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  formulaCobrosPosteriores, formulaChequesDebitadosPosteriores, formulaNetaPosterior,
  formulaUltimoSaldo, formulaFechaCorte, COB, CHQ,
} from './caja-posterior-al-corte.mjs'

test('los cobros posteriores miran SÓLO lo que el extracto no cubre', () => {
  const f = formulaCobrosPosteriores('$F$19')
  // La ventana empieza DESPUÉS del corte: con ">=" se contaría de nuevo lo que ya está en el saldo.
  assert.match(f, /">"&\$F\$19/)
  assert.doesNotMatch(f, />=/)
})

test('sólo suma lo COBRADO: un proyectado no es plata que esté', () => {
  const f = formulaCobrosPosteriores('$F$19')
  assert.match(f, /"Cobrado"/)
})

test('excluye los echeq, que ya están contados en la cartera', () => {
  assert.match(formulaCobrosPosteriores('$F$19'), /"<>Echeq"/)
})

test('la resta de cheques usa la fecha de DÉBITO, no la de emisión', () => {
  const f = formulaChequesDebitadosPosteriores('$F$19')
  assert.match(f, new RegExp(`\\$${CHQ.fechaPago}\\$${CHQ.desde}`))
  assert.match(f, /"SI"/)
})

test('la línea es NETA: un solo lado inflaría la caja para siempre', () => {
  const f = formulaNetaPosterior('$F$19')
  assert.ok(f.startsWith('='))
  assert.ok(f.includes('-SUMIFS'), 'tiene que restar los cheques debitados')
  assert.equal(f.split('SUMIFS').length - 1, 2)
})

test('las fórmulas van en es-AR: separador ; y nunca ,', () => {
  const f = formulaNetaPosterior('$F$19')
  assert.ok(!f.includes(','), 'una coma acá rompe la fórmula en un archivo es-AR')
})

test('el último saldo no depende de cuántos movimientos tenga la réplica', () => {
  const f = formulaUltimoSaldo()
  // Rango abierto: si mañana el extracto trae 200 movimientos en vez de 70, sigue funcionando.
  assert.match(f, /_BANCO_RAW!\$D\$4:\$D\b/)
})

test('NO usa LOOKUP: la búsqueda binaria devolvió un saldo del medio del extracto', () => {
  // Regresión de un error que llegó al archivo: LOOKUP(2;1/(rango<>"");rango) dio −$1.433.113 en vez
  // del último saldo, y ese número viajó al total de CAJA y a los dos cash flows sin dar error.
  const f = formulaUltimoSaldo()
  assert.doesNotMatch(f, /LOOKUP/)
  assert.match(f, /^=INDEX\(/)
})

test('el desplazamiento de fila acompaña a la primera fila de datos', () => {
  // INDEX cuenta desde el inicio del rango, no desde la fila 1 de la hoja: si el rango arranca en la
  // 4, hay que restar 3. Un offset fijo devolvería el movimiento equivocado al cambiar el encabezado.
  assert.match(formulaUltimoSaldo('_X', 'D', 4), /\)\)-3\)$/)
  assert.match(formulaUltimoSaldo('_X', 'D', 10), /\)\)-9\)$/)
})

test('la fecha de corte se LEE de la réplica, no se escribe a mano', () => {
  assert.equal(formulaFechaCorte(), '=MAX(_BANCO_RAW!$A$4:$A)')
})

test('las columnas de Cobranzas son las verificadas contra el encabezado real', () => {
  assert.deepEqual(
    { total: COB.total, forma: COB.forma, estado: COB.estado, fecha: COB.fecha },
    { total: 'M', forma: 'N', estado: 'O', fecha: 'Q' },
  )
})
