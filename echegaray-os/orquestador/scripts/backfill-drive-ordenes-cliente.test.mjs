import test from 'node:test'
import assert from 'node:assert/strict'
import { driveDeNotas } from './backfill-drive-ordenes-cliente.mjs'

// LAS NOTAS SON LITERALES DE `cliente_orden` el 10/09/2026. Con ejemplos inventados el test sólo
// prueba que la expresión regular funciona contra sí misma.
const ARCOR = 'Drive: CAMBIO DE CIELORRASO EN VESTUARIAS / OC 53031294 - 16-08-2024.pdf (id 1wpt1Z6-ZObUE1iQanlojyGaxk5BOkQ2s) — archivada por el OS 10/09/2026'
const MESSINA = 'PDF hallado en Drive el 10/09/2026: MESSINA/BASES DE TANQUE/PRESUPUESTO - OC/ADICIONAL - OC_32_0000200001923.pdf (id 13r6G3k95PZvk9Sah08BO-pA71GcYwthM) · TK 120 Tn · cta cte 30 días'

test('el id del archivo se lee de las dos plantillas de nota que existen', () => {
  assert.equal(driveDeNotas(ARCOR).fileId, '1wpt1Z6-ZObUE1iQanlojyGaxk5BOkQ2s')
  assert.equal(driveDeNotas(MESSINA).fileId, '13r6G3k95PZvk9Sah08BO-pA71GcYwthM')
})

test('el NOMBRE de la carpeta sale sólo de la nota que lo declara', () => {
  assert.equal(driveDeNotas(ARCOR).carpeta, 'CAMBIO DE CIELORRASO EN VESTUARIAS')
  // La de Messina escribe una RUTA de Drive, no la carpeta destino: leerla como nombre de carpeta
  // mandaría a buscar «MESSINA/BASES DE TANQUE/PRESUPUESTO - OC» adentro de la carpeta del cliente.
  assert.equal(driveDeNotas(MESSINA).carpeta, null)
})

test('una nota sin vínculo a Drive no inventa uno', () => {
  // La nota de una orden CITADA en Cobranzas: existe la orden, no existe el papel.
  assert.deepEqual(driveDeNotas('Cobranzas!F41 — factura A 165, sin PDF en ninguna casilla'), { fileId: null, carpeta: null })
  assert.deepEqual(driveDeNotas(null), { fileId: null, carpeta: null })
  // Un id demasiado corto no es un id de Drive.
  assert.equal(driveDeNotas('Drive: COCHERAS / OC.pdf (id 1abc)').fileId, null)
})
