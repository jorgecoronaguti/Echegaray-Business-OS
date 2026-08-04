import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  lineasDeCaja, lineasQueNecesitanResolutor, marcaDeLinea,
  sumandosEnVentana, expresionSaleEnVentana, expresionEntraEnVentana,
  conceptosFueraDelCalendario,
} from './calendario-egresos.mjs'

// El resolutor completo, como lo pasa el generador. Devuelve marcas reconocibles, no números.
const RESOLUTOR = {
  'cheques:cheques': (d, h) => `CHQ(${d};${h})`,
  'cheques:tarjeta': (d, h) => `TAR(${d};${h})`,
  impuestos: (d, h) => `IVA(${d};${h})`,
  descubierto: (d, h) => `DESC(${d};${h})`,
  comisiones: (d, h) => `COM(${d};${h})`,
  impuestoCheque: (d, h) => `ICH(${d};${h})`,
}

test('los memos (signo 0) NO entran: sumarlos contaría dos veces la misma nómina', () => {
  const nombres = lineasDeCaja().map(({ linea }) => linea.nombre)
  // La nómina de administración vive DOS veces en el cuadro: la que suma (planilla) y el memo
  // (Compras). Si el calendario tomara las dos, agosto contaría $12.023.125 + $18.800.000.
  assert.ok(nombres.includes('Sueldos de administración'))
  assert.ok(!nombres.includes('Sueldos de administración cargados a mano en Compras'))
  // Y lo mismo del lado del banco: son control, no caja.
  assert.ok(!nombres.includes('AFIP — pagos debitados de la cuenta'))
})

test('EL DEFECTO DE LOS $41,7M: los conceptos que el calendario viejo no veía', () => {
  // Las tres fuentes que sumaba el calendario de CAJA antes de esto: cheques emitidos, jornales de
  // obra y sueldos de oficina. Todo lo demás salía de la caja sin que el piso lo supiera.
  const loQueVeiaElCalendarioViejo = ['Jornales de obra', 'Cheques sin factura cargada', 'Cuotas de tarjeta sin factura cargada']
  const ciegos = conceptosFueraDelCalendario(loQueVeiaElCalendarioViejo)
  // Medidos en el Sheet real al 04/08 sobre la ventana de agosto:
  assert.ok(ciegos.includes('Sueldos de administración'))          // $12.023.125 (incluye $9M de Dirección)
  assert.ok(ciegos.includes('Cargas sociales (F931)'))             // $8.000.000
  assert.ok(ciegos.includes('Planes de pago de deuda previsional')) // $2.968.643
  assert.ok(ciegos.includes('Aportes y contribuciones gremiales'))  // $1.530.185
  assert.ok(ciegos.includes('Gastos de estructura y administración'))
  assert.ok(ciegos.includes('Cuotas de crédito prendario y gastos bancarios'))
  assert.ok(ciegos.includes('Materiales e insumos de obra civil'))
})

test('con la definición única no queda ningún concepto de egreso afuera', () => {
  const todos = lineasDeCaja().filter(({ signo }) => signo === -1).map(({ linea }) => linea.nombre)
  assert.deepEqual(conceptosFueraDelCalendario(todos), [])
})

test('FALLA CERRADO: una línea sin resolutor rompe en vez de desaparecer del calendario', () => {
  // Es el corazón del defecto: no fue una fórmula mal escrita, fue plata que nadie sumó y nada
  // avisó. Sin resolutor, las cinco líneas especiales se irían en silencio.
  assert.throws(() => sumandosEnVentana(-1, 'A1', 'B1'), /sin forma de calcularse|silencio/)
  // Y con un resolutor INCOMPLETO también: el que falta tiene que aparecer nombrado.
  const { descubierto, ...incompleto } = RESOLUTOR
  assert.ok(descubierto)
  assert.throws(
    () => sumandosEnVentana(-1, 'A1', 'B1', incompleto),
    /Intereses del acuerdo en descubierto/)
})

test('con el resolutor completo, las cinco especiales entran al calendario', () => {
  const sale = expresionSaleEnVentana('A1', 'B1', RESOLUTOR)
  for (const marca of ['CHQ(A1;B1)', 'TAR(A1;B1)', 'IVA(A1;B1)', 'DESC(A1;B1)', 'COM(A1;B1)', 'ICH(A1;B1)']) {
    assert.ok(sale.includes(marca), `falta ${marca} en la salida del tramo`)
  }
  assert.deepEqual(lineasQueNecesitanResolutor().length, 6)
})

test('la ventana se propaga a TODOS los sumandos — un tramo no puede quedar con la ventana de otro', () => {
  // El calendario arma seis tramos con seis ventanas. Si un sumando ignorara el par (desde;hasta) —
  // por ejemplo porque su fórmula fuera fija— ese concepto se contaría igual en los seis tramos.
  const a = sumandosEnVentana(-1, 'TODAY()', 'TODAY()+7', RESOLUTOR)
  const b = sumandosEnVentana(-1, 'TODAY()+7', 'TODAY()+14', RESOLUTOR)
  assert.equal(a.length, b.length)
  a.forEach((s, i) => {
    assert.notEqual(s.expresion, b[i].expresion, `"${s.nombre}" da la misma fórmula en dos tramos distintos`)
  })
})

test('entra y sale son universos DISJUNTOS: ninguna línea cae de los dos lados', () => {
  const entra = new Set(sumandosEnVentana(1, 'A1', 'B1', RESOLUTOR).map((s) => s.nombre))
  const sale = sumandosEnVentana(-1, 'A1', 'B1', RESOLUTOR).map((s) => s.nombre)
  assert.deepEqual(sale.filter((n) => entra.has(n)), [])
})

test('las cobranzas esperadas SUMAN al lado que entra (son proyección, pero son plata)', () => {
  const entra = expresionEntraEnVentana('A1', 'B1', RESOLUTOR)
  const nombres = sumandosEnVentana(1, 'A1', 'B1', RESOLUTOR).map((s) => s.nombre)
  assert.ok(nombres.includes('Esperado · obra civil'))
  assert.ok(nombres.includes('Cobranzas de obra civil'))
  assert.ok(entra.length > 0)
})

test('marcaDeLinea distingue cheque de tarjeta: son dos instrumentos, no uno', () => {
  // Ya costó caro confundirlos en Cheques Recibidos: el número no identifica el instrumento.
  assert.equal(marcaDeLinea({ cheques: true, inst: 'cheques' }), 'cheques:cheques')
  assert.equal(marcaDeLinea({ cheques: true, inst: 'tarjeta' }), 'cheques:tarjeta')
  assert.equal(marcaDeLinea({ rubro: 'Estructura' }), null)
})
