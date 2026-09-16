import test from 'node:test'
import assert from 'node:assert/strict'
import {
  filaDeEntidadDocumento, leerArgs, md5De, revisarArchivo, revisarPedido, rutaDeObjeto,
} from './legajo-documento-drive.mjs'

const P = '22222222-2222-4222-8222-222222222222'
const U = '11111111-1111-4111-8111-111111111111'
const base = { file: '1abc', persona: P, desde: '2026-09-08', hasta: '2026-09-12', como: 'jorge@ecsas.com.ar' }

test('los argumentos: --clave valor y --flag', () => {
  assert.deepEqual(leerArgs(['--file', '1abc', '--aplicar', '--persona', P]), { file: '1abc', aplicar: true, persona: P })
})

// EL DEFECTO QUE ATRAPA: un certificado sin rango, o un DNI con rango, entrarían a la base y el
// CHECK los rebotaría con un mensaje ilegible después de haber copiado el archivo al bucket.
test('el certificado exige desde/hasta ordenados; las otras categorías no los admiten', () => {
  assert.equal(revisarPedido(base).ok, true)
  const sin = revisarPedido({ ...base, desde: undefined, hasta: undefined })
  assert.equal(sin.ok, false)
  assert.match(sin.errores.join(' '), /--desde y --hasta/)
  const reves = revisarPedido({ ...base, desde: '2026-09-12', hasta: '2026-09-08' })
  assert.match(reves.errores.join(' '), /anterior/)
  const dni = revisarPedido({ ...base, categoria: 'dni' })
  assert.match(dni.errores.join(' '), /sólo un certificado/)
  assert.equal(revisarPedido({ ...base, categoria: 'dni', desde: undefined, hasta: undefined }).ok, true)
  assert.equal(revisarPedido({ ...base, categoria: 'plano', desde: undefined, hasta: undefined }).ok, false, 'plano es de obra')
  assert.match(revisarPedido({ ...base, como: undefined }).errores.join(' '), /--como/)
  assert.match(revisarPedido({ ...base, persona: 'messina' }).errores.join(' '), /--persona/)
})

test('el archivo: tipo conocido, con tamaño y bajo el techo de 25 MB', () => {
  assert.deepEqual(revisarArchivo({ name: 'c.pdf', mimeType: 'application/pdf', size: '1200' }), { ok: true, extension: 'pdf', bytes: 1200 })
  assert.equal(revisarArchivo({ name: 'doc', mimeType: 'application/vnd.google-apps.document' }).ok, false, 'un Doc nativo no tiene bytes')
  assert.equal(revisarArchivo({ name: 'x.pdf', mimeType: 'application/pdf', size: String(26 * 1024 * 1024) }).ok, false)
  assert.equal(revisarArchivo({ name: 'x.html', mimeType: 'text/html', size: '10' }).ok, false)
})

test('la ruta lleva la cerradura de la app y la fila nace copiada apuntando al file id', () => {
  const ruta = rutaDeObjeto({ uid: U, personaId: P, extension: 'pdf', id: '33333333-3333-4333-8333-333333333333' })
  assert.equal(ruta, `${U}/persona/${P}/33333333-3333-4333-8333-333333333333.pdf`)
  assert.throws(() => rutaDeObjeto({ uid: 'x', personaId: P, extension: 'pdf' }))
  const pedido = revisarPedido(base)
  assert.ok(pedido.ok)
  const fila = filaDeEntidadDocumento({
    pedido: pedido.pedido, meta: { name: 'cert.pdf', mimeType: 'application/pdf' },
    archivo: { bytes: 1200 }, uid: U, ruta, md5: md5De(Buffer.from('hola')),
  })
  assert.equal(fila.drive_estado, 'copiado')
  assert.equal(fila.drive_file_id, '1abc')
  assert.equal(fila.licencia_desde, '2026-09-08')
  assert.equal(fila.md5, '4d186321c1a7f0f354b297e8914ab240')
  assert.equal(fila.subido_por, U)
})
