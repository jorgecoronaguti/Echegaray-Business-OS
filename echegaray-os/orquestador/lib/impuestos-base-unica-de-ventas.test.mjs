// UNA SOLA DEFINICIÓN DE «LAS VENTAS DEL MES», Y NINGÚN MES CON MEDIO PERÍODO FISCAL.
//
// ═══ EL DEFECTO, MEDIDO EN LA PESTAÑA REAL EL 04/09/2026 ═══
//
// «Impuestos y Financieros» afirmaba dos cosas incompatibles sobre los mismos meses:
//
//   · bloque 1, «Débito fiscal del período» → facturas emitidas (devengado):
//     sep $14.941.435 · oct $5.522.041 · nov VACÍO · dic VACÍO
//   · bloque 2, «Base imponible declarada»  → cobranzas del Libro (percibido):
//     sep $183.717.604 · oct $75.425.333 · nov $20.405.671 · dic $15.838.074
//
// En septiembre un bloque decía que se vendieron $71,1M y el de al lado $183,7M. En noviembre uno
// decía CERO ventas y el otro $20,4M.
//
// Y de ahí salía el reporte del dueño: *«cómo me va a dar a pagar si tengo saldo a favor en los
// meses siguientes, revisar y rehacer»*. Noviembre y diciembre tenían crédito fiscal PROYECTADO
// ($656.188 por mes, de las compras recurrentes del Libro) y débito CERO, porque no hay una sola
// factura con esas fechas: el cuadro fabricaba $1.312.377 de saldo a favor a fin de año proyectando
// un solo lado del período.

import test from 'node:test'
import assert from 'node:assert/strict'
import { ventasFacturadasDelMes, planDeVentas, ventasPorMesDeEmision } from './impuestos-base-libro.mjs'
import { origenDelMes, ORIGEN } from './impuestos-bloques.mjs'
import { proyectarLibreDisponibilidad } from './iva-libre-disponibilidad.mjs'

// `Cobranzas!A5:P`: 1 = Categoría · 9 = neto · 10 = IVA · 15 = «Fecha de Factura».
const serial = (y, m, d) => Math.floor((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000)
const factura = (cat, y, m, neto, iva) => {
  const f = [1, cat, null, 'FA', '01-1', '', 'ARCOR', '', '', neto, iva]
  f[15] = serial(y, m, 15)
  return f
}
/** Las cinco facturas de septiembre y las dos de octubre, y nada después: el archivo real. */
const COMO_EL_ARCHIVO = [
  factura('B', 2026, 9, 71149689, 14941435),
  factura('B', 2026, 10, 26295434, 5522041),
  // Un cobro sin factura: entra a la caja, no devenga IVA, y no puede fabricar un mes facturado.
  factura('N', 2026, 11, 11914815, 0),
]

test('LA CONTRADICCIÓN: noviembre no puede tener crédito proyectado y cero débito a la vez', () => {
  const plan = planDeVentas(COMO_EL_ARCHIVO, 2026, '2026-09-04')
  const aProyectar = [10, 11, 12]
  const sinBase = plan.sinBase(aProyectar)
  assert.deepEqual(sinBase, [11, 12], 'nov y dic no tienen ni una factura emitida: no tienen base')

  // El generador le pregunta a `origenDelMes` qué es cada mes. Con base, PROYECCIÓN; sin base, hueco.
  const ctx = { mesesDDJJ: [], ancla: 9, mesesArca: [], mesesProy: aProyectar, mesEnCurso: 9, sinVentas: sinBase }
  assert.equal(origenDelMes(10, ctx), ORIGEN.proyeccion, 'octubre tiene facturas: se proyecta')
  assert.equal(origenDelMes(11, ctx), ORIGEN.sinVentas)
  assert.equal(origenDelMes(12, ctx), ORIGEN.sinVentas)

  // ANTES: sin `sinVentas`, noviembre volvía PROYECCIÓN — y una proyección escribe el crédito del
  // Libro con el débito vacío. Ésta es la línea que se pone roja si se revierte el arreglo.
  assert.notEqual(origenDelMes(11, { ...ctx, sinVentas: [] }), ORIGEN.sinVentas,
    'la guarda tiene que PODER dar el otro resultado: si no, el test no prueba nada')
})

test('el saldo a favor de fin de año era el crédito de dos meses que nunca tuvieron débito', () => {
  // La aritmética exacta del cuadro viejo: ancla en $0, débito cero en los dos meses y el crédito de
  // las compras recurrentes del Libro — $656.188,50 de IVA por mes, que en bruto es esto.
  const brutoDe = (iva) => iva * (1 + 0.21) / 0.21
  const viejo = proyectarLibreDisponibilidad([], [
    { periodo: '2026-11', debito_declarado: 0, base_credito: brutoDe(656188.5), supuesto: 's' },
    { periodo: '2026-12', debito_declarado: 0, base_credito: brutoDe(656188.5), supuesto: 's' },
  ], 0.21)
  assert.equal(Math.round(viejo[1].libre_disp), 1312377, 'así se fabricaba el saldo a favor')

  // AHORA esos dos meses no se proyectan: no hay período fiscal que calcular sin base de ventas.
  const plan = planDeVentas(COMO_EL_ARCHIVO, 2026, '2026-09-04')
  const proyectables = [11, 12].filter((m) => !plan.sinBase([11, 12]).includes(m))
  assert.deepEqual(proyectables, [], 'ningún mes sin ventas cargadas llega al arrastre')
})

test('LAS DOS DEFINICIONES SON LA MISMA FUNCIÓN — sólo cambian de columna', () => {
  const debito = ventasFacturadasDelMes(2026, 9, 'iva', { hoy: '2026-09-04' })
  const baseIibb = ventasFacturadasDelMes(2026, 9, 'neto', { hoy: '2026-09-04' })
  // Idénticas salvo la columna que suman: si alguien vuelve a escribir una de las dos por su cuenta,
  // esta igualdad se rompe.
  assert.equal(debito.replaceAll('Cobranzas!$K$5:$K', '<medida>'), baseIibb.replaceAll('Cobranzas!$J$5:$J', '<medida>'))
  for (const f of [debito, baseIibb]) {
    assert.match(f, /Cobranzas!\$B\$5:\$B="B"/, 'sólo lo facturado — la orden permanente del dueño')
    assert.match(f, /Cobranzas!\$P\$5:\$P>=DATE\(2026;9;1\)/, 'la ventana es la de EMISIÓN de la factura')
    assert.match(f, /IF\(x=0;""/, 'un mes sin ventas vale VACÍO, no cero')
    assert.doesNotMatch(f, /_MOVIMIENTOS/, 'la base no puede salir de las cobranzas del Libro')
  }
  // Y la base de IIBB dejó de ser un percibido dividido por la alícuota de IVA.
  assert.doesNotMatch(baseIibb, /ALICUOTA_IVA/, 'la base imponible ya no se deriva de un bruto de caja')
})

test('la medida no puede ser cualquier cosa: una columna inventada rompe, no devuelve cero', () => {
  assert.throws(() => ventasFacturadasDelMes(2026, 9, 'total', { hoy: '2026-09-04' }), /no es una medida/)
  assert.throws(() => ventasFacturadasDelMes(2026, 9, 'iva'), /falta `hoy`/, 'sin fecha no sabe qué mes cerró')
})

test('LA FRONTERA SE MUEVE SOLA: cargar una factura de noviembre le devuelve la base', () => {
  const conNoviembre = [...COMO_EL_ARCHIVO, factura('B', 2026, 11, 10000000, 2100000)]
  const plan = planDeVentas(conNoviembre, 2026, '2026-09-04')
  assert.equal(plan.ultimoMesFacturado, 11, 'la frontera se calcula del dato, no se cablea')
  assert.deepEqual(plan.sinBase([10, 11, 12]), [12], 'noviembre pasa a tener base sin tocar el código')
  assert.equal(plan.neto(11), 10000000)
  assert.equal(plan.iva(11), 2100000)
})

test('un mes YA TRANSCURRIDO sin ventas sí se calcula: ahí el cero es un hecho', () => {
  // La diferencia entre «no vendí» y «todavía no sé» es la fecha de hoy, y sólo esa.
  const plan = planDeVentas(COMO_EL_ARCHIVO, 2026, '2026-12-31')
  assert.deepEqual(plan.sinBase([10, 11, 12]), [], 'con el año terminado no falta ningún dato')
})

test('las ventas por mes de emisión traen neto e IVA juntos, y no cuentan las N', () => {
  const r = ventasPorMesDeEmision(COMO_EL_ARCHIVO, '2026-09-04')
  assert.deepEqual(r['2026-09'], { neto: 71149689, iva: 14941435, facturas: 1 })
  assert.equal(r['2026-11'], undefined, 'una fila N no convierte a noviembre en un mes facturado')
})

test('el núcleo NO vuelve a convertir un débito que ya es impuesto', () => {
  // El `--dry` exhibía el débito 17,4% más chico que el que la celda iba a escribir.
  const p = proyectarLibreDisponibilidad([], [{ periodo: '2026-10', debito_declarado: 5522041, base_credito: 0, supuesto: 's' }], 0.21)
  assert.equal(Math.round(p[0].debito), 5522041)
  assert.throws(() => proyectarLibreDisponibilidad([], [
    { periodo: '2026-10', debito_declarado: 1, base_debito: 1, base_credito: 0, supuesto: 's' },
  ], 0.21), /elegí cuál/)
})

// ═══ «REVISAR BIEN LAS FECHAS DE FACTURA CON B, PARA LO QUE PASÓ Y PARA LO FUTURO» (09/09/2026) ═══
import { periodoDeVenta } from './impuestos-base-libro.mjs'
const serialDe = (y, m, d) => Math.floor((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000)
const filaB = ({ comprobante = '', factura, cobro = null, neto = 100, iva = 21 }) => {
  const f = []; f[1] = 'B'; f[4] = comprobante; f[9] = neto; f[10] = iva; f[15] = factura; f[16] = cobro; return f
}
const HOY = '2026-09-09'

test('mes CERRADO: sólo cuenta la B EMITIDA — la misma población que ARCA', () => {
  assert.equal(periodoDeVenta(filaB({ comprobante: '01-00000227', factura: serialDe(2026, 8, 18) }), HOY), '2026-08')
  // Quattropani, fila 78: «18/08» sin comprobante y cobro el 11/09. No es una venta de agosto.
  assert.notEqual(periodoDeVenta(filaB({ factura: serialDe(2026, 8, 18), cobro: serialDe(2026, 9, 11) }), HOY), '2026-08')
})

test('B vencida y no emitida se corre al mes de su FECHA DE COBRO — el dato del dueño, no un supuesto', () => {
  assert.equal(periodoDeVenta(filaB({ factura: serialDe(2026, 8, 18), cobro: serialDe(2026, 9, 11) }), HOY), '2026-09')
  assert.equal(periodoDeVenta(filaB({ factura: serialDe(2026, 8, 18), cobro: serialDe(2026, 12, 30) }), HOY), '2026-12')
  // ARCOR, fila 59: factura «30/01», cobro 30/09, «Proyectado» → septiembre.
  assert.equal(periodoDeVenta(filaB({ factura: serialDe(2026, 1, 30), cobro: serialDe(2026, 9, 30) }), HOY), '2026-09')
})

test('B vencida, no emitida y con cobro también vencido cae en el MES EN CURSO', () => {
  assert.equal(periodoDeVenta(filaB({ factura: serialDe(2026, 6, 11), cobro: serialDe(2026, 8, 5) }), HOY), '2026-09')
  assert.equal(periodoDeVenta(filaB({ factura: serialDe(2026, 6, 11) }), HOY), '2026-09', 'sin fecha de cobro, también')
})

test('el plan FUTURO va por «Fecha de Factura», emitida o no', () => {
  assert.equal(periodoDeVenta(filaB({ factura: serialDe(2026, 10, 9), cobro: serialDe(2026, 10, 9) }), HOY), '2026-10')
  assert.equal(periodoDeVenta(filaB({ factura: serialDe(2026, 9, 22) }), HOY), '2026-09')
})

test('la fórmula del mes CERRADO exige comprobante y la del futuro suma las vencidas por su cobro', () => {
  const ago = ventasFacturadasDelMes(2026, 8, 'iva', { hoy: HOY })
  assert.match(ago, /\$E\$5:\$E<>""/)
  assert.doesNotMatch(ago, /\$Q\$5:\$Q/)
  const oct = ventasFacturadasDelMes(2026, 10, 'iva', { hoy: HOY })
  assert.match(oct, /\$Q\$5:\$Q>=DATE\(2026;10;1\)/)
  assert.match(oct, /\$P\$5:\$P<DATE\(2026;9;1\)/, 'sólo las vencidas se corren')
  const sep = ventasFacturadasDelMes(2026, 9, 'iva', { hoy: HOY })
  assert.match(sep, /N\(Cobranzas!\$Q\$5:\$Q\)<DATE\(2026;9;1\)/, 'el mes en curso recoge las que ya vencieron del todo')
  assert.doesNotMatch(oct, /N\(Cobranzas!\$Q\$5:\$Q\)<DATE/)
})
