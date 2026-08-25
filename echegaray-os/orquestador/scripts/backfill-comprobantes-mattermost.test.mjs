// Lo que el backfill decide ANTES de tocar la red: qué archivo entra y dónde queda guardado.
import test from 'node:test'
import assert from 'node:assert/strict'
import { MAX_BYTES, admisible, rutaDe } from './backfill-comprobantes-mattermost.mjs'

test('la ruta agrupa por post: las cinco fotos de un fajo quedan juntas', () => {
  assert.equal(rutaDe('p1', 'f1', 'IMG_7572.HEIC'), 'historico/p1/f1.heic')
  assert.equal(rutaDe('p1', 'f2', 'factura.PDF'), 'historico/p1/f2.pdf')
})

test('un nombre sin extensión no produce una ruta rota', () => {
  assert.equal(rutaDe('p1', 'f1', 'factura'), 'historico/p1/f1.factura')
  assert.equal(rutaDe('p1', 'f1', ''), 'historico/p1/f1.bin')
  assert.equal(rutaDe('p1', 'f1', null), 'historico/p1/f1.bin')
})

test('la extensión se limpia: un nombre raro no puede inyectar tramos en la ruta', () => {
  // `../` en la extensión escribiría fuera de `historico/`.
  assert.equal(rutaDe('p1', 'f1', 'x.jp g/../../otro'), 'historico/p1/f1.otro')
  assert.ok(!rutaDe('p1', 'f1', 'x.a/b').includes('/b'))
})

test('el HEIC del iPhone ENTRA — es el formato por defecto de esa cámara', () => {
  assert.equal(admisible({ media_type: 'image/heic', bytes: 3_000_000 }).ok, true)
  assert.equal(admisible({ media_type: 'image/jpeg', bytes: 900_000 }).ok, true)
  assert.equal(admisible({ media_type: 'application/pdf', bytes: 200_000 }).ok, true)
})

test('un CSV o un ZIP NO son comprobantes mirables: se declaran, no se suben', () => {
  // Los dos existen en el canal. Subirlos ocuparía espacio para nada y el bucket los rechaza.
  const csv = admisible({ media_type: 'text/csv', bytes: 1000 })
  assert.equal(csv.ok, false)
  assert.match(csv.motivo, /text\/csv/)
  assert.equal(admisible({ media_type: 'application/zip', bytes: 1000 }).ok, false)
})

test('un archivo más pesado que el techo del bucket se declara con su tamaño, no se trunca', () => {
  const r = admisible({ media_type: 'image/heic', bytes: MAX_BYTES + 1 })
  assert.equal(r.ok, false)
  assert.match(r.motivo, /5\.0 MB/)
})

test('un archivo de tamaño cero no es un respaldo', () => {
  assert.equal(admisible({ media_type: 'image/jpeg', bytes: 0 }).ok, false)
})

test('un tipo vacío se nombra como desconocido, no pasa por defecto', () => {
  const r = admisible({ media_type: '', bytes: 1000 })
  assert.equal(r.ok, false)
  assert.match(r.motivo, /desconocido/)
})
