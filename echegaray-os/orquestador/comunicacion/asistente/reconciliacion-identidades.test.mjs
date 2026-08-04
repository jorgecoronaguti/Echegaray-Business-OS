// LOS VALORES SON LOS REALES, MEDIDOS EL 04/08 CONTRA PRODUCCIÓN:
//   jorge   → sascwozf13gppfubp6zkq3s8ho · jorge@ecsas.com.ar
//   rodrigo → zopszboxqffk7m951az7pbiege · rodrigo@ecsas.com.ar
// Las filas que había en la base eran `u-jorge` y `u-rodrigo`: ids de una siembra de ejemplo que
// nunca existieron en Mattermost. Ese par —id de ejemplo en la tabla, id real en el evento— es el
// defecto entero, y por eso es el fixture.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { asegurarIdentidad, auditarIdentidades, HALLAZGO } from './reconciliacion-identidades.mjs'
import { identidadDe } from './identidades.mjs'
import { baseFalsa, filaIdentidad } from './dobles-de-prueba.mjs'
import { mmFalso } from '../comprobantes/dobles.mjs'

const ID_JORGE = 'sascwozf13gppfubp6zkq3s8ho'
const ID_RODRIGO = 'zopszboxqffk7m951az7pbiege'

const usuarioMM = (over = {}) => ({
  id: ID_JORGE, username: 'jorge', email: 'jorge@ecsas.com.ar',
  first_name: 'Jorge', last_name: 'Corona', nickname: '', delete_at: 0, is_bot: false, ...over,
})

/** `port` con la tabla de identidades y `orq.google_tokens`, que la base falsa no conoce. */
function base({ identidades = [], tokens = [], tokensRotos = false } = {}) {
  const db = baseFalsa({ identidades })
  const original = db.query
  db.query = async (sql, params = []) => {
    if (/google_tokens/.test(sql)) {
      if (tokensRotos) throw new Error('base caída (simulado)')
      return { rows: tokens.map((email) => ({ email })) }
    }
    return original(sql, params)
  }
  return db
}

// ── A · reparación en el momento del pedido ──────────────────────────────────

test('el id REAL sin fila se da de alta con el email que manda MATTERMOST, no con uno inferido', async () => {
  const db = base({ identidades: [filaIdentidad({ id: 'u-jorge', username: 'jorge', nombre: 'Jorge Corona', email: 'jorge@ecsas.com.ar' })] })
  const mm = mmFalso({ usuarios: { [ID_JORGE]: usuarioMM() } })

  const r = await asegurarIdentidad({ port: db, mm, plataformaUserId: ID_JORGE })

  assert.equal(r.accion, 'creada')
  assert.equal(r.identidad.plataformaUserId, ID_JORGE)
  assert.equal(r.identidad.email, 'jorge@ecsas.com.ar')
  // Y quedó EN LA BASE: la próxima vez ya no hace falta preguntarle a Mattermost.
  const guardada = await identidadDe(db, ID_JORGE)
  assert.equal(guardada.email, 'jorge@ecsas.com.ar')
  // La fila vieja sigue ahí: declarar no es borrar.
  assert.equal(r.hallazgo.codigo, HALLAZGO.EMAIL_DUPLICADO)
  assert.ok(db.identidades.some((i) => i.plataforma_user_id === 'u-jorge'), 'no se borra ni se fusiona nada')
})

test('una identidad completa no le pregunta nada a Mattermost: el camino feliz es gratis', async () => {
  const db = base({ identidades: [filaIdentidad({ id: ID_JORGE, username: 'jorge', nombre: 'Jorge Corona', email: 'jorge@ecsas.com.ar' })] })
  let consultas = 0
  const mm = { usuario: async () => { consultas++; return usuarioMM() } }

  const r = await asegurarIdentidad({ port: db, mm, plataformaUserId: ID_JORGE })

  assert.equal(r.accion, 'ya_estaba')
  assert.equal(consultas, 0)
})

test('una identidad registrada PERO SIN EMAIL se completa desde Mattermost', async () => {
  const db = base({ identidades: [filaIdentidad({ id: ID_RODRIGO, username: 'rodrigo', nombre: 'Rodrigo Echegaray', email: null })] })
  const mm = mmFalso({ usuarios: { [ID_RODRIGO]: usuarioMM({ id: ID_RODRIGO, username: 'rodrigo', email: 'rodrigo@ecsas.com.ar', first_name: 'Rodrigo', last_name: 'Echegaray' }) } })

  const r = await asegurarIdentidad({ port: db, mm, plataformaUserId: ID_RODRIGO })

  assert.equal(r.accion, 'completada')
  assert.equal(r.identidad.email, 'rodrigo@ecsas.com.ar')
})

test('FAIL-CLOSED: si Mattermost no contesta no se escribe NADA y se dice', async () => {
  const db = base({ identidades: [] })
  const mm = mmFalso({ usuariosRoto: true })

  const r = await asegurarIdentidad({ port: db, mm, plataformaUserId: ID_JORGE })

  assert.equal(r.accion, 'sin_verificar')
  assert.equal(r.identidad, null)
  assert.equal(r.hallazgo.codigo, HALLAZGO.SIN_MATTERMOST)
  assert.equal(db.identidades.length, 0, 'una reconciliación a ciegas es peor que ninguna')
})

test('un id que Mattermost dice que no existe no se convierte en identidad inventada', async () => {
  const db = base({ identidades: [] })
  const mm = mmFalso({ usuarios: {} })

  const r = await asegurarIdentidad({ port: db, mm, plataformaUserId: 'id-que-no-existe' })

  assert.equal(r.accion, 'desconocida')
  assert.equal(r.hallazgo.codigo, HALLAZGO.ID_INEXISTENTE)
  assert.equal(db.identidades.length, 0)
})

test('a un bot o a alguien dado de baja no se le crea identidad', async () => {
  for (const over of [{ is_bot: true }, { delete_at: 1730000000000 }]) {
    const db = base({ identidades: [] })
    const mm = mmFalso({ usuarios: { [ID_JORGE]: usuarioMM(over) } })
    const r = await asegurarIdentidad({ port: db, mm, plataformaUserId: ID_JORGE })
    assert.equal(r.accion, 'ignorada')
    assert.equal(db.identidades.length, 0)
  }
})

test('los alias cargados a mano se preservan: lo editado por una persona manda', async () => {
  const db = base({ identidades: [filaIdentidad({ id: ID_JORGE, username: 'jorge', nombre: 'Jorge Corona', alias: ['el jefe'], email: null })] })
  const mm = mmFalso({ usuarios: { [ID_JORGE]: usuarioMM() } })

  const r = await asegurarIdentidad({ port: db, mm, plataformaUserId: ID_JORGE })

  assert.ok(r.identidad.alias.includes('el jefe'), 'un apodo cargado a mano no se pisa')
  assert.ok(r.identidad.alias.includes('jorge'))
})

// ── C · el canario ───────────────────────────────────────────────────────────

test('el canario caza la identidad que no existe en Mattermost y nombra a quién le pega', async () => {
  const db = base({
    identidades: [filaIdentidad({ id: 'u-jorge', username: 'jorge', nombre: 'Jorge Corona', email: 'jorge@ecsas.com.ar' })],
    tokens: ['jorge@ecsas.com.ar'],
  })
  const mm = mmFalso({ usuarios: { [ID_JORGE]: usuarioMM() } })

  const r = await auditarIdentidades({ port: db, mm })

  assert.equal(r.ok, false)
  const h = r.hallazgos.find((x) => x.codigo === HALLAZGO.ID_INEXISTENTE)
  assert.ok(h, 'la fila u-jorge apunta a un usuario que Mattermost no conoce')
  assert.match(h.mensaje, /Jorge Corona/)
  assert.match(h.mensaje, /u-jorge/)
})

test('el canario caza a quien enlazó su Google y no tiene identidad en el chat', async () => {
  const db = base({
    identidades: [filaIdentidad({ id: ID_JORGE, username: 'jorge', nombre: 'Jorge Corona', email: 'jorge@ecsas.com.ar' })],
    tokens: ['jorge@ecsas.com.ar', 'rodrigo@ecsas.com.ar'],
  })
  const mm = mmFalso({ usuarios: { [ID_JORGE]: usuarioMM() } })

  const r = await auditarIdentidades({ port: db, mm })

  const h = r.hallazgos.find((x) => x.codigo === HALLAZGO.TOKEN_SIN_IDENTIDAD)
  assert.ok(h)
  assert.match(h.mensaje, /rodrigo@ecsas\.com\.ar/)
})

test('el canario caza el email distinto y el email faltante', async () => {
  const db = base({
    identidades: [
      filaIdentidad({ id: ID_JORGE, username: 'jorge', nombre: 'Jorge Corona', email: 'jorge@viejo.com' }),
      filaIdentidad({ id: ID_RODRIGO, username: 'rodrigo', nombre: 'Rodrigo Echegaray', email: null }),
    ],
  })
  const mm = mmFalso({
    usuarios: {
      [ID_JORGE]: usuarioMM(),
      [ID_RODRIGO]: usuarioMM({ id: ID_RODRIGO, username: 'rodrigo', email: 'rodrigo@ecsas.com.ar' }),
    },
  })

  const r = await auditarIdentidades({ port: db, mm })

  assert.ok(r.hallazgos.some((h) => h.codigo === HALLAZGO.EMAIL_DISTINTO))
  assert.ok(r.hallazgos.some((h) => h.codigo === HALLAZGO.SIN_EMAIL))
})

test('con todo en orden el canario no inventa hallazgos', async () => {
  const db = base({
    identidades: [
      filaIdentidad({ id: ID_JORGE, username: 'jorge', nombre: 'Jorge Corona', email: 'jorge@ecsas.com.ar' }),
      filaIdentidad({ id: ID_RODRIGO, username: 'rodrigo', nombre: 'Rodrigo Echegaray', email: 'rodrigo@ecsas.com.ar' }),
    ],
    tokens: ['jorge@ecsas.com.ar', 'rodrigo@ecsas.com.ar'],
  })
  const mm = mmFalso({
    usuarios: {
      [ID_JORGE]: usuarioMM(),
      [ID_RODRIGO]: usuarioMM({ id: ID_RODRIGO, username: 'rodrigo', email: 'rodrigo@ecsas.com.ar' }),
    },
  })

  const r = await auditarIdentidades({ port: db, mm })

  assert.deepEqual(r.hallazgos, [])
  assert.equal(r.ok, true)
  assert.equal(r.revisadas, 2)
})

test('sin Mattermost el canario NO dice que está todo bien: dice que no pudo mirar', async () => {
  const db = base({ identidades: [filaIdentidad({ id: ID_JORGE, nombre: 'Jorge Corona', email: 'jorge@ecsas.com.ar' })] })

  const r = await auditarIdentidades({ port: db, mm: null })

  assert.equal(r.ok, false)
  assert.equal(r.hallazgos[0].codigo, HALLAZGO.SIN_MATTERMOST)
})

test('si no se puede leer orq.google_tokens se declara, no se asume que no hay nadie', async () => {
  const db = base({ identidades: [filaIdentidad({ id: ID_JORGE, nombre: 'Jorge Corona', email: 'jorge@ecsas.com.ar' })], tokensRotos: true })
  const mm = mmFalso({ usuarios: { [ID_JORGE]: usuarioMM() } })

  const r = await auditarIdentidades({ port: db, mm })

  assert.ok(r.hallazgos.some((h) => h.codigo === HALLAZGO.NO_VERIFICABLE))
})
