// EL BORDE HTTP DE XSAS. Lo que se prueba acá es que el borde no se puede abrir por accidente y
// que quien llama no puede declarar sus propios permisos.
import test from 'node:test'
import assert from 'node:assert/strict'

import { crearManejadorXsas } from './xsas-http.mjs'
import { atender } from '../lib/xsas-gateway.mjs'

const SECRETO = 'un-secreto-de-prueba-largo'

const pedir = (manejar, cuerpo, { secreto = SECRETO, url = '/xsas', method = 'POST' } = {}) =>
  manejar({ method, url, headers: secreto ? { 'x-xsas-secreto': secreto } : {}, rawBody: JSON.stringify(cuerpo) })

const registroDoble = (corridas) => ({
  mapa: new Map([['os.estado_empresa', {
    capability: 'drive.read',
    schema: { name: 'estado_empresa', input_schema: { type: 'object', properties: {} } },
    async run() { corridas.push('os.estado_empresa'); return { resumen_texto: 'venimos así' } },
  }]]),
  porArchivo: new Map(), fallaron: [],
})

test('SIN SECRETO CONFIGURADO NO ATIENDE — un borde que se abre "para probar" es un borde abierto', async () => {
  const manejar = crearManejadorXsas({ atender, secreto: null })
  const r = await pedir(manejar, { actor: { id: 'u', rol: 'direccion' }, canal: 'app', mensaje: 'hola' })
  assert.equal(r.status, 503)
  assert.match(r.body.error, /fail-closed/)
})

test('un secreto equivocado no entra, y el error no dice en qué se equivocó', async () => {
  const manejar = crearManejadorXsas({ atender, secreto: SECRETO })
  const r = await pedir(manejar, {}, { secreto: 'otro-secreto-de-igual-largo' })
  assert.equal(r.status, 401)
  assert.equal(r.body.error, 'no autorizado')
})

test('EL DEFECTO: quien llama declara permisos de más. Se PISAN con los del rol', async () => {
  const corridas = []
  const manejar = crearManejadorXsas({ atender, secreto: SECRETO, gateway: { registro: registroDoble(corridas), catalogo: [] } })
  const r = await pedir(manejar, {
    actor: { id: 'u-campo', rol: 'campo', permisos: ['drive.read', 'drive.write', 'os.admin'] },
    canal: 'app', intencion: 'os.estado_empresa',
  })
  assert.equal(r.status, 403)
  assert.equal(r.body.error.tipo, 'sin_permiso')
  assert.deepEqual(corridas, [], 'la tool no corrió pese a los permisos declarados en el cuerpo')
})

test('(A) app.ecsas → XSAS → tool → respuesta SIN LLM, por el borde HTTP real', async () => {
  const corridas = []
  const manejar = crearManejadorXsas({ atender, secreto: SECRETO, gateway: { registro: registroDoble(corridas), catalogo: [] } })
  const r = await pedir(manejar, {
    actor: { id: 'u-jorge', rol: 'direccion' }, canal: 'app', origen: '/dashboard',
    intencion: 'os.estado_empresa',
  })
  assert.equal(r.status, 200)
  assert.equal(r.body.ok, true)
  assert.equal(r.body.llm, null, 'una intención por su nombre no puede pagar un modelo')
  assert.equal(r.body.respuesta, 'venimos así')
  assert.deepEqual(corridas, ['os.estado_empresa'])
  assert.ok(r.body.correlationId, 'toda respuesta trae su hilo de seguimiento')
})

test('el código HTTP sigue al estado: pedido mal armado es 400, no 500', async () => {
  const manejar = crearManejadorXsas({ atender, secreto: SECRETO, gateway: { registro: registroDoble([]), catalogo: [] } })
  const r = await pedir(manejar, { canal: 'app', mensaje: 'hola' }) // sin actor
  assert.equal(r.status, 400)
  assert.equal(r.body.error.tipo, 'pedido_invalido')
})

test('otra ruta y otro método no se atienden', async () => {
  const manejar = crearManejadorXsas({ atender, secreto: SECRETO })
  assert.equal((await pedir(manejar, {}, { url: '/otra' })).status, 404)
  assert.equal((await pedir(manejar, {}, { method: 'GET' })).status, 405)
})
