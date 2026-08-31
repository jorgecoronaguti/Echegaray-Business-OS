// El libro de auditoría. Hermético: port de base falso, 0 red, 0 Postgres.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { crearAuditorPg, crearAuditorEnMemoria, TABLA } from './auditoria.mjs'
import { CODIGO } from './errores.mjs'

const baseQue = (impl) => ({ query: impl })

test('una auditoría sin ACTOR no sirve: no se puede armar', () => {
  assert.throws(() => crearAuditorPg({ db: baseQue(async () => ({ rows: [] })) }), (e) => e.codigo === CODIGO.AUDIT_UNAVAILABLE)
  assert.throws(() => crearAuditorPg({ actor: 'x' }), (e) => e.codigo === CODIGO.AUDIT_UNAVAILABLE)
})

test('la fila contesta qué, quién, cuándo, sobre qué archivo y con qué versión', async () => {
  let sql = null; let params = null
  const a = crearAuditorPg({
    db: baseQue(async (s, p) => { sql = s; params = p; return { rows: [{ id: 'uuid-1' }] } }),
    actor: 'agent:director-general', actorTipo: 'agente', correlationId: '11111111-1111-1111-1111-111111111111',
  })
  const id = await a.registrar({
    operacion: 'mover',
    referencia: { provider: 'google-drive', file_id: '1abc', folder_id: 'CARP', mime_type: 'application/pdf', revision_id: '0Bx', hash: 'md5x' },
    antes: { parents: ['VIEJA'] }, despues: { parents: ['CARP'] },
    verificado_campos: ['parents'], ocurrido_en: '2026-08-31T20:00:00.000Z',
  })
  assert.equal(id, 'uuid-1')
  assert.ok(sql.includes(TABLA))
  assert.equal(params[1], 'mover')
  assert.equal(params[6], 'agent:director-general')      // actor
  assert.equal(params[7], 'agente')                      // actor_tipo
  assert.equal(params[9], '1abc')                        // file_id
  assert.equal(params[10], 'CARP')                       // parent_id
  assert.equal(params[12], '0Bx')                        // revision_id
  assert.equal(JSON.parse(params[16]).parents[0], 'CARP')// despues
  assert.equal(params[17], true)                         // verificado
  assert.deepEqual(params[18], ['parents'])              // verificado_campos
  assert.equal(params[19], '2026-08-31T20:00:00.000Z')   // cuándo
})

test('verificado NO es true por defecto cuando quien registra dice que no verificó', async () => {
  // Una auditoría donde todo figura verificado por defecto es un adorno, no un control.
  let params = null
  const a = crearAuditorPg({ db: baseQue(async (_s, p) => { params = p; return { rows: [{ id: 'x' }] } }), actor: 'sistema' })
  await a.registrar({ operacion: 'crear', verificado: false, referencia: { file_id: 'f' } })
  assert.equal(params[17], false)
})

test('LA MIGRACIÓN NO APLICADA se dice con esas palabras, no con un error de Postgres crudo', async () => {
  const a = crearAuditorPg({ db: baseQue(async () => { const e = new Error('relation "orq.drive_audit" does not exist'); e.code = '42P01'; throw e }), actor: 'sistema' })
  await assert.rejects(() => a.registrar({ operacion: 'crear', referencia: { file_id: 'f' } }),
    (e) => e.codigo === CODIGO.AUDIT_UNAVAILABLE && /NO aplicada/.test(e.message) && /NO quedó auditada/.test(e.message))
})

test('cualquier otro fallo de base también sale con nombre propio', async () => {
  const a = crearAuditorPg({ db: baseQue(async () => { throw new Error('connection terminated') }), actor: 'sistema' })
  await assert.rejects(() => a.registrar({ operacion: 'crear', referencia: { file_id: 'f' } }),
    (e) => e.codigo === CODIGO.AUDIT_UNAVAILABLE && /connection terminated/.test(e.detalle))
})

test('la historia de un archivo se pide por file_id, que es la identidad', async () => {
  let params = null
  const a = crearAuditorPg({ db: baseQue(async (_s, p) => { params = p; return { rows: [{ id: 1 }] } }), actor: 'sistema' })
  await a.historia('1abc', { limite: 5 })
  assert.deepEqual(params, ['1abc', 5])
})

test('el auditor en memoria guarda de verdad: un no-op disfrazado no probaría nada', async () => {
  const a = crearAuditorEnMemoria()
  await a.registrar({ operacion: 'crear', referencia: { file_id: 'f1' }, correlation_id: 'c1' })
  await a.registrar({ operacion: 'mover', referencia: { file_id: 'f2' }, correlation_id: 'c1' })
  assert.equal(a.filas.length, 2)
  assert.equal((await a.historia('f1')).length, 1)
  assert.equal((await a.porCorrelacion('c1')).length, 2)
})
