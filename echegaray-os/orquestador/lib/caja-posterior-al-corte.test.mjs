import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  formulaCobrosPosteriores, formulaChequesDebitadosPosteriores, formulaComprasPagadasPosteriores,
  formulaNetaPosterior, formulaUltimoSaldo, formulaFechaCorte, COB, CHQ, CMP,
  formulaCobrosEfectivoPosteriores, formulaComprasEfectivoPosteriores,
  formulaDepositosEfectivoPosteriores, formulaNetaEfectivoPosterior, DEP,
} from './caja-posterior-al-corte.mjs'
import { COL_FECHA_CAJA, colIndex } from './rubro-caja.mjs'

test('las compras pagadas posteriores restan sólo Transferencia y Débito, después del corte', () => {
  const f = formulaComprasPagadasPosteriores('$F$19')
  // SUMPRODUCT, no SUMIFS: la "Fecha de caja" viene en formato mixto serie/texto y SUMIFS perdía las de texto.
  assert.match(f, /^SUMPRODUCT\(/)
  assert.doesNotMatch(f, /SUMIFS/)
  assert.match(f, /'Compras'!\$X\$4:\$X\$1200="Pagado"/) // estado
  assert.match(f, /"Transferencia"/)
  assert.match(f, /"Débito"/)
  // ventana posterior al corte, con la fecha COACCIONADA (DATEVALUE del texto, N() del serial)
  assert.match(f, /IFERROR\(DATEVALUE\('Compras'!\$AD\$4:\$AD\$1200&""\);N\('Compras'!\$AD\$4:\$AD\$1200\)\)>\$F\$19/)
  // el total se coacciona con N(): SUMPRODUCT no tolera texto en la columna que suma
  assert.match(f, /N\('Compras'!\$O\$4:\$O\$1200\)/)
  // NO se cuentan los medios ya cubiertos por otra línea (doble conteo).
  assert.doesNotMatch(f, /"Efectivo"|"Cheque"|"Echeq"|"Tarjeta/)
  assert.doesNotMatch(f, />=/)
})

// ═══ EL CONTRATO ESCRITOR↔LECTOR DE LA COLUMNA "FECHA DE CAJA" ═══
//
// El efecto directo de un pago en Compras sobre CAJA depende de que la columna que rubro-caja-sheet
// ESCRIBE ("Fecha de caja") sea EXACTAMENTE la que esta lib LEE (CMP.fecha). Antes cada archivo tenía
// su propia letra tipeada a mano; si una se movía y la otra no, el pago dejaba de descargar de la
// caja sin dar error. Ahora la letra es una sola constante importada, y esto lo verifica.
test('CAJA lee la MISMA columna "Fecha de caja" que rubro-caja-sheet escribe (una sola definición)', () => {
  assert.equal(CMP.fecha, COL_FECHA_CAJA)
})

test('colIndex traduce letras de Sheet a 0-based: la "Fecha de caja" es la AD (29)', () => {
  assert.equal(colIndex('A'), 0)
  assert.equal(colIndex('AA'), 26)
  assert.equal(colIndex(COL_FECHA_CAJA), 29) // AD
  assert.equal(colIndex(CMP.total), 14)      // O = Total
})

test('el escritor NO vuelve a hardcodear la columna: la toma de la constante compartida', async () => {
  // Si mañana alguien pone `const COL_FECHA = 29` de nuevo en el script, el contrato se puede
  // desincronizar en silencio. El generador tiene que derivar la columna de COL_FECHA_CAJA.
  const { readFile } = await import('node:fs/promises')
  const src = await readFile('orquestador/scripts/rubro-caja-sheet.mjs', 'utf8')
  assert.match(src, /colIndex\(COL_FECHA_CAJA\)/)
  assert.match(src, /colIndex\(COL_RUBRO_CAJA\)/)
  assert.doesNotMatch(src, /const COL_FECHA = \d/)
  assert.doesNotMatch(src, /const COL_RUBRO = \d/)
})

test('la línea neta ahora también resta las compras pagadas por banco', () => {
  const f = formulaNetaPosterior('$F$19')
  // cobros − cheques debitados − compras (transferencia/débito), estas últimas por SUMPRODUCT tolerante a texto
  assert.match(f, /-\(SUMPRODUCT\(\('Compras'/)
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

// ═══ LA PARTICIÓN POR CANAL: EL EFECTIVO NO ESTÁ EN EL BANCO, ESTÁ EN LA CAJA FÍSICA (T06) ═══

test('el banco NO cuenta el efectivo: va a la caja física, no duplicar', () => {
  // Si el banco contara el efectivo y la caja física también, el mismo peso quedaría dos veces en el
  // total. La partición por canal (echeq/efectivo/banco) lo impide por construcción.
  const f = formulaCobrosPosteriores('$F$19')
  assert.match(f, /"<>Efectivo"/)
  assert.match(f, /"<>Echeq"/)
})

test('la línea del banco: 2 SUMIFS (cobros, cheques) + 1 SUMPRODUCT (compras, tolerante a fecha-texto)', () => {
  // Excluir el efectivo es un criterio MÁS dentro del mismo SUMIFS de cobros, no un SUMIFS nuevo.
  // Compras pasó a un SOLO SUMPRODUCT (transferencia+débito juntos), no dos SUMIFS.
  const f = formulaNetaPosterior('$F$19')
  assert.equal(f.split('SUMIFS').length - 1, 2)
  assert.equal(f.split('SUMPRODUCT').length - 1, 1)
})

test('cobros en efectivo posteriores: SÓLO Efectivo, SÓLO Cobrado, DESPUÉS del arqueo', () => {
  const f = formulaCobrosEfectivoPosteriores('$F$4')
  assert.match(f, /'Cobranzas'!\$O\$5:\$O\$400;"Cobrado"/) // estado
  assert.match(f, /'Cobranzas'!\$N\$5:\$N\$400;"Efectivo"/) // forma de cobro
  assert.match(f, /'Cobranzas'!\$Q\$5:\$Q\$400;">"&\$F\$4/) // ventana posterior al arqueo
  // La ventana es EXCLUSIVA: con ">=" un cobro del día del arqueo se contaría de nuevo (ya está en él).
  assert.doesNotMatch(f, />=/)
})

test('pagos en efectivo posteriores: Compras Pagado/Efectivo por Fecha de caja (tolerante a texto), DESPUÉS del arqueo', () => {
  const f = formulaComprasEfectivoPosteriores('$F$4')
  assert.match(f, /^SUMPRODUCT\(/)
  assert.doesNotMatch(f, /SUMIFS/)
  assert.match(f, /'Compras'!\$X\$4:\$X\$1200="Pagado"/) // estado
  assert.match(f, /'Compras'!\$P\$4:\$P\$1200="Efectivo"/) // tipo de pago
  // Fecha de caja coaccionada, ventana posterior al arqueo
  assert.match(f, new RegExp(`IFERROR\\(DATEVALUE\\('Compras'!\\$${CMP.fecha}\\$4:\\$${CMP.fecha}\\$1200&""\\);N\\('Compras'!\\$${CMP.fecha}\\$4:\\$${CMP.fecha}\\$1200\\)\\)>\\$F\\$4`))
  assert.match(f, /N\('Compras'!\$O\$4:\$O\$1200\)/) // total coaccionado
  assert.doesNotMatch(f, />=/)
})

test('el pago en efectivo usa el MISMO medio que el banco deja afuera (partición del lado de los pagos)', () => {
  // El banco cuenta Transferencia/Débito; la caja física cuenta Efectivo. Sin intersección.
  assert.ok(!CMP.tiposBanco.includes('Efectivo'))
  assert.match(formulaComprasEfectivoPosteriores('$F$4'), /"Efectivo"/)
})

test('los depósitos de efectivo se detectan como en la alerta 4.6 y sólo los posteriores al arqueo', () => {
  const f = formulaDepositosEfectivoPosteriores('$F$4')
  assert.match(f, /_BANCO_RAW!\$E\$4:\$E="entra"/) // es un crédito
  assert.match(f, /deposito de efectivo/) // el concepto del banco
  assert.match(f, /_BANCO_RAW!\$A\$4:\$A>\$F\$4/) // ventana posterior al arqueo
  // ISNUMBER sobre la fecha: una fecha guardada como texto metería un depósito viejo en la ventana.
  assert.match(f, /ISNUMBER\(_BANCO_RAW!\$A\$4:\$A\)/)
})

test('la línea neta de la caja física: cobros − pagos − depósitos, guardada por el arqueo', () => {
  const f = formulaNetaEfectivoPosterior('$F$4')
  assert.ok(f.startsWith('='))
  // Sin arqueo con fecha no hay ventana: da 0 en vez de inventar plata en el cajón.
  assert.match(f, /^=IF\(NOT\(ISNUMBER\(\$F\$4\)\);0;/)
  // 1 SUMIFS (cobros efectivo) + 2 SUMPRODUCT (pagos efectivo tolerante a texto + depósitos).
  assert.equal(f.split('SUMIFS').length - 1, 1)
  assert.equal(f.split('SUMPRODUCT').length - 1, 2)
  // Cobros suman, pagos y depósitos restan.
  assert.match(f, /;"Cobrado";.*"Efectivo".*\)-SUMPRODUCT/) // cobros, luego resta el pago
  assert.match(f, /\)-SUMPRODUCT/) // resta el depósito
})

test('sin réplica del extracto, la caja física no resta depósitos (no restar un cero disfrazado)', () => {
  const f = formulaNetaEfectivoPosterior('$F$4', { bancoRaw: null })
  // Sigue el pago en efectivo (1 SUMPRODUCT tolerante a texto) pero YA NO el depósito: sin _BANCO_RAW no se detecta.
  assert.equal(f.split('SUMPRODUCT').length - 1, 1)
  assert.doesNotMatch(f, /deposito de efectivo/)
  assert.equal(f.split('SUMIFS').length - 1, 1) // sólo cobros (efectivo)
})

test('las fórmulas de efectivo van en es-AR: separador ; y nunca ,', () => {
  assert.ok(!formulaNetaEfectivoPosterior('$F$4').includes(','))
  assert.ok(!formulaCobrosEfectivoPosteriores('$F$4').includes(','))
  assert.ok(!formulaComprasEfectivoPosteriores('$F$4').includes(','))
  assert.ok(!formulaDepositosEfectivoPosteriores('$F$4').includes(','))
})

// ═══ EL COLAPSO CONTRA UN ARQUEO NUEVO Y LA EXCLUSIVIDAD DE VENTANA ═══
//
// No hay motor de cálculo de Sheets acá, así que se prueba la PROPIEDAD ESTRUCTURAL que garantiza el
// colapso: la ventana de cada canal está anclada a la referencia de SU corte y usa ">" (estricto).
// Un arqueo nuevo es una fecha mayor en esa misma celda ancla; todo lo de fecha ≤ arqueo cae fuera de
// ">" — colapsa dentro del arqueo — sin tocar ninguna otra fórmula.
test('la ventana de efectivo cuelga del arqueo que se le pase: cambiar el ancla mueve el corte entero', () => {
  const viejo = formulaNetaEfectivoPosterior('$F$4')
  const nuevo = formulaNetaEfectivoPosterior('$F$99')
  // Toda referencia al ancla vieja desaparece cuando el arqueo se registra en otra celda.
  assert.ok(!viejo.includes('$F$99') && !nuevo.includes('$F$4'))
  // El ancla aparece en la guarda ISNUMBER y en los TRES términos (cobros, pagos, depósitos): al
  // registrar un arqueo nuevo, la ventana ">" de los tres se corre junta y lo viejo colapsa.
  assert.equal((nuevo.match(/\$F\$99/g) || []).length, 4)
})

test('la exclusividad es por construcción: efectivo y banco no comparten ninguna forma de cobro', () => {
  // El banco: forma <> Echeq y <> Efectivo. La caja física: forma = Efectivo. La cartera: Echeq.
  // Los tres conjuntos de "forma de cobro" son disjuntos, así que ningún cobro se cuenta dos veces.
  const banco = formulaCobrosPosteriores('$F$19')
  const caja = formulaCobrosEfectivoPosteriores('$F$4')
  assert.match(banco, /"<>Efectivo"/) // el banco deja el efectivo afuera
  assert.match(caja, /"Efectivo"/) // la caja física lo toma
  assert.doesNotMatch(caja, /"<>Echeq"|Transferencia|Débito/) // y no toma nada del canal bancario
})

test('DEP apunta a la réplica del extracto con las columnas verificadas', () => {
  assert.deepEqual(
    { hoja: DEP.hoja, fecha: DEP.fecha, concepto: DEP.concepto, importe: DEP.importe, flujo: DEP.flujo },
    { hoja: '_BANCO_RAW', fecha: 'A', concepto: 'B', importe: 'C', flujo: 'E' },
  )
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
  // 2 SUMIFS (cobros, cheques debitados) + 1 SUMPRODUCT (compras transferencia/débito, tolerante a texto).
  assert.equal(f.split('SUMIFS').length - 1, 2)
  assert.equal(f.split('SUMPRODUCT').length - 1, 1)
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
