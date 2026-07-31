import { test } from 'node:test'
import assert from 'node:assert/strict'
import { traerUsuarios, aIdentidad, sincronizar } from './asistente-identidades.mjs'
import { baseFalsa, filaIdentidad } from '../comunicacion/asistente/dobles-de-prueba.mjs'

const USUARIOS = [
  { id: 'u-jorge', username: 'jorge', first_name: 'Jorge', last_name: 'Corona', nickname: 'Jorgito', email: 'jorge@ecsas.com.ar', delete_at: 0 },
  { id: 'u-rodrigo', username: 'rbronia', first_name: 'Rodrigo', last_name: 'Bronia', nickname: '', email: 'rodrigo@ecsas.com.ar', delete_at: 0 },
]

/** Mattermost falso: pagina y registra qué se le pidió (sin exponer el token en el resultado). */
function mattermostFalso(usuarios, { status = 200 } = {}) {
  const pedidos = []
  const f = async (url, init) => {
    pedidos.push({ url, auth: Boolean(init?.headers?.authorization) })
    if (status !== 200) return { ok: false, status, json: async () => ({ message: 'token sk-SECRETO inválido' }) }
    const page = Number(new URL(url).searchParams.get('page'))
    return { ok: true, json: async () => (page === 0 ? usuarios : []) }
  }
  f.pedidos = pedidos
  return f
}

test('trae sólo personas: ni bots ni dados de baja terminan en la tabla', async () => {
  const crudos = [...USUARIOS,
    { id: 'u-bot', username: 'os', is_bot: true, delete_at: 0 },
    { id: 'u-ex', username: 'ex', delete_at: 1_700_000_000, first_name: 'Ex', last_name: 'Empleado' }]
  const r = await traerUsuarios({ baseUrl: 'https://chat.example', token: 'x', fetchImpl: mattermostFalso(crudos) })
  assert.deepEqual(r.map((u) => u.id), ['u-jorge', 'u-rodrigo'])
})

test('un error de Mattermost no filtra el cuerpo de la respuesta (donde puede venir el token)', async () => {
  await assert.rejects(
    () => traerUsuarios({ baseUrl: 'https://chat.example', token: 'x', fetchImpl: mattermostFalso([], { status: 401 }) }),
    (e) => e.message.includes('401') && !e.message.includes('SECRETO'),
  )
})

test('sin credenciales no se intenta nada', async () => {
  await assert.rejects(() => traerUsuarios({ baseUrl: null, token: null }), /MM_BASE_URL|MM_BOT_TOKEN/)
})

test('el nombre visible es el que la gente reconoce y los apodos entran como alias', () => {
  const i = aIdentidad(USUARIOS[0])
  assert.equal(i.nombreVisible, 'Jorge Corona')
  assert.equal(i.plataformaUsername, 'jorge')
  assert.deepEqual(i.alias, ['Jorgito', 'Jorge', 'jorge'])
})

test('los alias cargados a mano NO se pisan: se preservan y se suman los de Mattermost', () => {
  const i = aIdentidad(USUARIOS[1], { aliasPrevios: ['el Ruso'] })
  assert.equal(i.alias[0], 'el Ruso', 'lo editado a mano manda')
  assert.ok(i.alias.includes('rbronia'))
})

test('--dry-run no escribe una sola fila, pero dice exactamente qué haría', async () => {
  const db = baseFalsa({ identidades: [] })
  const r = await sincronizar({ port: db, usuarios: USUARIOS, dryRun: true, log: null })
  assert.equal(r.nuevas, 2)
  assert.equal(db.identidades.length, 0, 'en seco no escribe')
  assert.deepEqual(r.detalle.map((d) => d.accion), ['alta', 'alta'])
})

test('correrlo dos veces no duplica a nadie ni reescribe lo que no cambió', async () => {
  const db = baseFalsa({ identidades: [] })
  const primera = await sincronizar({ port: db, usuarios: USUARIOS, log: null })
  const segunda = await sincronizar({ port: db, usuarios: USUARIOS, log: null })
  assert.equal(primera.nuevas, 2)
  assert.equal(segunda.nuevas, 0)
  assert.equal(segunda.sinCambio, 2, 'sin cambios no hay UPDATE')
  assert.equal(db.identidades.length, 2)
})

test('un cambio real de nombre o mail sí se actualiza', async () => {
  const db = baseFalsa({ identidades: [filaIdentidad({ id: 'u-jorge', username: 'jorge', nombre: 'Jorge Corona', alias: ['Jorgito', 'Jorge', 'jorge'], email: 'viejo@ecsas.com.ar' })] })
  const r = await sincronizar({ port: db, usuarios: [USUARIOS[0]], log: null })
  assert.equal(r.actualizadas, 1)
  assert.equal(db.identidades[0].email, 'jorge@ecsas.com.ar')
})
