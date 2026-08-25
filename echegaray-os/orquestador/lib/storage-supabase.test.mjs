// EL DEFECTO QUE ESTOS TESTS ATRAPAN
//
// Un bucket privado sin clave de servicio contesta 400/401 con un cuerpo JSON. Si `bajarDeStorage`
// devolviera ese cuerpo como si fuera el archivo, el modelo de visión recibiría un JSON de error
// como si fuera una factura y el comprobante terminaría «ilegible» — un diagnóstico que manda a
// mirar la foto cuando el problema es una variable de entorno que falta en la VM.

import test from 'node:test'
import assert from 'node:assert/strict'
import { accesoAStorage, bajarDeStorage, nombreDeLaClaveDeServicio, urlDeObjeto } from './storage-supabase.mjs'

const OK_ENV = { SUPABASE_URL: 'https://xyz.supabase.co/', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_x' }

test('falta de configuración se NOMBRA, no se disfraza de archivo ilegible', async () => {
  const sinNada = await bajarDeStorage({ bucket: 'comprobantes', path: 'u/1.jpg' }, { env: {} })
  assert.equal(sinNada.ok, false)
  assert.match(sinNada.error, /falta la URL del proyecto/)

  const sinClave = await bajarDeStorage({ bucket: 'comprobantes', path: 'u/1.jpg' },
    { env: { SUPABASE_URL: 'https://xyz.supabase.co' } })
  assert.equal(sinClave.ok, false)
  assert.match(sinClave.error, /clave de servicio/)
})

test('la clave se reconoce con cualquiera de sus nombres, incluido el de la integración de Vercel', () => {
  assert.equal(nombreDeLaClaveDeServicio({ SUPABASE_SECRET_KEY: 'x' }), 'SUPABASE_SECRET_KEY')
  assert.equal(nombreDeLaClaveDeServicio({ SUPABASE_X7K_SERVICE_ROLE_KEY: 'x' }), 'SUPABASE_X7K_SERVICE_ROLE_KEY')
  // Y la ANON no se confunde nunca con la de servicio: usarla dejaría el bucket privado inaccesible
  // y el motivo sería un 400 sin explicación.
  assert.equal(nombreDeLaClaveDeServicio({ NEXT_PUBLIC_SUPABASE_ANON_KEY: 'x', SUPABASE_ANON_KEY: 'x' }), null)
})

test('la URL codifica cada tramo: un nombre con espacios no rompe la ruta', () => {
  assert.equal(
    urlDeObjeto('https://xyz.supabase.co/', 'comprobantes', 'a1b2/foto de la factura #3.jpg'),
    'https://xyz.supabase.co/storage/v1/object/comprobantes/a1b2/foto%20de%20la%20factura%20%233.jpg',
  )
  assert.equal(accesoAStorage(OK_ENV).base, 'https://xyz.supabase.co')
})

test('un 400 de Storage NO se devuelve como archivo', async () => {
  const r = await bajarDeStorage({ bucket: 'comprobantes', path: 'u/1.jpg' }, {
    env: OK_ENV,
    fetchImpl: async () => ({ ok: false, status: 400, arrayBuffer: async () => Buffer.from('{"error":"no"}') }),
  })
  assert.equal(r.ok, false)
  assert.match(r.error, /400/)
})

test('un archivo de cero bytes no es un archivo', async () => {
  const r = await bajarDeStorage({ bucket: 'comprobantes', path: 'u/1.jpg' }, {
    env: OK_ENV,
    fetchImpl: async () => ({ ok: true, headers: { get: () => 'image/jpeg' }, arrayBuffer: async () => new ArrayBuffer(0) }),
  })
  assert.equal(r.ok, false)
  assert.match(r.error, /vac/)
})

test('el tipo declarado al subir le gana al que contesta Storage', async () => {
  const r = await bajarDeStorage(
    { bucket: 'comprobantes', path: 'u/1.heic', nombre: 'IMG_7572.HEIC', mediaType: 'image/heic' },
    {
      env: OK_ENV,
      // Storage devuelve octet-stream para el HEIC del iPhone, igual que Mattermost.
      fetchImpl: async () => ({ ok: true, headers: { get: () => 'application/octet-stream' }, arrayBuffer: async () => Buffer.from([1, 2, 3]) }),
    },
  )
  assert.equal(r.ok, true)
  assert.equal(r.mediaType, 'image/heic')
  assert.equal(r.nombre, 'IMG_7572.HEIC')
  assert.equal(r.data, Buffer.from([1, 2, 3]).toString('base64'))
})

test('la petición lleva la clave en los dos encabezados que Storage exige', async () => {
  let visto = null
  await bajarDeStorage({ bucket: 'comprobantes', path: 'u/1.jpg' }, {
    env: OK_ENV,
    fetchImpl: async (_u, opt) => {
      visto = opt
      return { ok: true, headers: { get: () => 'image/jpeg' }, arrayBuffer: async () => Buffer.from([9]) }
    },
  })
  assert.equal(visto.headers.authorization, 'Bearer sb_secret_x')
  assert.equal(visto.headers.apikey, 'sb_secret_x')
})
