// EL BISTURÍ QUE ESCRIBE LA OBRA EN COMPRAS: que no toque la fila equivocada, y que no borre.
//
// Lo que se prueba acá no es que sepa escribir: es que se NIEGUE a escribir cuando la fila no está
// identificada sin ambigüedad. Imputar $2.300.000 a la obra equivocada no deja rastro — el total
// cierra igual, el residuo cierra igual, y el error queda adentro de una obra para siempre.

import test from 'node:test'
import assert from 'node:assert/strict'
import { planDeImputacion, IMPUTACIONES_CONFIRMADAS, COL, iso } from './compras-imputar-obra.mjs'

/** Una fila de Compras con las cinco columnas que el bisturí mira. */
const fila = ({ fecha, proveedor, cliente, obra, neto }) => {
  const f = new Array(25).fill('')
  f[COL.fecha] = fecha; f[COL.proveedor] = proveedor; f[COL.cliente] = cliente
  f[COL.obra] = obra; f[COL.neto] = neto
  return f
}
/** 12/08/2026 en serial de Sheets. */
const serial = (d) => Math.round(new Date(`${d}T00:00:00Z`).getTime() / 86400000) + 25569

const TRIELEC = { fecha: serial('2026-08-12'), proveedor: 'Trielec', cliente: 'San Francisco', neto: 1_831_905.12 }
const objetivo = [{ cliente: 'San Francisco', fecha: '2026-08-12', proveedor: 'Trielec', neto: 1_831_905.12, obra: 'Pisos Industriales' }]

test('el serial de Sheets se lee como la fecha que es', () => {
  assert.equal(iso(serial('2026-08-12')), '2026-08-12')
})

test('antepone la obra y CONSERVA lo que había escrito una persona', () => {
  const filas = [fila({ ...TRIELEC, obra: 'Proyector Led · Pagada 12/08 con Electron · sello' })]
  const { aEscribir } = planDeImputacion(filas, 4, objetivo)
  assert.equal(aEscribir.length, 1)
  assert.equal(aEscribir[0].fila, 4)
  assert.equal(aEscribir[0].despues, 'Pisos Industriales · Proyector Led · Pagada 12/08 con Electron · sello')
  // LO QUE HABÍA NO SE PIERDE. Es texto de una persona y a veces es el único lugar donde consta.
  assert.ok(aEscribir[0].despues.includes('Pagada 12/08 con Electron · sello'))
})

test('si la K está vacía escribe sólo la obra, sin separador colgando', () => {
  const { aEscribir } = planDeImputacion([fila({ ...TRIELEC, obra: '' })], 4, objetivo)
  assert.equal(aEscribir[0].despues, 'Pisos Industriales')
})

test('es idempotente: si la K ya nombra la obra, no la vuelve a tocar', () => {
  const filas = [fila({ ...TRIELEC, obra: 'Pisos Industriales · Proyector Led' })]
  const { aEscribir, yaEstaban } = planDeImputacion(filas, 4, objetivo)
  assert.equal(aEscribir.length, 0)
  assert.equal(yaEstaban.length, 1)
})

test('DOS filas iguales: no elige una, aborta — imputar la equivocada no deja rastro', () => {
  const filas = [fila({ ...TRIELEC, obra: 'Proyector' }), fila({ ...TRIELEC, obra: 'Proyector' })]
  const { aEscribir, problemas } = planDeImputacion(filas, 4, objetivo)
  assert.equal(aEscribir.length, 0)
  assert.equal(problemas[0].cuantas, 2)
})

test('CERO filas: tampoco inventa una', () => {
  const { aEscribir, problemas } = planDeImputacion([], 4, objetivo)
  assert.equal(aEscribir.length, 0)
  assert.equal(problemas[0].cuantas, 0)
})

test('un peso de diferencia NO es la misma compra', () => {
  // Ya pasó en este repo con dos cheques a un peso de distancia: el 312 y el 313.
  const { problemas } = planDeImputacion([fila({ ...TRIELEC, neto: 1_831_904.12, obra: 'x' })], 4, objetivo)
  assert.equal(problemas[0].cuantas, 0)
})

test('mismo importe y fecha pero OTRO proveedor no empareja', () => {
  const otro = fila({ ...TRIELEC, proveedor: 'Electron', obra: 'x' })
  assert.equal(planDeImputacion([otro], 4, objetivo).problemas[0].cuantas, 0)
})

test('mismo proveedor e importe pero OTRO cliente no empareja', () => {
  const otro = fila({ ...TRIELEC, cliente: 'MESSINA', obra: 'x' })
  assert.equal(planDeImputacion([otro], 4, objetivo).problemas[0].cuantas, 0)
})

test('la fila se ubica por su contenido, no por su posición: Compras crece todos los días', () => {
  const relleno = fila({ fecha: serial('2026-01-02'), proveedor: 'RSV', cliente: 'Taller', obra: '', neto: 1 })
  const filas = [relleno, relleno, relleno, fila({ ...TRIELEC, obra: 'Proyector' }), relleno]
  assert.equal(planDeImputacion(filas, 4, objetivo).aEscribir[0].fila, 7)
})

test('las tres confirmaciones del dueño están completas y son de agosto', () => {
  // Una confirmación a la que le falte un campo emparejaría de más. Y la de los consumibles de San
  // Francisco NO tiene que estar: el dueño contestó "dejar sin imputar".
  assert.equal(IMPUTACIONES_CONFIRMADAS.length, 3)
  for (const c of IMPUTACIONES_CONFIRMADAS) {
    for (const k of ['cliente', 'fecha', 'proveedor', 'neto', 'obra']) {
      assert.ok(c[k], `falta ${k} en ${JSON.stringify(c)}`)
    }
    assert.match(c.fecha, /^2026-08-\d\d$/)
  }
  assert.equal(IMPUTACIONES_CONFIRMADAS.filter((c) => c.obra === 'BSA').length, 2)
})

test('ninguna confirmación toca los consumibles que el dueño mandó dejar sin imputar', () => {
  const prohibidos = ['Combustibles Barcelo', 'Ruviño Matias Esteban', 'Sanitarios OD S.A.S.', 'Corralon Progreso']
  for (const c of IMPUTACIONES_CONFIRMADAS) assert.ok(!prohibidos.includes(c.proveedor), `${c.proveedor} debía quedar sin imputar`)
})
