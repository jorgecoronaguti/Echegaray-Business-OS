// MODO SÓLO-ADJUNTOS — cada test revierte un defecto medido en producción (dueño, 02/09/2026).
//
// El defecto: «procesá esto» + «Estructura San Francisco del Monte Entrepiso.pdf» corrió
// `plano.cotizar` y murió con «google download 404». Con el plano en la mano, la corrida salía
// igual al índice de Drive con el rótulo como patrón `%san francisco del monte%`, bajaba los
// archivos que encontraba, y el primer 404 se comía la cotización entera.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fuentesDe } from './pipeline.mjs'
import { textoDe } from './documental.mjs'

const ADJUNTO = { nombre: 'Estructura San Francisco del Monte Entrepiso.pdf', contenido: 'LÁMINA E-01 · columnas 2C240 · H=6.10m' }

/** Drive que EXPLOTA si alguien lo toca: la única forma de probar que no se tocó. */
const driveQueExplota = {
  descargarBytes: async () => { throw new Error('el modo sólo-adjuntos bajó un archivo de Drive') },
  readExcel: async () => { throw new Error('el modo sólo-adjuntos leyó una planilla de Drive') },
}
const indiceQueExplota = async () => { throw new Error('el modo sólo-adjuntos consultó el índice de Drive') }

test('CON ADJUNTOS: no se consulta el índice de Drive ni queda un solo archivo por descargar', async () => {
  const { filas, conIndice } = await fuentesDe({ query: indiceQueExplota }, { termino: 'San Francisco del Monte', adjuntos: [ADJUNTO] })
  assert.equal(conIndice, false, 'con adjuntos, Drive no entra')
  assert.equal(filas.length, 1)
  assert.equal(filas[0].name, ADJUNTO.nombre)
  // La prueba de que NADA va a pedirle bytes a Drive: todo documento de la corrida ya los tiene.
  assert.ok(filas.every((f) => Buffer.isBuffer(f._bytes)), 'todo documento adjunto viaja con sus bytes')
  assert.match(filas[0].drive_file_id, /^adjunto:/)
})

test('CON ADJUNTOS + conDrive: true: recién ahí se suma el índice — es un pedido explícito', async () => {
  const llamadas = []
  const query = async (_sql, args) => { llamadas.push(args?.[0]); return { rows: [{ drive_file_id: 'd1', name: 'Plano viejo.pdf', path: 'x', mime_type: null, is_folder: false }] } }
  const { filas, conIndice } = await fuentesDe({ query }, { termino: 'San Francisco', adjuntos: [ADJUNTO], conDrive: true })
  assert.equal(conIndice, true)
  assert.equal(llamadas.length, 1, 'el índice se consulta UNA vez, con el término')
  assert.equal(filas.length, 2, 'Drive + adjunto conviven sólo cuando se pidió')
})

test('SIN ADJUNTOS: la conducta de siempre — se busca por término en el índice', async () => {
  const query = async () => ({ rows: [{ drive_file_id: 'd1', name: 'Plano.pdf', is_folder: false }] })
  const { filas, conIndice } = await fuentesDe({ query }, { termino: 'Quattropani', adjuntos: [] })
  assert.equal(conIndice, true)
  assert.equal(filas.length, 1)
})

test('conDrive: false SIN adjuntos no inventa documentos: corrida vacía, no una búsqueda a ciegas', async () => {
  // Sin esta rama, `termino` null convertía el patrón en «%%» y el índice devolvía TODO Drive.
  const { filas, conIndice } = await fuentesDe({ query: indiceQueExplota }, { termino: null, adjuntos: [], conDrive: false })
  assert.equal(conIndice, false)
  assert.equal(filas.length, 0)
})

test('UN readExcel QUE FALLA NO TUMBA LA LECTURA: declara el motivo y la corrida sigue', async () => {
  // El .xls viejo no lo abre el lector con celdas y el segundo intento sale a Drive. Un adjunto
  // en memoria («adjunto:<hash>») ahí da 404 seguro: antes esa excepción subía sin decir cuál de
  // los dos lectores falló.
  const doc = { name: 'COMPUTO viejo.xls', mime_type: null, drive_file_id: 'adjunto:abc' }
  const r = await textoDe(doc, Buffer.from('no soy un xls de verdad'), { google: driveQueExplota })
  assert.equal(r.ok, false, 'no puede afirmar que leyó lo que no leyó')
  assert.match(String(r.porQue), /Drive tampoco lo pudo convertir/)
  assert.match(String(r.porQue), /sólo-adjuntos leyó una planilla/)
})
