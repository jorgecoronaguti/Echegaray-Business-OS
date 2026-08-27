// EL BORDE DEL PROVEEDOR: el orden de preferencia, el fallback apagado, y —lo que más importa
// hoy— que el error diga EXACTAMENTE qué falta.
//
// La respuesta 403 que se usa acá es LITERAL: es la que devolvió la API de Vertex el 27/08/2026 con
// el service account real del OS, para los tres modelos de Imagen. Si mañana alguien cambia la
// traducción del error, este test se pone rojo con el cuerpo real que hay que seguir entendiendo.
import test from 'node:test'
import assert from 'node:assert/strict'
import { generarImagen, queHacer } from './cliente.mjs'
import { aspectoVertex, traducirError, vertexImagen } from './proveedores/vertex-imagen.mjs'
import { imagenCompatible, tamañoDe } from './proveedores/compatible.mjs'

// Respuesta REAL de Vertex el 27/08/2026 (proyecto echegaray-business-os, SA del OS).
const CUERPO_403_REAL = JSON.stringify({
  error: {
    code: 403,
    message: 'Agent Platform API has not been used in project echegaray-business-os before or it is disabled. Enable it by visiting https://console.developers.google.com/apis/api/aiplatform.googleapis.com/overview?project=echegaray-business-os then retry.',
    status: 'PERMISSION_DENIED',
    details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'SERVICE_DISABLED', domain: 'googleapis.com' }],
  },
})

test('el 403 real de Vertex se traduce a la acción que lo destraba, con el proyecto adentro', () => {
  const t = traducirError(403, CUERPO_403_REAL)
  assert.equal(t.falta, 'habilitar_api')
  assert.match(t.mensaje, /echegaray-business-os/)
  assert.match(t.mensaje, /aiplatform\.googleapis\.com/)
  assert.match(t.mensaje, /No falta ninguna credencial/)
  assert.match(t.mensaje, /facturaci[óo]n/)
})

test('403 sin SERVICE_DISABLED es OTRA cosa: falta el rol, no habilitar la API', () => {
  const t = traducirError(403, JSON.stringify({ error: { message: 'Permission aiplatform.endpoints.predict denied' } }))
  assert.equal(t.falta, 'permiso_vertex')
  assert.match(t.mensaje, /roles\/aiplatform\.user/)
})

test('el adapter de Vertex propaga `falta` y `status` en el error, no un mensaje suelto', async () => {
  const fetchImpl = async () => ({ ok: false, status: 403, text: async () => CUERPO_403_REAL })
  await assert.rejects(
    () => vertexImagen.generar({ prompt: 'x', proyecto: 'echegaray-business-os', token: 'tok', fetchImpl }),
    (e) => e.falta === 'habilitar_api' && e.status === 403,
  )
})

test('un 200 con predictions vacío (filtro de contenido) NO se toma como éxito', async () => {
  const fetchImpl = async () => ({ ok: true, status: 200, json: async () => ({ predictions: [] }) })
  await assert.rejects(
    () => vertexImagen.generar({ prompt: 'x', proyecto: 'p', token: 't', fetchImpl }),
    (e) => e.falta === 'contenido_bloqueado',
  )
})

test('el aspecto se traduce a lo que cada dialecto entiende', () => {
  assert.equal(aspectoVertex('16:9'), '16:9')
  assert.equal(aspectoVertex('21:9'), '1:1')
  assert.equal(tamañoDe('16:9'), '1792x1024')
  assert.equal(tamañoDe('vertical'), '1024x1024')
})

test('el fallback está LISTO y APAGADO: sin sus dos variables no se intenta', () => {
  assert.equal(imagenCompatible.configurado(), false)
})

test('el motivo que sale es el del PRINCIPAL, no el «sin credencial» del fallback apagado', async () => {
  const principal = {
    nombre: 'vertex-imagen',
    configurado: () => true,
    async generar() { const e = new Error('Vertex AI no está habilitado en el proyecto «echegaray-business-os».'); e.falta = 'habilitar_api'; e.status = 403; throw e },
  }
  const apagado = { nombre: 'imagenes-compatible', configurado: () => false, async generar() { throw new Error('no debería llamarse') } }
  const r = await generarImagen({ prompt: 'x', proveedores: [principal, apagado], obtenerToken: async () => 'tok' })

  assert.equal(r.ok, false)
  assert.equal(r.falta, 'habilitar_api')
  assert.match(r.motivo, /no está habilitado/)
  assert.match(r.que_hacer, /Lo hace el dueño en la consola/)
  assert.equal(r.intentos.length, 2)
  assert.equal(r.intentos[1].proveedor, 'imagenes-compatible')
})

test('cuando el principal cae y el fallback puede, contesta el fallback y queda anotado quién falló', async () => {
  const principal = { nombre: 'vertex-imagen', configurado: () => true, async generar() { const e = new Error('caído'); e.status = 503; throw e } }
  const segundo = {
    nombre: 'imagenes-compatible', configurado: () => true,
    async generar() { return { imagenes: [{ base64: 'QUJD', mime: 'image/png' }], modelo: 'm', proveedor: 'imagenes-compatible' } },
  }
  const r = await generarImagen({ prompt: 'x', proveedores: [principal, segundo], obtenerToken: async () => 'tok' })
  assert.equal(r.ok, true)
  assert.equal(r.proveedor, 'imagenes-compatible')
  assert.equal(r.fallbackDe, 'vertex-imagen')
})

test('queHacer nombra una acción concreta para cada falta que el OS sabe distinguir', () => {
  for (const falta of ['habilitar_api', 'permiso_vertex', 'credencial', 'proyecto', 'modelo', 'contenido_bloqueado', 'sin_proveedor']) {
    assert.ok(queHacer(falta).length > 30, falta)
  }
})
