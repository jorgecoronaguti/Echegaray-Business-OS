import test from 'node:test'
import assert from 'node:assert/strict'
import {
  RUBRO_PRENDARIO, formulaCuotaPrendario, formulaPrendarioPendiente, formulaPlanesPendiente,
  formulaAlicuotaIibbVigente, formulaBaseIibbProyectada, formulaIibbDeterminado,
  formulaImpuestoChequeProyectado, formulaImpuestoCheque,
  formulaVentana, formulaDeudaPendiente,
  formulaMesQueElIvaPideCaja, formulaIvaQuePideCaja, formulaColchonQueSeAgota, IVA_SIN_SALIDA,
  proximoVencimiento, rangoIibb, formulaSaldoAFavor, formulaSaldoDeclarado,
} from './impuestos-cuadro.mjs'
import { serialDe } from './vencimientos-fiscales.mjs'

// Las columnas reales de Compras, leídas del encabezado el 06/08/2026.
const C = { total: 'O', concepto: 'L', fecha: 'AD', rubro: 'AB', fechaPrev: 'Q', detalle: 'K' }
const HOY = '2026-08-06'

// ══ PRENDARIO — EL DEFECTO A ══════════════════════════════════════════════════════════════════════

test('la cuota del prendario sale del cuadro de amortización de Compras, mes por mes', () => {
  const f = formulaCuotaPrendario(C, 2026, 9)
  assert.equal(f, '=SUMIFS(Compras!$O$4:$O;Compras!$AB$4:$AB;"Financiero";'
    + 'Compras!$Q$4:$Q;">="&DATE(2026;9;1);Compras!$Q$4:$Q;"<="&EOMONTH(DATE(2026;9;1);0))')
  // Cada mes tiene SU ventana: dos meses distintos no pueden dar la misma fórmula.
  assert.notEqual(formulaCuotaPrendario(C, 2026, 9), formulaCuotaPrendario(C, 2026, 10))
})

test('PROHIBIDO: la cuota del prendario NO puede salir del extracto — el SUMIF global está muerto', () => {
  // EL DEFECTO QUE ESTE TEST ATRAPA. La fórmula anterior era
  //   =ABS(SUMIF('_BANCO_RAW'!$F$4:$F;"Préstamo prendario";'_BANCO_RAW'!$C$4:$C))
  // repetida idéntica en los cinco meses. Barre TODO el extracto, así que su resultado depende de
  // cuántos meses de banco se hayan importado: con dos débitos adentro declaraba $2.567.315,91 de
  // cuota donde la cuota es $1.282.810,54. Cinco meses de eso son $6,4M de salida financiera falsa.
  for (const m of [8, 9, 10, 11, 12]) {
    const f = formulaCuotaPrendario(C, 2026, m)
    assert.ok(!/_BANCO_RAW/.test(f), `mes ${m}: la cuota no puede leer el extracto`)
    assert.ok(!/SUMIF\(/.test(f), `mes ${m}: SUMIF sin condición de fecha barre el archivo entero`)
    assert.ok(!/Préstamo prendario/.test(f), `mes ${m}: la naturaleza bancaria no identifica una cuota`)
    assert.ok(f.includes(`DATE(2026;${m};1)`), `mes ${m}: falta la ventana del mes`)
  }
})

test('la deuda pendiente del prendario es SÓLO lo futuro — el defecto B', () => {
  // Las doce cuotas cargadas suman $15.359.163 y siete YA se pagaron. "Pendiente" son las cinco que
  // faltan: $6.414.055. La versión anterior sumaba el rubro entero sin condición de fecha.
  const f = formulaPrendarioPendiente(C)
  assert.equal(f, '=SUMIFS(Compras!$O$4:$O;Compras!$AB$4:$AB;"Financiero";Compras!$Q$4:$Q;">"&TODAY())')
  assert.ok(/">"&/.test(f), 'sin condición de fecha, "pendiente" es el total histórico')
})

test('EL CORTE DE "PENDIENTE" LO EVALÚA LA PLANILLA: ni un serial tipeado', () => {
  // El defecto: `">"&46240` —el serial del día de la corrida— en las dos celdas que el hero publica
  // como DEUDA PENDIENTE. Con eso, una pestaña que no se regenera un día empieza a contar como
  // pendientes cuotas que ya se debitaron, y ese es el número con el que se decide cubrir un bache.
  const planes = [{ patron: 'W303094', campo: 'concepto' }]
  for (const f of [formulaPrendarioPendiente(C), formulaPlanesPendiente(C, planes)]) {
    assert.match(f, /">"&TODAY\(\)/, 'el corte tiene que ser vivo')
    assert.ok(!/">"&\d+/.test(f), `hay un serial tipeado: ${f}`)
    // Y el serial del día de hoy no puede aparecer por ninguna otra vía.
    assert.ok(!f.includes(String(serialDe(HOY))), 'el serial del día de la corrida no va en la fórmula')
  }
})

test('la deuda pendiente de los planes también es sólo lo futuro, y por plan', () => {
  const planes = [
    { patron: 'W303094', campo: 'concepto' },
    { patron: '931 Dic 25', campo: 'detalle' },
    { patron: '931 Enero 26', campo: 'detalle' },
  ]
  const f = formulaPlanesPendiente(C, planes)
  assert.ok(f.includes('Compras!$L$4:$L;"*W303094*"'), 'W303094 se identifica por Concepto')
  assert.ok(f.includes('Compras!$K$4:$K;"*931 Dic 25*"'), 'los de deuda previsional, por Detalles / Obra')
  assert.equal((f.match(/SUMIFS/g) ?? []).length, 3, 'un término por plan')
  assert.equal((f.match(/">"&TODAY\(\)/g) ?? []).length, 3, 'los tres, sólo hacia adelante')
  // Sin planes reconocidos no se inventa un importe: da 0 explícito.
  assert.equal(formulaPlanesPendiente(C, []), '=0')
  assert.equal(formulaPlanesPendiente(C, [{ patron: null, campo: null }]), '=0')
})

test('el rubro del prendario es contrato con Compras y está declarado', () => {
  assert.equal(RUBRO_PRENDARIO, 'Financiero')
})

// ══ IIBB PROYECTADO ═══════════════════════════════════════════════════════════════════════════════

const IIBB = { hoja: '_IIBB_RAW', fila0: 4, col: { periodo: 'A', base: 'B', alicuota: 'C' } }

test('IIBB proyectado = base × alícuota, NUNCA un promedio de los meses anteriores', () => {
  const base = formulaBaseIibbProyectada(2026, 9)
  const det = formulaIibbDeterminado('J58', 'J59')
  assert.equal(det, '=J58*J59')
  // El driver: las cobranzas del Libro del mes, netas de IVA.
  assert.ok(base.includes('_MOVIMIENTOS'), 'la base sale del Libro')
  assert.ok(base.includes('"Cobranzas"'), 'el rubro es Cobranzas')
  assert.ok(base.includes('DATE(2026;9;1)'), 'la ventana es la del mes proyectado')
  assert.ok(base.includes('/(1+ALICUOTA_IVA)'), 'la base imponible es NETA de IVA')
  for (const f of [base, det]) {
    assert.ok(!/AVERAGE/i.test(f), 'un promedio no es un driver')
    assert.ok(!/\bMEDIAN\b/i.test(f))
  }
  // Dos meses distintos dan bases distintas: si dieran la misma, sería un promedio disfrazado.
  assert.notEqual(formulaBaseIibbProyectada(2026, 9), formulaBaseIibbProyectada(2026, 10))
})

test('la alícuota de IIBB se REFERENCIA de la última DDJJ, no se tipea', () => {
  const f = formulaAlicuotaIibbVigente(IIBB.hoja, IIBB.fila0, IIBB.col, '2026-06')
  assert.equal(f, '=INDEX(_IIBB_RAW!$C$4:$C;MATCH("2026-06";_IIBB_RAW!$A$4:$A;0))')
  assert.ok(!/0[.,]02/.test(f), 'el 2% no se escribe: se lee de la DDJJ')
  // Sin DDJJ no se inventa una alícuota.
  assert.equal(formulaAlicuotaIibbVigente(IIBB.hoja, IIBB.fila0, IIBB.col, null), '=0')
})

test('los rangos de _IIBB_RAW son ABIERTOS — el tope en la fila 40 ya dejaba afuera una DDJJ', () => {
  // La réplica es de 40 filas y la fila 40 ya estaba ocupada: la DDJJ N° 37 se caía sin un solo error.
  const r = rangoIibb('_IIBB_RAW', 4, 'B')
  assert.equal(r, '_IIBB_RAW!$B$4:$B')
  assert.ok(!/\$40/.test(r), 'un rango cerrado es una bomba con fecha')
})

// ══ LEY 25.413 — DENTRO DEL MODELO ════════════════════════════════════════════════════════════════

test('el impuesto al cheque se deriva del movimiento bancario proyectado, no de un promedio', () => {
  const p = formulaImpuestoChequeProyectado(2026, 10)
  assert.ok(p.includes('_MOVIMIENTOS'), 'el driver es el movimiento del Libro')
  assert.ok(p.includes('*0.006*2'), '0,6% de CADA lado: entra y sale')
  assert.ok(!/AVERAGEIF/i.test(p), 'AVERAGEIF era el bloque muerto de la versión anterior')
  // La fila viva toma el MAYOR entre lo que el banco ya cobró y lo proyectado: nunca subestima.
  const f = formulaImpuestoCheque('_BANCO_RAW', 2026, 10)
  assert.ok(f.startsWith('=MAX('))
  assert.ok(f.includes('Impuesto al cheque'), 'lo real sale del extracto')
  assert.ok(f.includes('_MOVIMIENTOS'), 'lo proyectado sale del Libro')
})

// ══ FINANCIAMIENTO — EL DEFECTO L ═════════════════════════════════════════════════════════════════

const CAL = [
  { fecha: '2026-07-16', dias: -21, vencido: true, concepto: 'IIBB jun', celdaImporte: '$B$16' },
  { fecha: '2026-08-18', dias: 12, vencido: false, concepto: 'Plan F931 ago', celdaImporte: '$B$17' },
  { fecha: '2026-08-19', dias: 13, vencido: false, concepto: 'IVA jul', celdaImporte: '$B$18' },
  { fecha: '2026-09-07', dias: 32, vencido: false, concepto: 'Prendario sep', celdaImporte: '$B$19' },
  { fecha: '2026-11-19', dias: 105, vencido: false, concepto: 'IVA oct', celdaImporte: '$B$20' },
]

test('las ventanas 30/60/90 SUMAN CELDAS, una por una — nunca un rango', () => {
  assert.equal(formulaVentana(CAL, 30), '=$B$17+$B$18')
  assert.equal(formulaVentana(CAL, 60), '=$B$17+$B$18+$B$19')
  assert.equal(formulaVentana(CAL, 90), '=$B$17+$B$18+$B$19')
  // Un rango andaría hoy y mentiría el día que se inserte una obligación en el medio.
  for (const d of [30, 60, 90]) assert.ok(!/:/.test(formulaVentana(CAL, d)), `ventana ${d}: sin rangos`)
  // Lo vencido NO entra en ninguna ventana.
  for (const d of [30, 60, 90]) assert.ok(!formulaVentana(CAL, d).includes('$B$16'))
  // Ninguna obligación en la ventana da 0 explícito, no una celda vacía.
  assert.equal(formulaVentana([], 30), '=0')
})

test('el hero REFERENCIA las celdas del detalle: no vuelve a sumar Compras por su cuenta', () => {
  const f = formulaDeudaPendiente('$B$44', '$B$45')
  assert.equal(f, '=$B$44+$B$45')
  assert.ok(!/SUMIF/.test(f), 'dos sumas del mismo concepto son dos verdades')
  assert.ok(!/Compras/.test(f))
})

test('el próximo vencimiento es el primero NO vencido, con su fecha y su celda', () => {
  const p = proximoVencimiento(CAL)
  assert.deepEqual(p, { fecha: '2026-08-18', concepto: 'Plan F931 ago', formulaImporte: '=$B$17' })
  assert.equal(proximoVencimiento(CAL.filter((f) => f.vencido)), null)
})

// ══ LOS SALDOS A FAVOR NO PUEDEN PUBLICAR #VALUE! NI UN CERO MUDO ═════════════════════════════════
//
// EL DEFECTO, VISTO POR EL DUEÑO EL 17/08. La fila 10 del hero era `=$H$57+$G$67` y publicaba
// "#VALUE! (Function ADD parameter 1 expects number values. But '⚠ vence 20/08' is a text...)".
// La celda H57 —el saldo de libre disponibilidad de julio— tenía una leyenda tipeada a mano.
//
// LA SALIDA FÁCIL ERA UN IFERROR, Y ES PEOR QUE EL ERROR. Un IFERROR deja $0 donde hay $20,2M a
// favor, y "$0 de saldo a favor" es una afirmación falsa que nadie va a ir a verificar: se lee como
// "no tengo nada a favor". Degradar es decir QUÉ falta, no reemplazar el hueco por un número.

test('el saldo a favor con un término que no es número: ni #VALUE! ni un cero, dice qué falta', () => {
  const f = formulaSaldoAFavor('$G$57', '$G$67')
  // Suma sólo si LOS DOS son números: COUNT no cuenta el texto.
  assert.ok(f.startsWith('=IF(COUNT($G$57;$G$67)=2;$G$57+$G$67;'), `la guarda va primero: ${f}`)
  assert.ok(!/IFERROR/.test(f), 'un IFERROR taparía el hueco con un cero que se lee como "no hay saldo"')
  // Y el texto del hueco NOMBRA cuál de los dos falta: sin eso, el dueño ve un aviso y no sabe dónde ir.
  assert.ok(f.includes('ISNUMBER($G$57)') && f.includes('ISNUMBER($G$67)'), `nombra cada término: ${f}`)
  assert.ok(f.includes('IVA') && f.includes('IIBB'), `dice qué impuesto falta: ${f}`)
})

test('un saldo suelto que no es número tampoco se muestra como plata', () => {
  const f = formulaSaldoDeclarado('$G$57')
  assert.ok(f.startsWith('=IF(ISNUMBER($G$57);$G$57;'), `el importe manda cuando es importe: ${f}`)
  assert.ok(/sin dato/.test(f), `una celda vacía se declara, no se dibuja en $0: ${f}`)
})

// ══ LOCALE ════════════════════════════════════════════════════════════════════════════════════════


// ══════════════════════════════════════════════════════════════════════════════════════════════════
// ¿CUÁNDO EL IVA EMPIEZA A SALIR DE LA CAJA? — la pregunta que la pestaña no contestaba
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('el mes que pide caja se busca en los DOCE MESES, nunca en la columna del Total', () => {
  // La N suma la fila entera. Incluida en el rango, un año en que ningún mes suelto pide caja pero
  // el total del año da positivo publicaría "el IVA pide caja" señalando una columna que no es un mes.
  const f = formulaMesQueElIvaPideCaja(55, 52)
  assert.ok(f.includes('$B$55:$M$55'), f)
  assert.ok(!f.includes('$N$'), `el rango no puede llegar al Total: ${f}`)
  assert.ok(f.includes('$B$52:$M$52'), 'el nombre del mes sale del encabezado del cuadro')
})

test('un TEXTO en la fila del a-pagar no puede leerse como "acá pide caja"', () => {
  // En Sheets cualquier texto es MAYOR que cualquier número: sin el filtro por ISNUMBER, la leyenda
  // que una persona deja en un mes ajeno se compara como > 0 y publica el mes equivocado.
  for (const f of [formulaMesQueElIvaPideCaja(55, 52), formulaIvaQuePideCaja(55), formulaColchonQueSeAgota(55, 56)]) {
    assert.ok(f.includes('ISNUMBER('), `sin ISNUMBER un texto se lee como importe: ${f}`)
  }
})

test('sin ningún mes que pida caja se dice, y el colchón es el último saldo publicado', () => {
  // "ninguno en el año" es un HECHO —el crédito de libre disponibilidad lo absorbió todo—, no un
  // hueco: por eso no lleva ⚠. Y el colchón vigente de un saldo acumulado es el último valor de la
  // fila, no una suma: LOOKUP(9^99) devuelve exactamente eso.
  assert.ok(formulaMesQueElIvaPideCaja(55, 52).includes(`"${IVA_SIN_SALIDA}"`))
  assert.ok(formulaColchonQueSeAgota(55, 56).includes('LOOKUP(9^99;$B$56:$M$56)'))
  assert.ok(formulaIvaQuePideCaja(55).endsWith(';0)'), 'cero pesos es la verdad, no un hueco')
})

test('el colchón es el del mes ANTERIOR: el que se agota, no el que ya se agotó', () => {
  const f = formulaColchonQueSeAgota(55, 56)
  assert.ok(/MAX\(1;MATCH\(/.test(f), `tiene que restar uno con piso en enero: ${f}`)
  assert.ok(f.includes(');0)-1))'), `el -1 va sobre la posición, no sobre el rango: ${f}`)
})

test('las tres fórmulas van en locale es-AR: ni una coma de argumento', () => {
  for (const f of [formulaMesQueElIvaPideCaja(55, 52), formulaIvaQuePideCaja(55), formulaColchonQueSeAgota(55, 56)]) {
    assert.ok(!f.replace(/"[^"]*"/g, '').includes(','), `una coma rompe la fórmula en es-AR: ${f}`)
  }
})
