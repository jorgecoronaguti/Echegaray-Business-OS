import { test } from 'node:test'
import assert from 'node:assert/strict'
import { controlarFoto, esRutaDeFoto, MAX_BYTES_FOTO, rutaDeFoto, traducirErrorDeFoto, urlPublicaDeFoto } from './foto.ts'

const ID = '4f1c2a9e-7b3d-4c1e-9a2b-1f0e8d7c6b5a'

test('una foto de celular de 4,4 MB entra: es justo la que la Server Action rechazaba', () => {
  const r = controlarFoto({ name: 'IMG_0412.jpg', type: 'image/jpeg', size: 4.4 * 1024 * 1024 })
  assert.deepEqual(r, { ok: true, mediaType: 'image/jpeg', extension: 'jpg' })
})

test('el tipo sale del type y, si el navegador no lo trae, de la extensión', () => {
  assert.equal(controlarFoto({ name: 'foto.PNG', type: '', size: 10 }).ok, true)
  assert.equal(controlarFoto({ name: 'foto.webp', type: 'application/octet-stream', size: 10 }).ok, true)
  const sin = controlarFoto({ name: 'foto', type: '', size: 10 })
  assert.equal(sin.ok, false)
  assert.match(!sin.ok ? sin.error : '', /imagen/)
})

test('HEIC se rechaza con instrucción, porque la ficha no lo puede mostrar', () => {
  const r = controlarFoto({ name: 'IMG_0001.HEIC', type: '', size: 10 })
  assert.equal(r.ok, false)
  assert.match(!r.ok ? r.error : '', /HEIC/)
  assert.equal(controlarFoto({ name: 'x.jpg', type: 'image/heic', size: 10 }).ok, false)
})

test('ni un PDF, ni un archivo vacío, ni uno de más de 12 MB', () => {
  assert.equal(controlarFoto({ name: 'factura.pdf', type: 'application/pdf', size: 10 }).ok, false)
  assert.equal(controlarFoto({ name: 'x.jpg', type: 'image/jpeg', size: 0 }).ok, false)
  const grande = controlarFoto({ name: 'x.jpg', type: 'image/jpeg', size: MAX_BYTES_FOTO + 1 })
  assert.equal(grande.ok, false)
  assert.match(!grande.ok ? grande.error : '', /12 MB/)
})

test('la ruta es activos/<carpeta>/<uuid>.<ext>, y la carpeta se limpia', () => {
  assert.equal(rutaDeFoto({ carpeta: ID, id: ID, extension: 'jpg' }), `activos/${ID}/${ID}.jpg`)
  assert.equal(rutaDeFoto({ carpeta: `incidencias/${ID}`, id: ID, extension: 'png' }), `activos/incidencias_${ID}/${ID}.png`)
  assert.equal(rutaDeFoto({ carpeta: '', id: ID, extension: 'jpg' }), `activos/alta/${ID}.jpg`)
  assert.throws(() => rutaDeFoto({ carpeta: 'alta', id: 'IMG_0001', extension: 'jpg' }), /id válido/)
})

test('el servidor reconoce la forma de la ruta y nada más', () => {
  assert.equal(esRutaDeFoto(`activos/alta/${ID}.jpg`), true)
  assert.equal(esRutaDeFoto(`activos/incidencias_${ID}/${ID}.webp`), true)
  assert.equal(esRutaDeFoto(`activos/../otra/${ID}.jpg`), false)
  assert.equal(esRutaDeFoto(`comprobantes/${ID}/${ID}.jpg`), false)
  assert.equal(esRutaDeFoto(`activos/alta/${ID}.pdf`), false)
  assert.equal(esRutaDeFoto(`https://x.supabase.co/storage/v1/object/public/herramientas/activos/alta/${ID}.jpg`), false)
  assert.equal(esRutaDeFoto(null), false)
})

test('la URL pública apunta al bucket herramientas', () => {
  assert.equal(
    urlPublicaDeFoto('https://abc.supabase.co/', `activos/alta/${ID}.jpg`),
    `https://abc.supabase.co/storage/v1/object/public/herramientas/activos/alta/${ID}.jpg`,
  )
})

test('los errores de Storage se dicen en castellano, y el que no se reconoce va tal cual', () => {
  assert.match(traducirErrorDeFoto('new row violates row-level security policy'), /entrar con tu usuario/)
  assert.match(traducirErrorDeFoto('Body exceeded 1 MB limit'), /12 MB/)
  assert.match(traducirErrorDeFoto('Bucket not found'), /depósito/)
  assert.match(traducirErrorDeFoto('Failed to fetch'), /conexión/)
  assert.equal(traducirErrorDeFoto('algo raro'), 'algo raro')
})
