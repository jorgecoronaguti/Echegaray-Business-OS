// La identidad de un archivo. Hermético: sólo funciones puras.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { referenciaDe, comparar, resumen, tipoLegible, enlaceDe, CAMPOS, PROP_IDEMPOTENCIA, MIME_CARPETA } from './referencia.mjs'

// Payload tal como lo devuelve Drive v3 con el juego de campos de CAMPOS.
const SUBIDO = {
  id: '1abc', name: 'Factura 0001-00012345.pdf', mimeType: 'application/pdf', size: '84213',
  webViewLink: 'https://drive.google.com/file/d/1abc/view', parents: ['1carpeta'], trashed: false,
  modifiedTime: '2026-08-30T12:00:00.000Z', createdTime: '2026-08-30T11:59:00.000Z',
  md5Checksum: 'd41d8cd98f00b204e9800998ecf8427e', version: '7', headRevisionId: '0Bxyz',
  properties: { [PROP_IDEMPOTENCIA]: 'k-123' }, owners: [{ emailAddress: 'jorge@ecsas.com.ar' }],
}

test('CAMPOS pide lo que hace falta para IDENTIFICAR, no sólo para mostrar', () => {
  for (const c of ['parents', 'trashed', 'modifiedTime', 'md5Checksum', 'version']) {
    assert.ok(CAMPOS.includes(c), `CAMPOS no pide ${c}`)
  }
})

test('un archivo subido trae hash, revisión, padre y clave de idempotencia', () => {
  const r = referenciaDe(SUBIDO)
  assert.equal(r.provider, 'google-drive')
  assert.equal(r.file_id, '1abc')
  assert.deepEqual(r.parents, ['1carpeta'])
  assert.equal(r.folder_id, '1carpeta')
  assert.equal(r.size_bytes, 84213)          // Drive lo manda como string
  assert.equal(r.hash, 'd41d8cd98f00b204e9800998ecf8427e')
  assert.equal(r.revision_id, '0Bxyz')
  assert.equal(r.idempotency_key, 'k-123')
  assert.equal(r.trashed, false)
  assert.equal(r.tipo, 'pdf')
})

test('un nativo de Google NO tiene hash, y decir que sí sería inventarlo', () => {
  const r = referenciaDe({ id: '2x', name: 'Cash Flow', mimeType: 'application/vnd.google-apps.spreadsheet', version: '412', parents: ['p'] })
  assert.equal(r.hash, null)
  assert.equal(r.revision_id, '412')  // el contador que sí se mueve
  assert.equal(r.tipo, 'planilla')
})

test('la papelera se refleja, no se esconde', () => {
  assert.equal(referenciaDe({ ...SUBIDO, trashed: true }).trashed, true)
  // Drive puede omitir el campo si no se pidió: eso NO es "no está en la papelera" declarado,
  // pero la referencia no puede quedar undefined — se normaliza a false y CAMPOS lo pide siempre.
  assert.equal(referenciaDe({ id: 'z', name: 'z' }).trashed, false)
})

test('el nombre NO es la identidad: dos archivos con el mismo nombre son distintos', () => {
  const a = referenciaDe({ id: 'A', name: 'F931 08-2026.pdf', mimeType: 'application/pdf' })
  const b = referenciaDe({ id: 'B', name: 'F931 08-2026.pdf', mimeType: 'application/pdf' })
  assert.notEqual(a.file_id, b.file_id)
  assert.equal(a.name, b.name)
})

test('comparar mira SÓLO lo que la operación prometió tocar', () => {
  const antes = referenciaDe(SUBIDO)
  const despues = referenciaDe({ ...SUBIDO, name: 'Otro.pdf', modifiedTime: '2026-08-31T09:00:00.000Z', version: '8' })
  // modified_at y revision_id cambian SIEMPRE: si entraran en la comparación, todo daría distinto.
  assert.deepEqual(Object.keys(comparar(antes, despues, ['name'])), ['name'])
  assert.deepEqual(comparar(antes, despues, ['parents', 'trashed']), {})
})

test('comparar entiende arrays: un move se prueba con parents', () => {
  const a = { parents: ['viejo'] }
  const b = { parents: ['nuevo'] }
  assert.deepEqual(comparar(a, b, ['parents']).parents, { antes: ['viejo'], despues: ['nuevo'] })
  assert.deepEqual(comparar(a, { parents: ['viejo'] }, ['parents']), {})
  assert.ok(comparar(a, { parents: ['viejo', 'otro'] }, ['parents']).parents, 'dos padres no es un padre')
})

test('tipoLegible y el enlace de una carpeta', () => {
  assert.equal(tipoLegible(MIME_CARPETA), 'carpeta')
  assert.equal(tipoLegible('application/vnd.google-apps.presentation'), 'presentacion')
  assert.equal(tipoLegible('image/png'), 'imagen')
  assert.equal(enlaceDe('X', MIME_CARPETA), 'https://drive.google.com/drive/folders/X')
})

test('resumen no se lleva el objeto entero al audit, pero sí la identidad', () => {
  const r = resumen(referenciaDe(SUBIDO))
  assert.deepEqual(Object.keys(r).sort(), ['file_id', 'hash', 'mime_type', 'modified_at', 'name', 'parents', 'revision_id', 'trashed'])
  assert.equal(resumen(null), null)
})

test('sin id no hay referencia: no se inventa una', () => {
  assert.equal(referenciaDe({ name: 'algo' }), null)
  assert.equal(referenciaDe(null), null)
})
