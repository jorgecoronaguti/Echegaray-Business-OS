// EL DETALLE DE «PAGADO EN EFECTIVO» DICE QUÉ SE ANOTÓ, QUÉ DÍA, QUIÉN Y SI HAY NOTA (dueño, 02/10/2026).
//
// Defectos que estas pruebas atrapan:
//
//   1. UNA SUMA ES VARIOS PAGOS. «=51000+60000+51000+75000» es cuatro entregas; mostrar «$237.000 · =51000+…» obliga a
//      hacer la cuenta de cabeza y no dice cuántas veces se pagó.
//   2. FABRICAR PASADO. Lo anotado antes del 30/09 no tiene autor ni día: se dice en castellano, nunca un nombre o una
//      fecha inventados.
//   3. UNA CORRECCIÓN NO ES UN PAGO NUEVO: «corrigió de $X a $Y», sin sumar de más.
//   4. SIN LA TABLA DE PAGOS (migración sin aplicar) el detalle funciona y no afirma una fecha de pago que no tiene.
//   5. JERGA: ni «log», ni «registro», ni ids, ni nombres de tabla en lo que se lee.

import test from 'node:test'
import assert from 'node:assert/strict'
import type { CambioCrudo } from './historialDeManuales.ts'
import {
  detalleDePagoEnEfectivo, sumandosDe, renglonesDePagoEnEfectivo, type PagoEfectivoCrudo,
} from './detalleDePagoEnEfectivo.ts'

const P = '11111111-1111-1111-1111-111111111111'

const fila = (o: Partial<CambioCrudo> & { id: number }): CambioCrudo => ({
  liquidacion_id: 'L1', grupo: 'obreros', persona_id: P, columna: 'pagado_efectivo', tipo: 'cambio',
  antes: null, despues: null, formula_antes: null, formula_despues: null, autor: null,
  en: '2026-10-01T14:32:00-03:00', ...o,
})
const nombres = new Map([['u1', 'Ana Pérez'], ['u2', 'Beto Ruiz']])

test('sumandosDe parte «=a+b+c» en pagos y NO inventa partes cuando la cuenta no cierra con el importe', () => {
  assert.deepEqual(sumandosDe('=51000+60000+51000+75000', 237000), [51000, 60000, 51000, 75000])
  assert.deepEqual(sumandosDe('=340909,09+197272,73', 538181.82), [340909.09, 197272.73])
  assert.deepEqual(sumandosDe(null, 237000), [237000])
  assert.deepEqual(sumandosDe('=237000', 237000), [237000])
  // la cuenta guardada quedó vieja respecto del importe: no se afirma el desglose
  assert.deepEqual(sumandosDe('=100+50', 999), [999])
  // multiplicar o paréntesis no son «pagos»
  assert.deepEqual(sumandosDe('=9*105', 945), [945])
})

test('el caso de la captura: $237.000 anterior al 30/09 son cuatro pagos, sin autor ni día, y se dice', () => {
  const r = renglonesDePagoEnEfectivo({
    cambios: [fila({ id: 1, tipo: 'base', despues: 237000, formula_despues: '=51000+60000+51000+75000' })],
    pagos: null, nombres, cruce: null,
  })
  assert.deepEqual(r.renglones.map((x) => x.importe), ['$51.000', '$60.000', '$51.000', '$75.000'])
  for (const x of r.renglones) {
    assert.equal(x.cuando, 'Antes del 30/09/2026')
    assert.equal(x.quien, 'no quedó registrado quién ni qué día')
    assert.equal(x.nota, 'Sin nota')
    assert.equal(x.fechaDelPago, null)
  }
  assert.equal(r.cuenta, '51000+60000+51000+75000')
  const d = detalleDePagoEnEfectivo({
    persona: 'Ana Pérez', quincena: '2ª quincena de septiembre · 16 al 30', valor: 237000, cuentaActual: '=51000+60000+51000+75000', anotaciones: r,
  })
  assert.equal(d.titulo, 'Pagado en efectivo — Ana Pérez, 2ª quincena de septiembre · 16 al 30')
  assert.equal(d.total, '$237.000')
  assert.equal(d.cuenta, 'se escribió como 51000+60000+51000+75000')
})

test('una celda editada después del 30/09 dice día, hora y nombre; lo viejo queda debajo con su leyenda', () => {
  const r = renglonesDePagoEnEfectivo({
    cambios: [
      fila({ id: 2, antes: 237000, despues: 262000, formula_antes: '=51000+60000+51000+75000',
        formula_despues: '=51000+60000+51000+75000+25000', autor: 'u1', en: '2026-10-01T14:32:00-03:00', origen: 'celda' }),
      fila({ id: 1, tipo: 'base', despues: 237000, formula_despues: '=51000+60000+51000+75000' }),
    ],
    pagos: null, nombres, cruce: null,
  })
  assert.deepEqual(r.renglones.map((x) => [x.importe, x.cuando, x.quien]), [
    ['$51.000', 'Antes del 30/09/2026', 'no quedó registrado quién ni qué día'],
    ['$60.000', 'Antes del 30/09/2026', 'no quedó registrado quién ni qué día'],
    ['$51.000', 'Antes del 30/09/2026', 'no quedó registrado quién ni qué día'],
    ['$75.000', 'Antes del 30/09/2026', 'no quedó registrado quién ni qué día'],
    ['$25.000', '01/10/2026, 14:32', 'Ana Pérez'],
  ])
})

test('una corrección se dice «corrigió de $X a $Y» y no cuenta como un pago más', () => {
  const r = renglonesDePagoEnEfectivo({
    cambios: [
      fila({ id: 1, antes: null, despues: 100000, autor: 'u1', en: '2026-10-01T10:00:00-03:00' }),
      fila({ id: 2, antes: 100000, despues: 90000, autor: 'u2', en: '2026-10-01T11:00:00-03:00' }),
    ],
    pagos: null, nombres, cruce: null,
  })
  assert.deepEqual(r.renglones.map((x) => [x.tipo, x.importe, x.quien]), [
    ['pago', '$100.000', 'Ana Pérez'],
    ['correccion', '$90.000', 'Beto Ruiz'],
  ])
  assert.equal(r.renglones[1].correccion, 'corrigió de $100.000 a $90.000')
})

test('vaciar la celda no es «$0»: se dice que volvió al cálculo', () => {
  const r = renglonesDePagoEnEfectivo({
    cambios: [fila({ id: 1, antes: 150000, despues: null, autor: 'u1' })], pagos: null, nombres, cruce: null,
  })
  assert.equal(r.renglones[0].tipo, 'baja')
  assert.equal(r.renglones[0].correccion, 'borró lo anotado ($150.000): vuelve al cálculo del sistema')
})

test('con la tabla de pagos: cada anotación trae el día del pago y su nota; sin ella, ni día ni afirmación', () => {
  const cambios = [fila({ id: 1, antes: null, despues: 60000, autor: 'u1', en: '2026-10-02T10:00:00-03:00' })]
  const pago: PagoEfectivoCrudo = {
    liquidacion_id: 'L1', persona_id: P, grupo: 'obreros', fecha: '2026-10-01', importe: 60000, origen: 'caja',
    registrado_por: 'u1', registrado_en: '2026-10-02T10:00:00-03:00', clave: 'x', nota: 'entregado en obra',
  }
  const con = renglonesDePagoEnEfectivo({ cambios, pagos: [pago], nombres, cruce: null }).renglones[0]
  assert.equal(con.fechaDelPago, '01/10/2026')
  assert.equal(con.nota, 'entregado en obra')
  const sin = renglonesDePagoEnEfectivo({ cambios, pagos: null, nombres, cruce: null }).renglones[0]
  assert.equal(sin.fechaDelPago, null)
  assert.equal(sin.nota, 'Sin nota')
})

test('la nota técnica de la siembra no se muestra como nota de nadie', () => {
  const siembra: PagoEfectivoCrudo = {
    liquidacion_id: 'L1', persona_id: P, grupo: 'obreros', fecha: '2026-09-16', importe: 237000, origen: 'caja',
    registrado_por: null, registrado_en: '2026-10-02T12:00:00-03:00', clave: 'siembra:abc', nota: 'siembra 02/10/2026: lo ya registrado…',
  }
  const r = renglonesDePagoEnEfectivo({
    cambios: [fila({ id: 1, tipo: 'base', despues: 237000 })], pagos: [siembra], nombres, cruce: null,
  })
  assert.equal(r.renglones[0].nota, 'Sin nota')
  assert.match(r.renglones[0].fechaDelPago ?? '', /^16\/09\/2026/)
})

test('sin ninguna constancia el detalle igual muestra el importe actual y lo dice, sin jerga', () => {
  const d = detalleDePagoEnEfectivo({
    persona: 'Ana Pérez', quincena: '1ª quincena de octubre · 1 al 15', valor: 40000, cuentaActual: null,
    anotaciones: { renglones: [], cuenta: null },
  })
  assert.equal(d.renglones.length, 1)
  assert.equal(d.renglones[0].importe, '$40.000')
  assert.equal(d.renglones[0].quien, 'no quedó registrado quién ni qué día')
  const todo = JSON.stringify(d)
  assert.doesNotMatch(todo, /\blog\b|registro|liquidacion_|uuid|[0-9a-f]{8}-[0-9a-f]{4}/i)
})
