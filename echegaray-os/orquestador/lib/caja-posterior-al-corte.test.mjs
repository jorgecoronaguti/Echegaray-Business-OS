import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  formulaCobrosPosteriores, formulaChequesDebitadosPosteriores, formulaNetaPosterior,
  formulaUltimoSaldo, formulaFechaCorte, COB, CHQ,
  formulaSaldoDelDia, formulaFechaDelDia, formulaFechaConfirmada, formulaMovimientosDelDia, formulaDetalleDelDia,
} from './caja-posterior-al-corte.mjs'

// ═══ EL SALDO DEL DÍA (23/07) ═══
//
// La disponibilidad salía de la última celda NO VACÍA de la columna de saldos, y los movimientos del
// día llegan sin saldo corrido: CAJA mostraba $4.982.191,63 con $4.813.461,54 en la cuenta.
test('la disponibilidad del banco es el saldo DECLARADO, con el confirmado de respaldo', () => {
  const f = formulaSaldoDelDia('SALDO_BANCO_DECLARADO')
  assert.ok(f.startsWith('=IF(SALDO_BANCO_DECLARADO="";'), f)
  // El respaldo es el último saldo confirmado, no un número pegado ni un cero.
  assert.ok(f.includes('INDEX(_BANCO_RAW!$D$4:$D'), f)
  assert.ok(f.endsWith(';SALDO_BANCO_DECLARADO)'), f)
  // Y la fecha acompaña al saldo que se muestra: un saldo del 22 rotulado 23 saltea un día de la
  // ventana de "movimientos posteriores al corte".
  const g = formulaFechaDelDia('SALDO_BANCO_FECHA')
  assert.ok(g.startsWith('=IF(SALDO_BANCO_FECHA="";MAX(_BANCO_RAW!$A$4:$A)'), g)
})

test('la fecha del saldo confirmado ignora los movimientos del día', () => {
  const f = formulaFechaConfirmada()
  // No es MAX de la columna de fechas: ésa incluye el día en curso, que es justo lo que no está
  // confirmado. Sólo cuentan las filas que traen saldo corrido.
  assert.ok(!/^=MAX\(/.test(f), f)
  assert.ok(f.includes('_BANCO_RAW!$D$4:$D<>""'), f)
})

test('los movimientos del día se identifican por NO tener saldo, y con su signo', () => {
  const f = formulaMovimientosDelDia()
  assert.ok(f.includes('_BANCO_RAW!$D$4:$D=""'), f)
  // Con signo: una compra resta y un depósito suma. Un ABS acá haría que todo sume.
  assert.ok(!f.includes('ABS('), f)
  // Y sólo filas con fecha real: una celda vacía no es un movimiento.
  assert.ok(f.includes('ISNUMBER(_BANCO_RAW!$A$4:$A)'), f)
  assert.ok(formulaDetalleDelDia().includes('TEXTJOIN'))
})

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

// ═══ QUE NO VUELVAN A CONVIVIR TRES TOPES SOBRE LA MISMA PESTAÑA ═══
//
// El 21/07 había rangos de Cobranzas terminando en la fila 200, en la 300 y en la 400 según qué
// script los escribiera. Cobranzas va por la 60: el día que pase la 200, las fórmulas viejas dejan
// de contar las filas nuevas SIN dar error —el cuadro sigue cuadrando, con menos plata— y la
// "diferencia contra el banco" acusa un desvío inventado. Este test lo hace medible.
test('todas las referencias a Cobranzas del repo terminan en la misma fila', async () => {
  const { readdir, readFile } = await import('node:fs/promises')
  const dirs = ['orquestador/lib', 'orquestador/scripts']
  const topes = new Map()
  for (const d of dirs) {
    for (const f of await readdir(d)) {
      if (!f.endsWith('.mjs') || f.includes('.test.')) continue
      const src = await readFile(`${d}/${f}`, 'utf8')
      for (const m of src.matchAll(/Cobranzas!\$[A-Z]{1,2}\$\d{1,3}:\$[A-Z]{1,2}\$(\d{1,4})/g)) {
        if (!topes.has(m[1])) topes.set(m[1], `${d}/${f}`)
      }
    }
  }
  assert.equal(topes.size, 1, `conviven ${topes.size} topes distintos: ${[...topes].map(([t, f]) => `${t} en ${f}`).join(' · ')}`)
})
