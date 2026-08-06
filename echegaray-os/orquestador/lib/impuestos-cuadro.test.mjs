import test from 'node:test'
import assert from 'node:assert/strict'
import {
  RUBRO_PRENDARIO, formulaCuotaPrendario, formulaPrendarioPendiente, formulaPlanesPendiente,
  formulaAlicuotaIibbVigente, formulaBaseIibbProyectada, formulaIibbDeterminado,
  formulaImpuestoChequeProyectado, formulaImpuestoCheque, filasFinanciamiento,
  costoDescubiertoDiario, formulaVentana, formulaVencidoImpago, formulaDeudaPendiente,
  proximoVencimiento, rangoIibb,
} from './impuestos-cuadro.mjs'
import { serialDe } from './vencimientos-fiscales.mjs'
import { ACUERDO, TARJETA } from './banco-santander.mjs'

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
  const f = formulaPrendarioPendiente(C, HOY)
  assert.equal(f, '=SUMIFS(Compras!$O$4:$O;Compras!$AB$4:$AB;"Financiero";Compras!$Q$4:$Q;">"&46240)')
  assert.equal(serialDe(HOY), 46240)
  assert.ok(/">"&/.test(f), 'sin condición de fecha, "pendiente" es el total histórico')
})

test('la deuda pendiente de los planes también es sólo lo futuro, y por plan', () => {
  const planes = [
    { patron: 'W303094', campo: 'concepto' },
    { patron: '931 Dic 25', campo: 'detalle' },
    { patron: '931 Enero 26', campo: 'detalle' },
  ]
  const f = formulaPlanesPendiente(C, planes, HOY)
  assert.ok(f.includes('Compras!$L$4:$L;"*W303094*"'), 'W303094 se identifica por Concepto')
  assert.ok(f.includes('Compras!$K$4:$K;"*931 Dic 25*"'), 'los de deuda previsional, por Detalles / Obra')
  assert.equal((f.match(/SUMIFS/g) ?? []).length, 3, 'un término por plan')
  assert.equal((f.match(/">"&46240/g) ?? []).length, 3, 'los tres, sólo hacia adelante')
  // Sin planes reconocidos no se inventa un importe: da 0 explícito.
  assert.equal(formulaPlanesPendiente(C, [], HOY), '=0')
  assert.equal(formulaPlanesPendiente(C, [{ patron: null, campo: null }], HOY), '=0')
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

test('la posición de financiamiento muestra las CUATRO fuentes, no dos', () => {
  const filas = filasFinanciamiento({
    acuerdo: ACUERDO, tarjeta: TARJETA, celdaPrendario: '$B$44', celdaPlanes: '$B$45',
    celdaUsoDescubierto: 'CAJA_SALDO_BANCO',
  })
  assert.equal(filas.length, 4)
  assert.match(filas[0].rotulo, /descubierto Santander N° 00007/)
  assert.equal(filas[0].limite, 18200000)
  assert.match(filas[1].rotulo, /Tarjeta de crédito/)
  assert.equal(filas[1].limite, 10000000)
  assert.equal(filas[1].disponible, TARJETA.disponible)
  assert.match(filas[2].rotulo, /Prendario Ford XLS/)
  assert.equal(filas[2].usado, '=$B$44')
  assert.match(filas[3].rotulo, /Planes de pago F931/)
  assert.equal(filas[3].usado, '=$B$45')
})

test('el costo del descubierto lleva sus impuestos: ×1,12, verificado contra el cargo del banco', () => {
  // 55%/365 × 1,12 = 0,00168767… → $1.687,67 por millón por día. El interés solo subestima 12%.
  const d = costoDescubiertoDiario()
  assert.ok(Math.abs(d - (0.55 / 365) * 1.12) < 1e-12)
  assert.equal(Math.round(d * 1e6), 1688)
  const filas = filasFinanciamiento({ acuerdo: ACUERDO, tarjeta: TARJETA, celdaPrendario: 'B1', celdaPlanes: 'B2' })
  assert.match(filas[0].origen, /62,78%/, 'el porcentaje se escribe en es-AR')
  // LOS DOS NÚMEROS, siempre juntos: el interés puro ($1.506,85) y lo que sale de la cuenta
  // ($1.687,67). Publicar uno solo deja al lector eligiendo cuál es "el" costo del descubierto.
  assert.match(filas[0].origen, /1\.506,85 de interés/)
  assert.match(filas[0].origen, /1\.687,67 con IVA/)
})

// ══ HERO Y VENTANAS — REFERENCIAS, NO RECÁLCULOS ══════════════════════════════════════════════════

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

test('el riesgo es lo VENCIDO e impago, y se suma aparte de la proyección', () => {
  assert.equal(formulaVencidoImpago(CAL), '=$B$16')
  assert.equal(formulaVencidoImpago(CAL.filter((f) => !f.vencido)), '=0')
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

// ══ LOCALE ════════════════════════════════════════════════════════════════════════════════════════

test('todas las fórmulas van en locale es-AR: separador ";", nunca ","', () => {
  const todas = [
    formulaCuotaPrendario(C, 2026, 9), formulaPrendarioPendiente(C, HOY),
    formulaPlanesPendiente(C, [{ patron: 'W303094', campo: 'concepto' }], HOY),
    formulaAlicuotaIibbVigente(IIBB.hoja, IIBB.fila0, IIBB.col, '2026-06'),
    formulaBaseIibbProyectada(2026, 9), formulaIibbDeterminado('J58', 'J59'),
    formulaImpuestoChequeProyectado(2026, 10), formulaImpuestoCheque('_BANCO_RAW', 2026, 10),
    formulaVentana(CAL, 30), formulaVencidoImpago(CAL), formulaDeudaPendiente('$B$44', '$B$45'),
  ]
  for (const f of todas) {
    assert.ok(f.startsWith('='), `una fórmula empieza con "=": ${f.slice(0, 40)}`)
    assert.ok(!f.includes(','), `coma en una fórmula es-AR (es el decimal, no el separador): ${f.slice(0, 80)}`)
  }
})
