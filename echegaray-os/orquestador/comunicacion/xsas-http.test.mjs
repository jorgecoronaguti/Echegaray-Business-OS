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
  const manejar = crearManejadorXsas({ atender, secreto: SECRETO, servicios: SERVICIOS, gateway: { registro: registroDoble(corridas), catalogo: [] } })
  const r = await pedir(manejar, {
    actor: { id: 'u-campo', rol: 'campo', permisos: ['drive.read', 'drive.write', 'os.admin'] },
    canal: 'app', intencion: 'os.estado_empresa',
  })
  assert.equal(r.status, 403)
  assert.equal(r.body.error.tipo, 'sin_permiso')
  assert.deepEqual(corridas, [], 'la tool no corrió pese a los permisos declarados en el cuerpo')
})

// El rol ya no sale del cuerpo (27/08/2026, auditoría round 3): un emisor sin persona detrás tiene
// rol sólo si el PROCESO lo declara como actor de servicio. Los tests lo inyectan por acá, que es el
// mismo camino por el que en producción lo declara la variable de entorno.
const SERVICIOS = new Map([['u-jorge', 'direccion'], ['u-campo', 'campo']])

test('(A) app.ecsas → XSAS → tool → respuesta SIN LLM, por el borde HTTP real', async () => {
  const corridas = []
  const manejar = crearManejadorXsas({ atender, secreto: SECRETO, servicios: SERVICIOS, gateway: { registro: registroDoble(corridas), catalogo: [] } })
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

// ═══ LA ESCALADA DE ROL, CERRADA (27/08/2026, auditoría round 3) ═══
//
// El auditor la probó viva DOS veces contra la puerta: con `{"actor":{"id":"worker-audit",
// "rol":"direccion"}}` obtuvo `drive.write`, y con el email real de una cuenta `jefe_obra` puesto en
// `id` obtuvo lo mismo y sin siquiera el aviso de rol declarado.
//
// El diagnóstico que importa es suyo: no era «no hay a quién preguntarle», era que quien no quiere
// que le pregunten ELIGE no ser preguntable. Bastaba un `id` que no fuera UUID. Verificar mejor no
// alcanza; hay que cambiar QUIÉN declara el rol.

test('con el secreto en la mano, un id inventado ya no otorga «direccion»', async () => {
  const corridas = []
  const manejar = crearManejadorXsas({ atender, secreto: SECRETO, servicios: new Map(), gateway: { registro: registroDoble(corridas), catalogo: [] } })
  const r = await pedir(manejar, { actor: { id: 'worker-audit', rol: 'direccion' }, canal: 'app', intencion: 'os.estado_empresa' })
  assert.equal(r.status, 403)
  assert.equal(r.body.error.tipo, 'sin_permiso')
  assert.deepEqual(corridas, [], 'la tool no corrió')
})

test('y el pedido queda declarado como corrido SIN permisos, no como uno normal', async () => {
  const manejar = crearManejadorXsas({ atender, secreto: SECRETO, servicios: new Map(), gateway: { registro: registroDoble([]), catalogo: [] } })
  const r = await pedir(manejar, { actor: { id: 'worker-audit', rol: 'direccion' }, canal: 'app', mensaje: 'hola' })
  assert.match(JSON.stringify(r.body), /no se pudo verificar/)
})

test('un actor de servicio SÍ tiene rol, y lo declara el proceso — no el cuerpo', async () => {
  const corridas = []
  const manejar = crearManejadorXsas({
    atender, secreto: SECRETO, servicios: new Map([['os:worker', 'direccion']]),
    gateway: { registro: registroDoble(corridas), catalogo: [] },
  })
  // El cuerpo dice `campo`; el proceso dice `direccion`. Gana el proceso, en los dos sentidos.
  const r = await pedir(manejar, { actor: { id: 'os:worker', rol: 'campo' }, canal: 'worker', intencion: 'os.estado_empresa' })
  assert.equal(r.status, 200)
  assert.deepEqual(corridas, ['os.estado_empresa'])
})
