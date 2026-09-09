import test from 'node:test'
import assert from 'node:assert/strict'
import {
  RUBRO_PRENDARIO, formulaCuotaPrendario, formulaPrendarioPendiente,
  formulaAlicuotaIibbVigente, formulaIibbDeterminado,
  formulaImpuestoChequeProyectado, formulaImpuestoCheque,
  formulaVentana, formulaDeudaPendiente,
  proximoVencimiento, rangoIibb, formulaSaldoAFavor,
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
  //
  // Desde el 09/09 sólo queda el prendario: la fórmula de los planes se retiró porque «Cargas
  // Sociales» ya publicaba el mismo saldo por HECHO («la planilla no marcó Pagado»), y dos
  // definiciones de la misma deuda es lo que el dueño mandó unificar. Ver `impuestos-cuadro.mjs`.
  const f = formulaPrendarioPendiente(C)
  assert.match(f, /">"&TODAY\(\)/, 'el corte tiene que ser vivo')
  assert.ok(!/">"&\d+/.test(f), `hay un serial tipeado: ${f}`)
  // Y el serial del día de hoy no puede aparecer por ninguna otra vía.
  assert.ok(!f.includes(String(serialDe(HOY))), 'el serial del día de la corrida no va en la fórmula')
})

// ═══ EL TEST DE `formulaPlanesPendiente` SE FUE CON LA FUNCIÓN (09/09/2026) ═══
//
// Probaba que la deuda de los planes F931 se midiera por fecha prevista y plan por plan. Esa
// definición ya no existe acá: la deuda en planes la publica «Cargas Sociales» por HECHO —lo que la
// planilla no marcó «Pagado»— y esta pestaña la lee por `CARGAS_PLANES_SIN_PAGAR`. Lo que ese test
// protegía —que el corte no fuera un serial tipeado— sigue probado arriba sobre el prendario, y la
// definición que quedó viva la prueba `libro-extractores-cargas.test.mjs`.

test('el rubro del prendario es contrato con Compras y está declarado', () => {
  assert.equal(RUBRO_PRENDARIO, 'Financiero')
})

// ══ IIBB PROYECTADO ═══════════════════════════════════════════════════════════════════════════════

const IIBB = { hoja: '_IIBB_RAW', fila0: 4, col: { periodo: 'A', base: 'B', alicuota: 'C' } }

test('IIBB determinado = base × alícuota, NUNCA un promedio de los meses anteriores', () => {
  // La BASE ya no se define acá: es `ventasFacturadasDelMes`, la misma que el débito fiscal del IVA
  // — ver impuestos-base-unica-de-ventas.test.mjs. Acá queda sólo el driver que la multiplica.
  const det = formulaIibbDeterminado('J58', 'J59')
  assert.ok(!/AVERAGE/i.test(det), 'un promedio no es un driver')
  assert.ok(!/\bMEDIAN\b/i.test(det))
  assert.ok(det.includes('J58') && det.includes('J59'), 'base × alícuota, las dos celdas del mes')
})

test('una base VACÍA no da #VALUE! ni un "$0" que parezca calculado', () => {
  // La base devuelve VACÍO —no cero— cuando el mes no tiene una sola factura emitida. `=""*0,02` da
  // #VALUE! y el error se propaga a la fila que leen el Libro y el cash flow.
  const det = formulaIibbDeterminado('J58', 'J59')
  assert.match(det, /^=IF\(N\(J58\)=0;"";/, 'sin base, la celda queda vacía y no revienta')
  assert.match(det, /N\(J58\)\*J59\)$/, 'con base, sigue siendo base × alícuota')
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

// ═══ LO QUE SE RETIRÓ CON EL HERO DE TRES FILAS (09/09/2026) ═══
//
// Acá vivían siete tests de `formulaSaldoDeclarado`, `formulaMesQueElIvaPideCaja`,
// `formulaIvaQuePideCaja` y `formulaColchonQueSeAgota`. Las cuatro fórmulas se fueron con los
// renglones del hero que las consumían, así que sus tests probaban código muerto — y un test verde
// sobre una función que nadie llama enseña a confiar en que algo sigue funcionando.
//
// El único de ellos que protegía una regla y no una redacción se conserva abajo, sobre la fórmula
// que SÍ quedó: que un texto en una celda de saldo no se lea como un importe.

test('el hero no se rompe cuando la celda de un saldo tiene texto en vez de plata', () => {
  // El 17/08 alguien tipeó «⚠ vence 20/08» donde va el saldo de libre disponibilidad de julio y la
  // fila del hero publicó #VALUE! en la primera pantalla de la pestaña. `COUNT` cuenta números y sólo
  // números: con un término de texto la suma no se hace y se declara cuál falta.
  const f = formulaSaldoAFavor('$G$57', '$G$67')
  assert.ok(!/IFERROR/.test(f), 'un IFERROR dejaría $0 donde hay millones a favor')
  assert.ok(f.includes('ISNUMBER($G$57)') && f.includes('ISNUMBER($G$67)'), f)
})

