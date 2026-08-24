import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  formulaCobrosPosteriores, formulaChequesDebitadosPosteriores, formulaComprasPagadasPosteriores,
  formulaNetaPosterior, formulaUltimoSaldo, formulaFechaCorte, COB, CHQ, CMP,
  formulaCobrosEfectivoPosteriores, formulaComprasEfectivoPosteriores,
  formulaDepositosEfectivoPosteriores, formulaNetaEfectivoPosterior, DEP, formulaFrescuraCaja,
  formulaJornalesEfectivoPosteriores, formulaJornalesBancoPosteriores, celdaJornalesEfectivo, JOR,
  formulaOficinaEfectivoPosteriores, formulaExtraccionesEfectivoPosteriores, OFI,
  formulaFechaUltimoEfectivo, celdaFechaDelEfectivo } from './caja-posterior-al-corte.mjs'
import { COL_FECHA_CAJA, colIndex } from './rubro-caja.mjs'
import { anclaDeSalida } from './caja-ancla-por-instante.mjs'

test('las compras pagadas posteriores restan sólo Transferencia y Débito, después del corte', () => {
  const f = formulaComprasPagadasPosteriores('$F$19')
  // SUMPRODUCT, no SUMIFS: la "Fecha de caja" viene en formato mixto serie/texto y SUMIFS perdía las de texto.
  assert.match(f, /^SUMPRODUCT\(/)
  assert.doesNotMatch(f, /SUMIFS/)
  assert.match(f, /'Compras'!\$X\$4:\$X="Pagado"/) // estado
  assert.match(f, /"Transferencia"/)
  assert.match(f, /"Débito"/)
  // ventana posterior al corte, con la fecha COACCIONADA (DATEVALUE del texto, N() del serial)
  assert.match(f, /IFERROR\(DATEVALUE\('Compras'!\$AD\$4:\$AD&""\);N\('Compras'!\$AD\$4:\$AD\)\)>\$F\$19/)
  // el total se coacciona con N(): SUMPRODUCT no tolera texto en la columna que suma
  assert.match(f, /N\('Compras'!\$O\$4:\$O\)/)
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

// ═══ ANTI-DOBLE-CONTEO: LA VENTANA ES ESTRICTAMENTE POSTERIOR AL CORTE, EN LOS TRES LADOS ═══
//
// El riesgo que hay que descartar: un movimiento cuya plata YA figura en el extracto (fecha ≤ corte)
// no debe volver a sumarse/restarse en la línea "posterior". La garantía es de CONSTRUCCIÓN: corte =
// MAX(fecha del extracto), y las tres patas filtran con ">" ESTRICTO contra ese mismo corte. Un
// movimiento con fecha ≤ corte cae DENTRO del extracto (ya está en el saldo) y queda FUERA de ">";
// uno con fecha > corte es, por definición, algo que el extracto todavía no cubre. No hay solape.
// Cuando se carga un extracto más nuevo, corte avanza y lo que estaba en la ventana COLAPSA dentro
// del saldo automáticamente — la misma exclusividad que la caja física tiene contra el arqueo.
test('las tres patas de la línea posterior filtran con ">" estricto contra el MISMO corte (sin solape con el extracto)', () => {
  const corte = '$F$19'
  const cobros = formulaCobrosPosteriores(corte)
  const cheques = formulaChequesDebitadosPosteriores(corte)
  const compras = formulaComprasPagadasPosteriores(corte)
  // Cobros y cheques: ">"&corte (SUMIFS). Compras: fechaCoercionada>corte (SUMPRODUCT).
  assert.match(cobros, /">"&\$F\$19/)
  assert.match(cheques, /">"&\$F\$19/)
  assert.match(compras, />\$F\$19/)
  // Ninguna usa ">=" : con el igual, un movimiento del propio día del corte (que el extracto ya trae)
  // se contaría DOS veces.
  for (const f of [cobros, cheques, compras]) assert.doesNotMatch(f, />=/)
  // El corte es el mismo literal en las tres: si una mirara otra celda, la ventana se desalinearía.
  for (const f of [cobros, cheques, compras]) assert.ok(f.includes('$F$19'))
})

test('sólo suma lo COBRADO: un proyectado no es plata que esté', () => {
  const f = formulaCobrosPosteriores('$F$19')
  assert.match(f, /"Cobrado"/)
})

test('excluye los echeq, que ya están contados en la cartera', () => {
  assert.match(formulaCobrosPosteriores('$F$19'), /"<>Echeq"/)
})

test('y excluye también el CHEQUE FÍSICO: un valor en la mano tampoco está en el banco', () => {
  // EL DEFECTO (06/08, latente): el e-cheque se excluía y el cheque en papel no, aunque los dos son
  // lo mismo para la caja — un valor que vive en "Valores a depositar" hasta que se acredita.
  // Un cobro con forma "Cheque" se sumaba al saldo BANCARIO estando todavía en la cartera: el mismo
  // peso en los dos lados. Hoy vale $0 (ninguna de las 89 cobranzas del archivo dice "Cheque"), y por
  // eso se arregla ahora: la primera que entre no iba a avisar de nada.
  assert.match(formulaCobrosPosteriores('$F$19'), /"<>Cheque"/)
})

// ═══ LA PARTICIÓN POR CANAL: EL EFECTIVO NO ESTÁ EN EL BANCO, ESTÁ EN LA CAJA FÍSICA (T06) ═══

test('el banco NO cuenta el efectivo: va a la caja física, no duplicar', () => {
  // Si el banco contara el efectivo y la caja física también, el mismo peso quedaría dos veces en el
  // total. La partición por canal (echeq/efectivo/banco) lo impide por construcción.
  const f = formulaCobrosPosteriores('$F$19')
  assert.match(f, /"<>Efectivo"/)
  assert.match(f, /"<>Echeq"/)
})

test('la línea del banco: 2 SUMIFS (cobros, cheques) + 2 SUMPRODUCT (compras y nómina por banco)', () => {
  // Excluir el efectivo es un criterio MÁS dentro del mismo SUMIFS de cobros, no un SUMIFS nuevo.
  // Compras pasó a un SOLO SUMPRODUCT (transferencia+débito juntos), no dos SUMIFS.
  // El segundo SUMPRODUCT es la NÓMINA pagada por transferencia (01/08): antes no estaba en ningún
  // lado y el lote de haberes salía del banco sin bajar la disponibilidad.
  const f = formulaNetaPosterior('$F$19')
  assert.equal(f.split('SUMIFS').length - 1, 2)
  assert.equal(f.split('SUMPRODUCT').length - 1, 3)
  assert.match(f, /JORNALES_REAL_BANCO/)
  assert.match(f, /OFICINA_BANCO/, 'los sueldos de administración por transferencia también salen del banco')
})

test('cobros en efectivo posteriores: SÓLO Efectivo, SÓLO Cobrado, DESPUÉS del arqueo', () => {
  const f = formulaCobrosEfectivoPosteriores('$F$4')
  assert.match(f, /'Cobranzas'!\$O\$5:\$O;"Cobrado"/) // estado
  assert.match(f, /'Cobranzas'!\$N\$5:\$N;"Efectivo"/) // forma de cobro
  assert.match(f, /'Cobranzas'!\$Q\$5:\$Q;">"&\$F\$4/) // ventana posterior al arqueo
  // La ventana es EXCLUSIVA: con ">=" un cobro del día del arqueo se contaría de nuevo (ya está en él).
  assert.doesNotMatch(f, />=/)
})

test('pagos en efectivo posteriores: el MONTO PAGADO (parcial o total), con la ventana por estado', () => {
  // El defecto del 07/08: $2M en efectivo sobre una factura de $3,3M —fila Pendiente con Monto
  // Pagado— y la caja física no bajaba, porque la fórmula exigía "Pagado" y sumaba el TOTAL.
  const f = formulaComprasEfectivoPosteriores('$F$4')
  assert.match(f, /^SUMPRODUCT\(/)
  assert.doesNotMatch(f, /SUMIFS/)
  assert.match(f, /'Compras'!\$P\$4:\$P="Efectivo"/) // tipo de pago
  // La plata es el MONTO PAGADO (T), no el total (O): una compra saldada en dos veces se contaba doble
  assert.match(f, /N\('Compras'!\$T\$4:\$T\)/)
  assert.doesNotMatch(f, /N\('Compras'!\$O\$4:\$O\)/)
  // CAMBIO DE CONTRATO (15/08): LAS DOS RAMAS USAN EL MISMO CRITERIO. La rama "Pagado" comparaba
  // estrictamente ("lo del día del arqueo ya está contado") y la rama "Pendiente" desde el día
  // inclusive. Dos filas equivalentes daban números distintos según el estado, y por el lado que
  // importa —el pago completo— la plata salía del cajón y el cajón no bajaba nunca: al conteo
  // siguiente ese pago ya era anterior a él. Ver CRITERIO_MISMO_DIA en caja-ancla-por-instante.mjs.
  const coerc = (col) => `IFERROR\\(DATEVALUE\\('Compras'!\\$${col}\\$4:\\$${col}&""\\);N\\('Compras'!\\$${col}\\$4:\\$${col}\\)\\)`
  const ventana = (col) => `\\(${coerc(col)}>=INT\\(\\$F\\$4\\)\\)\\*\\(${coerc(col)}>0\\)`
  assert.match(f, new RegExp(`\\('Compras'!\\$X\\$4:\\$X="Pagado"\\)\\*${ventana(CMP.fecha)}`))
  assert.match(f, new RegExp(`\\('Compras'!\\$X\\$4:\\$X="Pendiente"\\)\\*${ventana('C')}`))
  assert.ok(!f.includes(','), 'locale es-AR: sin comas como separador')
})

test('el pago en efectivo usa el MISMO medio que el banco deja afuera (partición del lado de los pagos)', () => {
  // El banco cuenta Transferencia/Débito; la caja física cuenta Efectivo. Sin intersección.
  assert.ok(!CMP.tiposBanco.includes('Efectivo'))
  assert.match(formulaComprasEfectivoPosteriores('$F$4'), /"Efectivo"/)
})

test('los depósitos de efectivo se detectan como en la alerta 4.6 y sólo los posteriores al arqueo', () => {
  const f = formulaDepositosEfectivoPosteriores('$F$4')
  assert.match(f, /_BANCO_RAW!\$E\$4:\$E="entra"/) // es un crédito
  // El extracto real trae DOS redacciones: "Deposito de efectivo - Tarj nro." y "Deposito efvo caja
  // suc 0770". Buscar la frase literal dejaba ciega la segunda ($4.000.000 el 15/06) y un depósito
  // no reconocido no descarga la caja física — el cajón queda inflado sin que nada falle.
  assert.match(f, /SEARCH\("deposito"/)
  assert.match(f, /SEARCH\("efectivo"/)
  assert.match(f, /SEARCH\("efvo"/) // el concepto del banco
  // CAMBIO DE CONTRATO (15/08): la ventana pasó de EXCLUSIVA a INCLUSIVA en el día del conteo. Un
  // depósito SACA billetes del cajón — es una SALIDA — y con `>` el depósito hecho el mismo día del
  // conteo, después de contar, no bajaba la caja NUNCA (al conteo siguiente ya era anterior a él).
  // Ver CRITERIO_MISMO_DIA en caja-ancla-por-instante.mjs. El `>0` que lo acompaña impide que una
  // fecha vacía —que N() lleva a 0— entre a la ventana cuando el ancla es 0 (histórico completo).
  assert.match(f, /_BANCO_RAW!\$A\$4:\$A>=INT\(\$F\$4\)/)
  assert.match(f, /_BANCO_RAW!\$A\$4:\$A>0/)
  // ISNUMBER sobre la fecha: una fecha guardada como texto metería un depósito viejo en la ventana.
  assert.match(f, /ISNUMBER\(_BANCO_RAW!\$A\$4:\$A\)/)
})

test('la línea neta de la caja física: cobros − pagos − depósitos, guardada por el arqueo', () => {
  const f = formulaNetaEfectivoPosterior('$F$4')
  assert.ok(f.startsWith('='))
  // Sin arqueo con fecha no hay ventana: da 0 en vez de inventar plata en el cajón.
  assert.match(f, /^=IF\(NOT\(ISNUMBER\(\$F\$4\)\);0;/)
  // 1 SUMIFS (cobros) + 5 SUMPRODUCT (pagos, depósitos, nómina de obra, oficina, extracciones).
  assert.equal(f.split('SUMIFS').length - 1, 1)
  assert.equal(f.split('SUMPRODUCT').length - 1, 5)
  assert.match(f, /JORNALES_REAL_ADELANTO/)
  assert.match(f, /OFICINA_PAGADO/)
  assert.match(f, /extraccion/, 'la extracción del banco CARGA el cajón: es el espejo del depósito')
  // Cobros suman, pagos y depósitos restan.
  assert.match(f, /;"Cobrado";.*"Efectivo".*\)-SUMPRODUCT/) // cobros, luego resta el pago
  assert.match(f, /\)-SUMPRODUCT/) // resta el depósito
})

test('sin réplica del extracto, la caja física no resta depósitos (no restar un cero disfrazado)', () => {
  const f = formulaNetaEfectivoPosterior('$F$4', { bancoRaw: null })
  // Siguen pago en efectivo, nómina de obra y oficina (3 SUMPRODUCT) pero YA NO el depósito NI la
  // extracción: los dos salen de la réplica y se omiten juntos. Dejar uno solo inflaría o vaciaría el
  // cajón. La nómina no depende de la réplica, así que no se cae con ella.
  assert.equal(f.split('SUMPRODUCT').length - 1, 3)
  assert.doesNotMatch(f, /deposito de efectivo/)
  assert.doesNotMatch(f, /extraccion/)
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
  // El ancla aparece en la guarda ISNUMBER y en los términos (cobros, pagos ×2 —la rama Pagado y la
  // rama del parcial Pendiente—, depósitos, nómina en efectivo): al registrar un arqueo nuevo, la
  // ventana de todos se corre junta y lo viejo colapsa. Si un canal quedara anclado a otra celda,
  // este número lo delata.
  assert.equal((nuevo.match(/\$F\$99/g) || []).length, 8)
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
  // 2 SUMIFS (cobros, cheques) + 3 SUMPRODUCT (compras, nómina de obra y oficina, todo por banco).
  assert.equal(f.split('SUMIFS').length - 1, 2)
  assert.equal(f.split('SUMPRODUCT').length - 1, 3)
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

// ═══ LAS TRES PUERTAS QUE EL DUEÑO NOMBRÓ (03/08) ═══
//
// *"siempre q modifiques valores de caja con el extracto q te envio o se haga modificaciones por
// compras pagas en efectivo o transferencias o cobranzas, las fechas que aparecen se deben actualizar
// de manera automatica"*. Son tres puertas y las tres tienen que mover el rótulo de CAJA.

test('la frescura de CAJA mira LAS TRES PUERTAS: extracto, compras pagadas y cobranzas', () => {
  const f = formulaFrescuraCaja()
  assert.match(f, /_BANCO_RAW'!\$A\$4:\$A/, 'puerta 1: el extracto del banco')
  assert.match(f, new RegExp(`Compras'!\\$${COL_FECHA_CAJA}\\$${CMP.desde}:\\$${COL_FECHA_CAJA}`), 'puerta 2: la fecha de caja de Compras')
  assert.match(f, new RegExp(`Cobranzas'!\\$${COB.fecha}\\$${COB.desde}:\\$${COB.fecha}`), 'puerta 3: la fecha de cobro')
  assert.match(f, /^MAX\(/, 'gana la más nueva: cualquiera de las tres que se mueva mueve el rótulo')
})

test('sólo cuenta lo que YA OCURRIÓ: una previsión no da frescura', () => {
  const f = formulaFrescuraCaja()
  // Compras trae fecha prevista de pago y Cobranzas fecha esperada de cobro. Sin el filtro de estado
  // y sin `<=TODAY()`, el rótulo declararía un corte futuro sobre plata que no se movió.
  assert.match(f, new RegExp(`Compras'!\\$${CMP.estado}\\$${CMP.desde}:\\$${CMP.estado}="Pagado"`))
  assert.match(f, new RegExp(`Cobranzas'!\\$${COB.estado}\\$${COB.desde}:\\$${COB.estado}="Cobrado"`))
  assert.equal(f.match(/<=TODAY\(\)/g)?.length, 3, 'las tres puertas tienen que filtrar el futuro')
})

test('la fecha de caja de Compras se coacciona: viene mezclada serie/texto', () => {
  // El mismo defecto que ya infló la caja: un MAX crudo se queda con la última fecha que por
  // casualidad entró como número y pierde las tipeadas, EN SILENCIO.
  assert.match(formulaFrescuraCaja(), /IFERROR\(DATEVALUE\('Compras'!\$AD\$4:\$AD&""\);N\('Compras'!\$AD\$4:\$AD\)\)/)
})

test('sin la réplica del extracto la puerta 1 se omite, no queda una referencia rota', () => {
  const f = formulaFrescuraCaja({ bancoRaw: null })
  assert.doesNotMatch(f, /_BANCO_RAW/, 'referenciar una hoja que no está manda el subtítulo a #REF!')
  assert.match(f, /Compras/)
  assert.match(f, /Cobranzas/)
})

test('los rangos de la frescura son ABIERTOS: un tope de filas caduca en silencio', () => {
  assert.doesNotMatch(formulaFrescuraCaja(), /:\$[A-Z]{1,2}\$\d+/, 'hay un rango cerrado en la frescura')
})

test('separador es-AR en la frescura de CAJA: ni una coma', () => {
  assert.doesNotMatch(formulaFrescuraCaja(), /,/)
})

// ═══ LA NÓMINA: EL TERCER CANAL (01/08) ═══
//
// El dueño describió el 31/07: jornales pagados 50% en efectivo y 50% por transferencia. Ni una mitad
// ni la otra bajaba ninguna disponibilidad — la nómina no era una compra ni un cheque, así que no
// entraba en ninguna de las dos líneas que ya existían. Estos tests fijan que ahora sale por los dos
// canales que corresponden, y por el canal correcto en cada uno.

test('nómina en efectivo: adelantos + contra recibo, sólo de quincenas con pago REGISTRADO y posterior al arqueo', () => {
  const f = formulaJornalesEfectivoPosteriores('$F$7')
  assert.match(f, /N\(JORNALES_REAL_ADELANTO\)\+N\(JORNALES_REAL_RECIBO\)/)
  // El HECHO, no la previsión: "Pagado el", nunca "Se paga el".
  // CAMBIO DE CONTRATO (15/08): inclusiva en el día del conteo, como toda SALIDA. Un jornal pagado en
  // billetes el mismo día del conteo, después de contar, no bajaba el cajón nunca.
  assert.match(f, /JORNALES_REAL_PAGADO>=INT\(\$F\$7\)/)
  assert.doesNotMatch(f, /JORNALES_REAL_PAGO>/)
  // ISNUMBER descarta las quincenas sin pagar: una celda vacía compararía como texto y entrarían todas.
  assert.match(f, /ISNUMBER\(JORNALES_REAL_PAGADO\)/)
})

test('la ventana del CORTE DEL EXTRACTO sigue siendo exclusiva: no es el mismo ancla', () => {
  // No es una inconsistencia con el test de arriba: el extracto cubre el día ENTERO, así que lo del
  // propio día ya está adentro del saldo declarado. Un conteo, en cambio, pasa a una hora del día y no
  // cubre el resto. Confundir los dos anclas fue lo que dejó el pago del día del arqueo sin descontar.
  const f = formulaJornalesBancoPosteriores('$F$19')
  assert.match(f, /JORNALES_REAL_PAGADO>\$F\$19/)
  assert.doesNotMatch(f, />=/)
})

test('nómina por banco: SÓLO la columna Banco — el efectivo no puede salir dos veces', () => {
  const f = formulaJornalesBancoPosteriores('$F$9')
  assert.match(f, /N\(JORNALES_REAL_BANCO\)/)
  assert.doesNotMatch(f, /ADELANTO|RECIBO/)
  assert.match(f, /JORNALES_REAL_PAGADO>\$F\$9/)
})

test('la partición de la nómina es disjunta: banco y efectivo no comparten ninguna columna', () => {
  // Es la misma garantía anti-doble-conteo que ya tenían los cobros por forma de pago, aplicada a la
  // nómina: Banco (H) va al saldo bancario, Adelanto (I) y Total recibo (J) a la caja física. La
  // pestaña de Jornales ya controla que las tres sumen el TOTAL de la quincena.
  const banco = formulaJornalesBancoPosteriores('$F$9')
  const efectivo = formulaJornalesEfectivoPosteriores('$F$7')
  assert.ok(!banco.includes(JOR.adelanto) && !banco.includes(JOR.recibo))
  assert.ok(!efectivo.includes(JOR.banco))
})

test('la nómina se cita por rango con nombre, nunca por número de fila', () => {
  // El motivo por el que existen esos nombres: la pestaña de Jornales ya se reordenó una vez y tres
  // fórmulas siguieron sumando las filas equivocadas sin una sola celda en rojo.
  const f = formulaJornalesEfectivoPosteriores('$F$7') + formulaJornalesBancoPosteriores('$F$9')
  assert.doesNotMatch(f, /'Jornales/)
  assert.doesNotMatch(f, /\$[A-Z]\$\d+:\$[A-Z]\$\d+/)
})

test('el renglón del desglose de la nómina lleva el signo puesto y es la MISMA fórmula del neto', () => {
  // Si el desglose se escribiera aparte, podría decir otra cosa que el total. Se importa, no se copia.
  assert.equal(celdaJornalesEfectivo('$F$7'), `=IF(NOT(ISNUMBER($F$7));0;-(${formulaJornalesEfectivoPosteriores('$F$7')}))`)
})

test('las fórmulas de la nómina van en es-AR: separador ; y nunca ,', () => {
  assert.ok(!formulaJornalesEfectivoPosteriores('$F$7').includes(','))
  assert.ok(!formulaJornalesBancoPosteriores('$F$9').includes(','))
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// LA FECHA DEL ÚLTIMO MOVIMIENTO DE EFECTIVO (24/08/2026)
//
// El dueño: *"la fila 7 q marca el efectivo disponible me confunde con la fecha del saldo porque se
// realizaron cobranzas en efectivo y pagos pero no me indica la fecha del ultimo movimiento de
// efectivo"*. `CAJA!C7` = conteo + SEIS fuentes de movimientos posteriores; `CAJA!D7` publicaba el día
// del conteo. El saldo llegaba a hoy y su fecha se quedaba en el 19/08.
//
// EL DEFECTO QUE ESTOS TESTS ATRAPAN no es "falta una fórmula": es que la fecha mire OTRA VENTANA que
// la suma. Una fecha que la suma ve y el MAX no reproduce exactamente lo que el dueño reportó, ahora
// escondido detrás de una fecha que parece calculada.
// ══════════════════════════════════════════════════════════════════════════════════════════════════

const ANCLA = '$F$34'
const ULTIMA = formulaFechaUltimoEfectivo(ANCLA)

test('la fecha del último efectivo mira LAS SEIS FUENTES que mueven el saldo, ninguna menos', () => {
  // Si mañana alguien agrega un séptimo canal al neto y no lo agrega acá, el saldo se movería con una
  // fecha que no lo acompaña — el defecto original, de nuevo.
  assert.match(ULTIMA, /'Cobranzas'!\$O\$5:\$O="Cobrado"/, '1/6 cobros en efectivo')
  assert.match(ULTIMA, /'Cobranzas'!\$N\$5:\$N="Efectivo"/)
  assert.match(ULTIMA, /'Cobranzas'!\$AA\$5:\$AA<>"USD"/, 'un cobro en dólares no es un billete de este cajón')
  assert.match(ULTIMA, /'Compras'!\$P\$4:\$P="Efectivo"/, '2/6 pagos en efectivo')
  assert.match(ULTIMA, /'Compras'!\$X\$4:\$X="Pagado"/, 'la rama Pagado')
  assert.match(ULTIMA, /'Compras'!\$X\$4:\$X="Pendiente"/, 'y la rama del parcial, que también es billete que salió')
  assert.ok(ULTIMA.includes(JOR.pagado) && ULTIMA.includes(JOR.adelanto) && ULTIMA.includes(JOR.recibo), '3/6 jornales')
  assert.ok(ULTIMA.includes(OFI.pago) && ULTIMA.includes(OFI.banco) && ULTIMA.includes(OFI.pagado), '4/6 oficina')
  assert.match(ULTIMA, /SEARCH\("extraccion"/, '5/6 extracciones del banco')
  assert.match(ULTIMA, /SEARCH\("retiro de efectivo"/)
  assert.match(ULTIMA, /SEARCH\("deposito"/, '6/6 depósitos al banco')
  assert.match(ULTIMA, /SEARCH\("efvo"/, 'con las dos redacciones del Santander, igual que el importe')
  assert.equal(ULTIMA.match(/SUMPRODUCT\(MAX\(/g)?.length, 6, 'seis fuentes, seis MAX: ni uno de más ni uno de menos')
})

test('EL DEFECTO: cada fuente usa EXACTAMENTE la misma ventana con la que su importe entra al saldo', () => {
  // Es LA prueba. Una fecha que mira una ventana distinta de la que suma vuelve a publicar un saldo
  // nuevo con fecha vieja (si el MAX ve de menos) o frescura por plata no contada (si ve de más).
  const salida = anclaDeSalida(ANCLA)
  // Las SALIDAS miran el ancla corrida un día; las ENTRADAS, el ancla pelada. Es la asimetría declarada
  // en caja-ancla-por-instante.mjs y la que usa `historicoEfectivo` para los seis renglones del neto.
  for (const [que, importe] of [
    ['compras', formulaComprasEfectivoPosteriores(salida)],
    ['jornales', formulaJornalesEfectivoPosteriores(salida)],
    ['oficina', formulaOficinaEfectivoPosteriores(salida)],
    ['depósitos', formulaDepositosEfectivoPosteriores(salida)],
  ]) {
    assert.ok(importe.includes(`>=INT(${salida})`), `${que}: el importe entra desde el ancla de salida`)
    assert.ok(ULTIMA.includes(`>=INT(${salida})`), `${que}: y la fecha tiene que mirar ESA ventana, no otra`)
  }
  // Las dos entradas: cobros compara contra el ancla PELADA (así lo hace su SUMIFS) y la extracción
  // contra INT del ancla (así lo hace su SUMPRODUCT). Las dos, exclusivas.
  assert.ok(formulaCobrosEfectivoPosteriores(ANCLA).includes(`">"&${ANCLA}`))
  assert.ok(ULTIMA.includes(`>${ANCLA})`), 'cobros: el mismo borde que su SUMIFS, sin INT')
  assert.ok(formulaExtraccionesEfectivoPosteriores(ANCLA).includes(`>INT(${ANCLA})`))
  assert.ok(ULTIMA.includes(`>INT(${ANCLA})`), 'extracciones: el mismo borde que su SUMPRODUCT')
  // Y NINGUNA fuente puede mirar el ancla con un criterio que su importe no tenga.
  assert.doesNotMatch(ULTIMA, /<=INT/)
})

test('la fecha de Compras se coacciona igual que su importe: la tipeada no puede quedar invisible', () => {
  // La "Fecha de caja" convive como serial y como texto "dd/mm/aaaa". Un MAX crudo se queda con la
  // última que entró como número y pierde las tipeadas EN SILENCIO: el saldo baja por un pago y la
  // fecha no se entera. Es el mismo remedio que ya usa el importe, no uno nuevo.
  const coerc = `IFERROR(DATEVALUE('Compras'!$AD$4:$AD&"");N('Compras'!$AD$4:$AD))`
  assert.ok(formulaComprasEfectivoPosteriores(ANCLA).includes(coerc))
  assert.ok(ULTIMA.includes(coerc), 'la fecha de caja, con DATEVALUE como en el importe')
  assert.ok(ULTIMA.includes(`IFERROR(DATEVALUE('Compras'!$C$4:$C&"");N('Compras'!$C$4:$C))`),
    'y la fecha de carga, que es la que usa la rama del pago parcial')
})

test('una fila SIN PLATA no puede fechar el saldo — el factor que el importe no necesita escribir', () => {
  // `Compras` tiene cientos de filas "Pendiente" con tipo de pago Efectivo y sin monto pagado: su fecha
  // de carga es la de ayer y aportan $0. La fórmula de importe las anula sola porque MULTIPLICA por el
  // monto; el MAX multiplica por la FECHA, así que sin este factor D7 diría "el último movimiento fue
  // ayer" cada vez que alguien carga una factura que todavía no pagó.
  assert.match(ULTIMA, /\(N\('Compras'!\$T\$4:\$T\)<>0\)/, 'compras: sólo las filas con monto pagado')
  assert.match(ULTIMA, /\(N\('Cobranzas'!\$M\$5:\$M\)<>0\)/, 'cobranzas: sólo las que trajeron plata')
  assert.match(ULTIMA, /\(\(N\(JORNALES_REAL_ADELANTO\)\+N\(JORNALES_REAL_RECIBO\)\)<>0\)/,
    'jornales: una quincena pagada 100% por banco no mueve el cajón y no puede fecharlo')
  assert.match(ULTIMA, /\(\(N\(OFICINA_PAGADO\)-N\(OFICINA_BANCO\)\)<>0\)/,
    'oficina: un mes pagado entero por transferencia tampoco')
})

test('SIN MOVIMIENTOS QUEDA EL DÍA DEL CONTEO, y sin ancla no se inventa ninguna fecha', () => {
  // Cada término vale 0 cuando no matchea nada, y un 0 formateado como fecha se dibuja 30/12/1899 —
  // el defecto que la guarda de CAJA!D7 ya evitaba y que no se puede reintroducir por atrás.
  assert.ok(ULTIMA.startsWith(`=IF(NOT(ISNUMBER(${ANCLA}));"";MAX(INT(${ANCLA});`),
    'el piso del MAX es el día del conteo, y sin ancla la celda queda vacía, no en 1899')
  // El anexo pasa el DÍA que CAJA muestra como piso, no INT del instante: el instante puede caer del
  // otro lado de la medianoche y publicaría un día que el conteo no tuvo (ver diaDelConteo).
  const conNombre = formulaFechaUltimoEfectivo(ANCLA, { conteo: 'ANEXO_CONTEO_ARS_DIA' })
  assert.match(conNombre, /MAX\(ANEXO_CONTEO_ARS_DIA;/)
  assert.ok(!conNombre.includes(`MAX(INT(${ANCLA});`))
})

test('la celda que fecha el efectivo es UNA sola definición, y nunca cae en 0', () => {
  // CAJA!D7 y el control "Efectivo en el cajón HOY" del anexo muestran el MISMO número: si cada una
  // armara su fecha, el archivo tendría dos fechas para la misma plata.
  assert.equal(celdaFechaDelEfectivo('ANEXO_CONTEO_ARS_DIA', 'ANEXO_EFECTIVO_ULTIMO_DIA'),
    '=IF(ISNUMBER(ANEXO_CONTEO_ARS_DIA);IF(ISNUMBER(ANEXO_EFECTIVO_ULTIMO_DIA);ANEXO_EFECTIVO_ULTIMO_DIA;ANEXO_CONTEO_ARS_DIA);"")')
  // Sin fuente de movimientos —la caja en dólares— la celda queda EXACTAMENTE como estaba.
  assert.equal(celdaFechaDelEfectivo('ANEXO_CONTEO_USD_DIA'),
    '=IF(ISNUMBER(ANEXO_CONTEO_USD_DIA);ANEXO_CONTEO_USD_DIA;"")')
})

test('la fórmula de la fecha va en es-AR y usa el idioma de la casa para el array', () => {
  // Separador `;`: con `,` la API escribe una fórmula que el archivo no puede parsear.
  assert.ok(!ULTIMA.includes(','), 'ni una coma: el locale del archivo es es-AR')
  // SUMPRODUCT(MAX(...)) y no ARRAYFORMULA: en una celda de fecha un ARRAYFORMULA derramaría sobre la
  // de al lado. Es el mismo idioma de formulaUltimoSaldo y formulaUltimaFecha.
  assert.doesNotMatch(ULTIMA, /ARRAYFORMULA/)
  // Rangos ABIERTOS: una fila final tipeada deja de ver lo nuevo y NO da error.
  assert.doesNotMatch(ULTIMA, /\$[A-Z]{1,2}\$\d+:\$[A-Z]{1,2}\$\d+/)
  // `TODAY()` acá NO es el reloj de la corrida: es el del archivo, vivo, y acota el futuro. Un pago
  // PROGRAMADO (OFICINA agosto con pago 01/09, medido en vivo el 24/08) entra al saldo por el
  // criterio conservador del piso, pero no es un movimiento ocurrido: sin el filtro, D7 publicaba
  // una fecha futura. Siete puertas: una por fuente, y Compras lleva dos (sus dos ramas).
  assert.equal(ULTIMA.match(/<=TODAY\(\)/g)?.length, 7,
    'cada fuente filtra el futuro: un pago programado no fecha el último movimiento')
})
