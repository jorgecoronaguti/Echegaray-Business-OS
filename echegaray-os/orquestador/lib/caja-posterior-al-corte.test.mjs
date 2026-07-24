import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  formulaCobrosPosteriores, formulaChequesDebitadosPosteriores, formulaComprasPagadasPosteriores,
  formulaNetaPosterior, formulaUltimoSaldo, formulaFechaCorte, COB, CHQ, CMP,
} from './caja-posterior-al-corte.mjs'

test('las compras pagadas posteriores restan sólo Transferencia y Débito, después del corte', () => {
  const f = formulaComprasPagadasPosteriores('$F$19')
  assert.match(f, /'Compras'!\$X\$4:\$X\$1200;"Pagado"/) // estado
  assert.match(f, /"Transferencia"/)
  assert.match(f, /"Débito"/)
  assert.match(f, /'Compras'!\$AD\$4:\$AD\$1200;">"&\$F\$19/) // ventana posterior al corte
  // NO se cuentan los medios ya cubiertos por otra línea (doble conteo).
  assert.doesNotMatch(f, /"Efectivo"|"Cheque"|"Echeq"|"Tarjeta/)
  assert.doesNotMatch(f, />=/)
})

test('la línea neta ahora también resta las compras pagadas por banco', () => {
  const f = formulaNetaPosterior('$F$19')
  // cobros − cheques debitados − compras (transferencia/débito)
  assert.match(f, /-\(SUMIFS\('Compras'/)
  assert.match(f, /"Pagado"/)
  // sigue siendo neta de los tres, no sólo cobros
  assert.ok(f.includes('Cobranzas') && f.includes('Cheques Emitidos') && f.includes('Compras'))
})

test('CMP excluye los medios que ya cuenta otra línea (no doble conteo)', () => {
  assert.deepEqual(CMP.tiposBanco, ['Transferencia', 'Débito'])
  assert.ok(!CMP.tiposBanco.includes('Cheque') && !CMP.tiposBanco.includes('Efectivo') && !CMP.tiposBanco.includes('Tarjeta Crédito'))
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
  // 4 SUMIFS: cobros + cheques debitados + compras (transferencia) + compras (débito).
  assert.equal(f.split('SUMIFS').length - 1, 4)
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

test('ignora los saldos en 0 de los movimientos del día — el último saldo es el último REAL', () => {
  // Regresión del bug que dejó la CAJA en liquidez neta falsa −$710.857 (23/07). Los movimientos del
  // día se anexan sin saldo (el banco no lo publica hasta el cierre) y el importador los escribe con
  // saldo 0. `<>""` es verdadero para un 0, así que la fórmula tomaba esa fila y devolvía 0: Santander
  // aparecía en $0. Un saldo bancario de exactamente 0,00 no existe; el último saldo es el último
  // número distinto de cero.
  const f = formulaUltimoSaldo()
  assert.match(f, /ISNUMBER\(/)
  assert.match(f, /<>0/)
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
