// EL RENGLÓN DE LA CARGA TARDÍA EN LA PESTAÑA — que exista, que no se sume, y que no se borre sola.
//
// Los tres defectos que atrapa:
//   · que el número viva sólo en el log (este archivo ya tiene escrito que el log no lo abre nadie);
//   · que el importe caiga adentro del rango que suma el NETO, y termine restándose del cajón dos
//     veces o sumándose a lo que mide — un control que se suma a lo que mide no es un control;
//   · que cada regeneración lo borre, dejando un control intermitente que se lee como un cero.

import test from 'node:test'
import assert from 'node:assert/strict'
import { CARGA_TARDIA, grillaAnexo, claveDeRotulo } from './caja-anexo.mjs'
import { rescatarAnexo } from '../scripts/caja-anexo-pestana.mjs'

const filaDe = (g, rotulo) => g.filas.findIndex((f) => claveDeRotulo(f[0]) === claveDeRotulo(rotulo)) + 1

test('el renglón existe y está DEBAJO del sello: no entra al rango que suma el neto', () => {
  const g = grillaAnexo({})
  const f = filaDe(g, CARGA_TARDIA.rotulo)
  assert.ok(f > 0, 'el renglón tiene que estar en la pestaña, no sólo en el log')
  assert.equal(f, g.fCargaTardia)
  const [f0] = g.filasHistorico
  assert.ok(f > g.fSello, `va debajo del sello (${f} > ${g.fSello}): el neto suma C${f0}:C${g.fSello}`)
})

test('el importe va en la columna E, nunca en la C — la C es la que se suma', () => {
  const g = grillaAnexo({ cargado: new Map([[claveDeRotulo(CARGA_TARDIA.rotulo), { importe: 500000, medidoEn: 46250.7 }]]) })
  const fila = g.filas[g.fCargaTardia - 1]
  assert.equal(fila[4], 500000, 'E: el importe')
  assert.equal(fila[5], 46250.7, 'F: el instante en que se midió — sin él, una medición vieja se lee como de ahora')
  assert.notEqual(fila[2], 500000, 'la columna C es la que entra al neto: acá no va plata')
})

test('SE RESCATA POR RÓTULO: sin esto, cada regeneración borra la medición', () => {
  const leido = [[{ valor: CARGA_TARDIA.rotulo }, { valor: 'ARS' }, {}, {}, { numero: 812345 }, { numero: 46250.5 }, {}]]
  const c = rescatarAnexo(leido)
  assert.deepEqual(c.get(claveDeRotulo(CARGA_TARDIA.rotulo)), { importe: 812345, medidoEn: 46250.5 })
  // Y la grilla lo devuelve a su fila, esté donde esté ahora.
  const g = grillaAnexo({ cargado: c })
  assert.equal(g.filas[g.fCargaTardia - 1][4], 812345)
})

test('sin medición previa el renglón sale VACÍO, no en cero', () => {
  // Un cero acá afirma "medí y no hay nada". Vacío dice la verdad: todavía no se midió.
  const g = grillaAnexo({})
  const fila = g.filas[g.fCargaTardia - 1]
  assert.notEqual(fila[4], 0)
  assert.notEqual(fila[5], 0)
})

test('el rótulo explica que NO se resta solo: es una medición, no un ajuste', () => {
  assert.match(CARGA_TARDIA.origen, /NO se resta solo/)
  assert.match(CARGA_TARDIA.origen, /corrección de un importe histórico/)
})
