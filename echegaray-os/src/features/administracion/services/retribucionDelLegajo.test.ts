import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  armarRetribucion, filasDeRetribucion, historialDelBlanco, quincenasDelAnio, totalesDeRetribucion,
  type LineaRetribuida, type QuincenaRetribuida,
} from './retribucionDelLegajo.ts'
import { pagoDeLaLinea } from './pagoDeLaQuincena.ts'
import { quincenaDe } from './quincena.ts'

// LOS DEFECTOS QUE ESTOS TESTS ATRAPAN:
//
//  1. Que el año tenga una quincena de más o de menos: sumar quince días en vez de caminar por el
//     borde da 19 quincenas hasta septiembre, o se come la 2ª de febrero.
//  2. Que un mensual sume su neto dos veces por mes (la Liquidación lo publica ENTERO en cada
//     quincena) o que lo pagado en la 1ª desaparezca al leer el mes por la 2ª.
//  3. Que una quincena donde la persona NO está en el plantel se dibuje en $0 y sume como cero.
//  4. Que el jefe de obra vea «sin liquidaciones» cuando lo que pasa es que no puede verlas.
//  5. Que el historial del blanco ordene `Q2-08/2026` después de `Q1-09/2026` por comparar texto.
//  6. Que una fila sin saldo que afirmar (sin negro) sume $0 al negro y aun así no cuente lo pagado.
//  7. Que una quincena que la Liquidación marcó «sin neto» escriba banco $0 como si lo hubiera afirmado,
//     y que el recibo real del período no llegue a la fila como referencia.

const q = (desde: string): QuincenaRetribuida['quincena'] => quincenaDe(desde)

const porHora = (o: {
  horas: number; valorHora: number; banco: number | null; negro: number | null
  pagadoBanco?: number; pagadoEfectivo?: number; estimado?: boolean; sinNeto?: boolean
}): LineaRetribuida => ({
  modalidad: 'hora', horas: o.horas, valorHora: o.valorHora, netoMensual: null, cobra: null, sinTarifa: false, sinNeto: o.sinNeto === true,
  sueldo: { estado: o.estimado ? 'estimado' : 'recibo' },
  pago: pagoDeLaLinea({ banco: o.banco, negro: o.negro, pagadoBanco: o.pagadoBanco, pagadoEfectivo: o.pagadoEfectivo }),
})

const mensual = (neto: number, pagadoBanco: number): LineaRetribuida => ({
  modalidad: 'mensual', horas: 90, valorHora: null, netoMensual: neto, cobra: neto, sinTarifa: false, sinNeto: false, sueldo: null,
  pago: pagoDeLaLinea({ banco: neto, negro: 0, pagadoBanco }),
})

test('las quincenas del año llegan hasta la que contiene hoy, sin una de más', () => {
  const lista = quincenasDelAnio(2026, '2026-09-16')
  assert.equal(lista.length, 18)
  assert.deepEqual(lista[0], { desde: '2026-01-01', hasta: '2026-01-15' })
  assert.deepEqual(lista[3], { desde: '2026-02-16', hasta: '2026-02-28' })
  assert.deepEqual(lista[17], { desde: '2026-09-16', hasta: '2026-09-30' })
  assert.equal(quincenasDelAnio(2026, '2027-03-02').length, 24)
  assert.deepEqual(quincenasDelAnio(2026, '2025-12-31'), [])
})

test('una fila por quincena, de la más nueva a la más vieja, con el saldo que dio la Liquidación', () => {
  const filas = filasDeRetribucion([
    { quincena: q('2026-09-01'), estado: 'cerrada', linea: porHora({ horas: 100, valorHora: 6000, banco: 250000, negro: 350000, pagadoBanco: 250000, pagadoEfectivo: 100000 }) },
    { quincena: q('2026-09-16'), estado: 'abierta', linea: porHora({ horas: 40, valorHora: 6000, banco: 120000, negro: 120000, estimado: true }) },
  ])
  assert.deepEqual(filas.map((f) => f.periodo), ['2ª quincena de septiembre', '1ª quincena de septiembre'])
  assert.deepEqual(filas.map((f) => f.estado), ['abierta', 'cerrada'])
  assert.equal(filas[1].pago?.total, 600000)
  assert.equal(filas[1].pago?.pagado, 350000)
  assert.equal(filas[1].pago?.saldoTotal, 250000)
  assert.equal(filas[1].bancoEstimado, false)
  assert.equal(filas[0].bancoEstimado, true)
  assert.equal(filas[0].tarifa, 6000)
})

test('el pie suma lo que muestran las filas: horas, negro, blanco, pagado y saldo', () => {
  const filas = filasDeRetribucion([
    { quincena: q('2026-08-16'), estado: 'cerrada', linea: porHora({ horas: 80, valorHora: 5000, banco: 200000, negro: 200000, pagadoBanco: 200000, pagadoEfectivo: 200000 }) },
    { quincena: q('2026-09-01'), estado: 'abierta', linea: porHora({ horas: 100, valorHora: 6000, banco: 250000, negro: 350000, pagadoEfectivo: 100000 }) },
  ])
  const t = totalesDeRetribucion(filas)
  assert.equal(t.horas, 180)
  assert.equal(t.negro, 550000)
  assert.equal(t.blanco, 450000)
  assert.equal(t.total, 1000000)
  assert.equal(t.pagadoBanco, 200000)
  assert.equal(t.pagadoEfectivo, 300000)
  assert.equal(t.pagado, 500000)
  assert.equal(t.saldo, 500000)
  assert.equal(t.liquidadas, 2)
  assert.equal(t.sinSaldo, 0)
})

test('un mensual se lee por mes: el neto una sola vez y lo pagado de las dos quincenas', () => {
  const filas = filasDeRetribucion([
    { quincena: q('2026-09-01'), estado: 'cerrada', linea: mensual(1800000, 900000) },
    { quincena: q('2026-09-16'), estado: 'abierta', linea: mensual(1800000, 900000) },
    { quincena: q('2026-08-16'), estado: 'cerrada', linea: mensual(1800000, 1800000) },
    { quincena: q('2026-08-01'), estado: 'cerrada', linea: mensual(1800000, 0) },
  ])
  assert.deepEqual(filas.map((f) => f.periodo), ['Septiembre', 'Agosto'])
  assert.equal(filas[0].mensual, true)
  assert.equal(filas[0].tarifa, 1800000)
  assert.equal(filas[0].horas, 180)
  assert.equal(filas[0].pago?.total, 1800000)
  assert.equal(filas[0].pago?.pagado, 1800000)
  assert.equal(filas[0].pago?.saldoTotal, 0)
  assert.equal(filas[0].estado, 'abierta')
  assert.equal(filas[1].estado, 'cerrada')
  assert.equal(totalesDeRetribucion(filas).total, 3600000)
})

test('un mes con una quincena por hora y otra mensual no se junta: cada tramo con su forma', () => {
  const filas = filasDeRetribucion([
    { quincena: q('2026-07-01'), estado: 'cerrada', linea: porHora({ horas: 90, valorHora: 5000, banco: 200000, negro: 250000 }) },
    { quincena: q('2026-07-16'), estado: 'cerrada', linea: mensual(1500000, 0) },
  ])
  assert.equal(filas.length, 2)
  assert.deepEqual(filas.map((f) => f.mensual), [true, false])
})

test('una quincena fuera del plantel se dibuja vacía y no suma como cero', () => {
  const filas = filasDeRetribucion([
    { quincena: q('2026-09-01'), estado: null, linea: null },
    { quincena: q('2026-09-16'), estado: 'abierta', linea: porHora({ horas: 40, valorHora: 6000, banco: 100000, negro: 140000 }) },
  ])
  assert.equal(filas[1].estado, 'fuera')
  assert.equal(filas[1].pago, null)
  assert.equal(filas[1].horas, null)
  const t = totalesDeRetribucion(filas)
  assert.equal(t.liquidadas, 1)
  assert.equal(t.total, 240000)
})

test('una fila sin saldo que afirmar no suma al negro pero lo pagado sí cuenta', () => {
  const filas = filasDeRetribucion([
    { quincena: q('2026-09-01'), estado: 'abierta', linea: porHora({ horas: 50, valorHora: 6000, banco: 150000, negro: null, pagadoEfectivo: 80000 }) },
  ])
  const t = totalesDeRetribucion(filas)
  assert.equal(t.sinSaldo, 1)
  assert.equal(t.negro, 0)
  assert.equal(t.pagado, 80000)
})

test('sin permiso no hay filas ni cifras, y el armado lo dice', () => {
  const r = armarRetribucion({ puedeVer: false, anio: 2026, quincenas: [], recibos: [], errores: [] })
  assert.equal(r.puedeVer, false)
  assert.deepEqual(r.filas, [])
  assert.deepEqual(r.cifras, [])
})

test('sin ninguna liquidación las cifras escriben el motivo, nunca $0', () => {
  const r = armarRetribucion({
    puedeVer: true, anio: 2026, recibos: [], errores: ['x', 'x', 'y'],
    quincenas: [{ quincena: q('2026-09-01'), estado: null, linea: null }],
  })
  assert.equal(r.cifras.length, 5)
  assert.ok(r.cifras.every((c) => c.valor === null && c.falta === 'sin liquidaciones'))
  assert.deepEqual(r.errores, ['x', 'y'])
})

test('con liquidaciones las cifras del año son las del pie, ya formateadas', () => {
  const r = armarRetribucion({
    puedeVer: true, anio: 2026, recibos: [], errores: [],
    quincenas: [{ quincena: q('2026-09-01'), estado: 'cerrada', linea: porHora({ horas: 100.5, valorHora: 6000, banco: 250000, negro: 353000, pagadoBanco: 250000, pagadoEfectivo: 100000 }) }],
  })
  assert.deepEqual(r.cifras.map((c) => [c.rotulo, c.valor]), [
    ['liquidado 2026', '$603.000'], ['consta pagado 2026', '$350.000'], ['negro 2026', '$353.000'],
    ['blanco 2026', '$250.000'], ['horas 2026', '100,5 h'],
  ])
})

test('una quincena sin neto afirmado lo dice, y el recibo real del período viaja como referencia', () => {
  const filas = filasDeRetribucion([
    { quincena: q('2026-09-01'), estado: 'abierta', linea: porHora({ horas: 99, valorHora: 5974, banco: 0, negro: 292726, estimado: true, sinNeto: true, pagadoBanco: 200000 }) },
    { quincena: q('2026-08-16'), estado: 'cerrada', linea: porHora({ horas: 107, valorHora: 5974, banco: 0, negro: 639218 }) },
  ], [
    { periodo: 'Q2-08/2026', categoria: 'OFICIAL', valorHora: 6348, neto: 215564.62 },
    { periodo: 'Q2-08/2026', categoria: 'OFICIAL', valorHora: 6348, neto: 100 },
    { periodo: 'Q1-09/2026', categoria: 'OFICIAL', valorHora: 6348, neto: null },
  ])
  assert.equal(filas[0].sinNeto, true)
  assert.equal(filas[0].bancoEstimado, false)
  assert.equal(filas[0].reciboReal, null)
  assert.equal(filas[1].sinNeto, false)
  assert.equal(filas[1].reciboReal, 215564.62)
  const t = totalesDeRetribucion(filas)
  assert.equal(t.sinNeto, 1)
  assert.equal(t.pagado, 200000)
})

test('el historial del blanco ordena por período real y dice la variación', () => {
  const h = historialDelBlanco([
    { periodo: 'Q2-09/2026', categoria: 'Oficial', valorHora: 6600 },
    { periodo: 'Q1-09/2026', categoria: 'Oficial', valorHora: 6600 },
    { periodo: 'Q2-08/2026', categoria: 'Oficial', valorHora: 6000 },
    { periodo: 'Q2-08/2026', categoria: 'Oficial', valorHora: 5000 },
    { periodo: 'Q1-08/2026', categoria: 'Medio oficial', valorHora: 5000 },
    { periodo: 'Q2-07/2026', categoria: null, valorHora: null },
    { periodo: 'basura', categoria: null, valorHora: 1 },
  ])
  assert.deepEqual(h.map((f) => f.periodo), ['Q2-09/2026', 'Q1-09/2026', 'Q2-08/2026', 'Q1-08/2026'])
  // El mismo $/h dos quincenas seguidas no es una variación: no se escribe «+0,0 %».
  assert.equal(h[0].variacion, null)
  assert.equal(h[1].valorHora, '$6.600')
  assert.equal(h[1].variacion, '+10,0 % vs 6.000')
  assert.equal(h[2].variacion, '+20,0 % vs 5.000')
  assert.equal(h[3].variacion, null)
  assert.equal(h[3].categoria, 'Medio oficial')
})

// ═══ LOS MENSUALES POR MES EN TODO 2026 (dueño, 17/09/2026: «cobran mensual» · «la solapa no lo muestra antes de septiembre») ═══
//
// Lo que la Liquidación publica de un jefe de Oficina: `modalidad` mensual, `negro` null (fuera del modelo blanco + negro),
// así que `pago.total` es null y la fila decía «sin total» todo el año. Antes de septiembre no hay neto mensual:
// JORNALES los anotaba por hora y el COBRA de cada quincena es el importe de la planilla.
const jefe = (o: { cobra: number | null; neto?: number | null; pagadoBanco?: number; pagadoEfectivo?: number; horas?: number }): LineaRetribuida => ({
  modalidad: 'mensual', horas: o.horas ?? 90, valorHora: null, netoMensual: o.neto ?? null, cobra: o.cobra,
  sinTarifa: false, sinNeto: false, sueldo: null,
  pago: pagoDeLaLinea({ banco: 0, negro: null, pagadoBanco: o.pagadoBanco, pagadoEfectivo: o.pagadoEfectivo }),
})

test('mensual sin neto (JORNALES por hora): lo liquidado del mes es la suma de sus quincenas y lo pagado también', () => {
  // Maldonado, julio 2026: 796.400 + 1.007.000; banco 1.365.000 (los dos recibos) + efectivo 438.400.
  const filas = filasDeRetribucion([
    { quincena: q('2026-07-01'), estado: 'cerrada', linea: jefe({ cobra: 796400, pagadoEfectivo: 438400, horas: 88 }) },
    { quincena: q('2026-07-16'), estado: 'cerrada', linea: jefe({ cobra: 1007000, pagadoBanco: 1365000, horas: 106 }) },
  ])
  assert.equal(filas.length, 1)
  assert.equal(filas[0].periodo, 'Julio')
  assert.equal(filas[0].mensual, true)
  assert.equal(filas[0].horas, 194)
  assert.equal(filas[0].pago?.total, 1803400)
  assert.equal(filas[0].pago?.pagado, 1803400)
  assert.equal(filas[0].pago?.pagadoBanco, 1365000)
  assert.equal(filas[0].pago?.saldoTotal, 0)
  assert.equal(filas[0].sinImporte, 0)
  const t = totalesDeRetribucion(filas)
  assert.equal(t.total, 1803400)
  assert.equal(t.saldo, 0)
  assert.equal(t.sinSaldo, 0)
})

test('mensual con neto: el neto una vez por mes aunque las líneas reales no traigan negro', () => {
  const filas = filasDeRetribucion([
    { quincena: q('2026-09-01'), estado: 'abierta', linea: jefe({ cobra: 1800000, neto: 1800000, pagadoBanco: 663000 }) },
    { quincena: q('2026-09-16'), estado: 'abierta', linea: jefe({ cobra: 1800000, neto: 1800000 }) },
  ])
  assert.equal(filas[0].pago?.total, 1800000)
  assert.equal(filas[0].pago?.saldoTotal, 1137000)
})

test('mensual con una quincena sin importe: se suma lo que hay y la fila dice cuántas faltan; sin ninguna, sin total', () => {
  const agosto = filasDeRetribucion([
    { quincena: q('2026-08-01'), estado: 'cerrada', linea: jefe({ cobra: 398200, pagadoEfectivo: 398200 }) },
    { quincena: q('2026-08-16'), estado: 'abierta', linea: jefe({ cobra: null }) },
  ])
  assert.equal(agosto[0].pago?.total, 398200)
  assert.equal(agosto[0].sinImporte, 1)
  assert.equal(totalesDeRetribucion(agosto).sinImporte, 1)
  const vacio = filasDeRetribucion([{ quincena: q('2026-08-16'), estado: 'abierta', linea: jefe({ cobra: null, pagadoBanco: 5 }) }])
  assert.equal(vacio[0].pago?.total, null)
  assert.equal(totalesDeRetribucion(vacio).pagado, 5)
})
