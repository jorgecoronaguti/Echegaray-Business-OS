// Tests de la GUARDA de canal y permisos de la asistencia.
//
// Herméticos: sin red, sin base, sin Google. El `port` es un doble que responde SQL y, sobre
// todo, CUENTA lo que se le pregunta — porque media guarda es *no* preguntar: si el canal ya
// fue rechazado, el permiso no se consulta y la planilla no se toca.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { puedeCargar, RECHAZO, DETALLE, TEXTO, AREA_ASISTENCIA } from './asistencia-guarda.mjs'

// Ids con la forma real de Mattermost (26 caracteres), armados y no escritos, para que
// ningún fixture parezca configuración.
const CANAL_OFICIAL = 'a'.repeat(26)
const CANAL_OTRO = 'b'.repeat(26)
const CANAL_DM = 'd'.repeat(26)
const USUARIO = 'u'.repeat(26)

/**
 * Doble del pool. `canales` modela `comunicacion.canales_area` y `grants`
 * `comunicacion.permisos_skill`; el filtro `activo` se aplica como lo aplica el SQL real.
 */
function puerto({ canales = {}, grants = {}, romper = false } = {}) {
  const consultas = []
  return {
    consultas,
    async query(sql, params = []) {
      consultas.push({ sql, params })
      if (romper) throw new Error('no se pudo conectar con la base')
      if (/canales_area/.test(sql)) {
        const [plataforma, channelId, area] = params
        const c = canales[channelId]
        const ok = c && c.activo !== false && c.area === area && (c.plataforma ?? 'mattermost') === plataforma
        return { rows: ok ? [{ canal_nombre: c.nombre }] : [] }
      }
      if (/permisos_skill/.test(sql)) {
        const g = grants[params[1]]
        return { rows: g ? [{ display: g }] : [] }
      }
      return { rows: [] }
    },
  }
}

const conBinding = (extra = {}) => puerto({
  canales: { [CANAL_OFICIAL]: { area: AREA_ASISTENCIA, nombre: 'Asistencia', activo: true } },
  ...extra,
})

const actorValido = (extra = {}) => ({ plataforma_user_id: USUARIO, plataforma_username: 'pablo', ...extra })

/** Aísla process.env alrededor de un caso asíncrono. */
async function conEnv(vars, fn) {
  const previo = {}
  for (const k of Object.keys(vars)) {
    previo[k] = process.env[k]
    if (vars[k] === undefined) delete process.env[k]; else process.env[k] = vars[k]
  }
  try { return await fn() } finally {
    for (const k of Object.keys(previo)) {
      if (previo[k] === undefined) delete process.env[k]; else process.env[k] = previo[k]
    }
  }
}

const abierto = (fn) => conEnv({ ORQ_ASISTENCIA_PERMISOS: undefined }, fn)
const estricto = (fn) => conEnv({ ORQ_ASISTENCIA_PERMISOS: 'estricto' }, fn)

const consultoPermiso = (port) => port.consultas.some((c) => /permisos_skill/.test(c.sql))

// ── Canal ───────────────────────────────────────────────────────────────────────

test('un mensaje directo NO puede iniciar una carga (y ni siquiera toca la base)', async () => {
  await estricto(async () => {
    const port = conBinding()
    const r = await puedeCargar({
      port, channelId: CANAL_DM, plataforma: 'mattermost',
      actor: actorValido({ channel_id: CANAL_DM, channel_type: 'D' }),
    })
    assert.equal(r.ok, false)
    assert.equal(r.motivo, RECHAZO.CANAL)
    assert.equal(r.detalle, DETALLE.CANAL_DIRECTO)
    assert.equal(port.consultas.length, 0, 'un DM se rechaza en memoria, sin una sola consulta')
  })
})

test('un grupo armado a mano tampoco es el canal oficial', async () => {
  await estricto(async () => {
    const port = conBinding()
    const r = await puedeCargar({
      port, channelId: CANAL_OTRO,
      actor: actorValido({ channel_id: CANAL_OTRO, channel_type: 'G' }),
    })
    assert.equal(r.motivo, RECHAZO.CANAL)
    assert.equal(r.detalle, DETALLE.CANAL_GRUPO)
    assert.equal(port.consultas.length, 0)
  })
})

test('otro canal (existe, pero no es el del área) se rechaza', async () => {
  await abierto(async () => {
    const port = puerto({
      canales: {
        [CANAL_OFICIAL]: { area: AREA_ASISTENCIA, nombre: 'Asistencia', activo: true },
        [CANAL_OTRO]: { area: 'compras', nombre: 'Compras', activo: true },
      },
    })
    const r = await puedeCargar({ port, channelId: CANAL_OTRO, actor: actorValido({ channel_id: CANAL_OTRO, channel_type: 'P' }) })
    assert.equal(r.motivo, RECHAZO.CANAL)
    assert.equal(r.detalle, DETALLE.CANAL_NO_ES_EL_OFICIAL)
  })
})

test('un canal sin ningún binding se rechaza', async () => {
  await abierto(async () => {
    const r = await puedeCargar({ port: conBinding(), channelId: CANAL_OTRO, actor: actorValido() })
    assert.equal(r.motivo, RECHAZO.CANAL)
    assert.equal(r.detalle, DETALLE.CANAL_NO_ES_EL_OFICIAL)
  })
})

test('un hilo cuya raíz vive en otro canal se rechaza aunque el mensaje diga estar en el oficial', async () => {
  await estricto(async () => {
    const port = conBinding()
    const r = await puedeCargar({
      port, channelId: CANAL_OFICIAL,
      actor: actorValido({ channel_id: CANAL_OFICIAL, root_post_id: 'p'.repeat(26), root_channel_id: CANAL_OTRO }),
    })
    assert.equal(r.motivo, RECHAZO.CANAL)
    assert.equal(r.detalle, DETALLE.HILO_DE_OTRO_CANAL)
    assert.equal(port.consultas.length, 0, 'la contradicción se ve sin preguntarle a nadie')
  })
})

test('un pedido que declara dos canales distintos se rechaza (no se elige el conveniente)', async () => {
  await abierto(async () => {
    const r = await puedeCargar({
      port: conBinding(), channelId: CANAL_OFICIAL,
      actor: actorValido({ channel_id: CANAL_OTRO }),
    })
    assert.equal(r.motivo, RECHAZO.CANAL)
    assert.equal(r.detalle, DETALLE.CANAL_INCOHERENTE)
  })
})

test('un hilo del PROPIO canal oficial sí pasa', async () => {
  await abierto(async () => {
    const r = await puedeCargar({
      port: conBinding(), channelId: CANAL_OFICIAL,
      actor: actorValido({ channel_id: CANAL_OFICIAL, channel_type: 'P', root_post_id: 'p'.repeat(26), root_channel_id: CANAL_OFICIAL }),
    })
    assert.equal(r.ok, true)
  })
})

test('sin channelId no se puede verificar nada: se deniega', async () => {
  await abierto(async () => {
    const port = conBinding()
    const r = await puedeCargar({ port, channelId: null, actor: actorValido() })
    assert.equal(r.motivo, RECHAZO.CANAL)
    assert.equal(r.detalle, DETALLE.SIN_CANAL)
    assert.equal(port.consultas.length, 0)
  })
})

test('el binding DESACTIVADO apaga la carga en el acto', async () => {
  await abierto(async () => {
    const port = puerto({ canales: { [CANAL_OFICIAL]: { area: AREA_ASISTENCIA, nombre: 'Asistencia', activo: false } } })
    const r = await puedeCargar({ port, channelId: CANAL_OFICIAL, actor: actorValido() })
    assert.equal(r.ok, false)
    assert.equal(r.motivo, RECHAZO.CANAL)
    assert.equal(r.detalle, DETALLE.CANAL_NO_ES_EL_OFICIAL)
  })
})

test('el binding de OTRA plataforma no habilita el canal', async () => {
  await abierto(async () => {
    const port = puerto({ canales: { [CANAL_OFICIAL]: { area: AREA_ASISTENCIA, nombre: 'Asistencia', activo: true, plataforma: 'mattermost' } } })
    const r = await puedeCargar({ port, channelId: CANAL_OFICIAL, plataforma: 'slack', actor: actorValido() })
    assert.equal(r.motivo, RECHAZO.CANAL)
  })
})

// ── Fail-closed ─────────────────────────────────────────────────────────────────

test('base caída ⇒ se deniega (nunca se deja pasar por las dudas)', async () => {
  await abierto(async () => {
    const port = puerto({ romper: true })
    const r = await puedeCargar({ port, channelId: CANAL_OFICIAL, actor: actorValido() })
    assert.equal(r.ok, false)
    assert.equal(r.motivo, RECHAZO.CANAL)
    assert.equal(r.detalle, DETALLE.BASE_INDISPONIBLE)
    assert.match(r.texto, /probá de nuevo/i)
  })
})

test('sin pool tampoco se concede', async () => {
  await abierto(async () => {
    const r = await puedeCargar({ port: null, channelId: CANAL_OFICIAL, actor: actorValido() })
    assert.equal(r.ok, false)
    assert.equal(r.detalle, DETALLE.BASE_INDISPONIBLE)
  })
})

test('la base caída al verificar el PERMISO también deniega', async () => {
  await estricto(async () => {
    let n = 0
    const port = {
      consultas: [],
      async query(sql, params) {
        port.consultas.push({ sql, params })
        n += 1
        if (n === 1) return { rows: [{ canal_nombre: 'Asistencia' }] }
        throw new Error('se cayó la base justo acá')
      },
    }
    const r = await puedeCargar({ port, channelId: CANAL_OFICIAL, actor: actorValido() })
    assert.equal(r.ok, false)
    assert.equal(r.motivo, RECHAZO.PERMISO)
    assert.equal(r.detalle, DETALLE.PERMISO_NO_VERIFICABLE)
  })
})

// ── Identidad ───────────────────────────────────────────────────────────────────

test('canal oficial pero sin identidad ⇒ se deniega y el permiso ni se consulta', async () => {
  await estricto(async () => {
    const port = conBinding()
    const r = await puedeCargar({ port, channelId: CANAL_OFICIAL, actor: { channel_id: CANAL_OFICIAL } })
    assert.equal(r.ok, false)
    assert.equal(r.motivo, RECHAZO.SIN_IDENTIDAD)
    assert.equal(consultoPermiso(port), false, 'sin identidad no hay nada que preguntar')
  })
})

test('sin actor ⇒ se deniega', async () => {
  await abierto(async () => {
    const r = await puedeCargar({ port: conBinding(), channelId: CANAL_OFICIAL })
    assert.equal(r.motivo, RECHAZO.SIN_IDENTIDAD)
  })
})

// ── Permiso ─────────────────────────────────────────────────────────────────────

test('canal oficial + SIN permiso (modo estricto) ⇒ se deniega', async () => {
  await estricto(async () => {
    const port = conBinding()
    const r = await puedeCargar({ port, channelId: CANAL_OFICIAL, actor: actorValido() })
    assert.equal(r.ok, false)
    assert.equal(r.motivo, RECHAZO.PERMISO)
    assert.equal(r.detalle, DETALLE.SIN_PERMISO)
    assert.equal(consultoPermiso(port), true, 'el canal estaba bien: acá sí correspondía preguntar')
  })
})

test('canal oficial + CON permiso (modo estricto) ⇒ pasa', async () => {
  await estricto(async () => {
    const port = puerto({
      canales: { [CANAL_OFICIAL]: { area: AREA_ASISTENCIA, nombre: 'Asistencia', activo: true } },
      grants: { [USUARIO]: 'Pablo' },
    })
    const r = await puedeCargar({ port, channelId: CANAL_OFICIAL, actor: actorValido({ channel_type: 'P' }) })
    assert.equal(r.ok, true)
    assert.equal(r.canal.id, CANAL_OFICIAL)
    assert.equal(r.canal.nombre, 'Asistencia')
    assert.equal(r.canal.area, AREA_ASISTENCIA)
    assert.equal(r.modoPermisos, 'estricto')
  })
})

test('modo abierto: canal oficial + identidad real ⇒ pasa sin consultar permisos', async () => {
  await abierto(async () => {
    const port = conBinding()
    const r = await puedeCargar({ port, channelId: CANAL_OFICIAL, actor: actorValido() })
    assert.equal(r.ok, true)
    assert.equal(r.modoPermisos, 'abierto')
    assert.equal(consultoPermiso(port), false, 'en modo abierto el permiso es configuración, no una consulta')
  })
})

// ── El orden: barato primero ────────────────────────────────────────────────────

test('canal rechazado ⇒ el permiso NO se consulta (no se gasta en algo que ya se va a negar)', async () => {
  await estricto(async () => {
    for (const caso of [
      { channelId: CANAL_OTRO, actor: actorValido() },
      { channelId: CANAL_DM, actor: actorValido({ channel_type: 'D' }) },
      { channelId: CANAL_OFICIAL, actor: actorValido({ root_channel_id: CANAL_OTRO }) },
      { channelId: null, actor: actorValido() },
    ]) {
      const port = conBinding()
      const r = await puedeCargar({ port, ...caso })
      assert.equal(r.motivo, RECHAZO.CANAL, JSON.stringify(caso.channelId))
      assert.equal(consultoPermiso(port), false, 'se preguntó el permiso de un pedido ya rechazado')
    }
  })
})

test('la guarda no lee la planilla ni abre sesión: sólo consulta el binding y el permiso', async () => {
  await estricto(async () => {
    const port = conBinding()
    await puedeCargar({ port, channelId: CANAL_OFICIAL, actor: actorValido() })
    for (const c of port.consultas) {
      assert.doesNotMatch(c.sql, /asistencia_sesiones|jornales|insert|update|delete/i)
    }
  })
})

// ── Los mensajes de cara al jefe de obra ────────────────────────────────────────

test('cada rechazo tiene su propio mensaje: canal, permiso e identidad no dicen lo mismo', () => {
  const t = [TEXTO.CANAL, TEXTO.SIN_PERMISO, TEXTO.SIN_IDENTIDAD, TEXTO.CANAL_NO_VERIFICABLE, TEXTO.PERMISO_NO_VERIFICABLE]
  assert.equal(new Set(t).size, t.length, 'hay dos rechazos que dicen lo mismo')
  for (const x of t) {
    assert.ok(x.length > 30, 'un mensaje de una palabra no dice qué hacer')
    assert.match(x, /\.$/)
  }
  assert.match(TEXTO.CANAL, /canal de asistencia/i)
  assert.match(TEXTO.SIN_PERMISO, /Dirección/)
  assert.match(TEXTO.SIN_IDENTIDAD, /Mattermost/)
})

test('los mensajes no filtran ids, tablas, columnas ni jerga técnica', async () => {
  await estricto(async () => {
    const casos = [
      { channelId: CANAL_DM, actor: actorValido({ channel_type: 'D' }) },
      { channelId: CANAL_OTRO, actor: actorValido() },
      { channelId: CANAL_OFICIAL, actor: actorValido({ root_channel_id: CANAL_OTRO }) },
      { channelId: CANAL_OFICIAL, actor: {} },
      { channelId: CANAL_OFICIAL, actor: actorValido() },
    ]
    for (const caso of casos) {
      const r = await puedeCargar({ port: conBinding(), ...caso })
      assert.equal(r.ok, false)
      assert.ok(!r.texto.includes(CANAL_OFICIAL) && !r.texto.includes(CANAL_OTRO) && !r.texto.includes(CANAL_DM))
      assert.ok(!r.texto.includes(USUARIO))
      assert.doesNotMatch(r.texto, /\b[a-z0-9]{26}\b/, 'se filtró algo con forma de id')
      assert.doesNotMatch(r.texto, /canales_area|permisos_skill|channel_id|area_clave|select|postgres|sql|null|undefined/i)
      assert.doesNotMatch(r.texto, /error|excepci[oó]n|stack/i)
      assert.doesNotMatch(r.texto, /_/, 'un código interno no se le muestra al jefe de obra')
    }
  })
})

test('la base caída no cuenta lo que pasó del lado del sistema', async () => {
  await abierto(async () => {
    const r = await puedeCargar({ port: puerto({ romper: true }), channelId: CANAL_OFICIAL, actor: actorValido() })
    assert.ok(!/base|conectar|postgres/i.test(r.texto), 'el detalle técnico va al log, no al chat')
  })
})

// ── Guardianes del archivo ──────────────────────────────────────────────────────

test('ningún id de Mattermost escrito a mano: el canal sale del binding', () => {
  const src = readFileSync(new URL('./asistencia-guarda.mjs', import.meta.url), 'utf8')
  assert.doesNotMatch(src, /\b[a-z0-9]{26}\b/, 'asistencia-guarda.mjs tiene algo con forma de id de Mattermost')
  assert.match(src, /comunicacion\.canales_area/, 'el canal oficial tiene que salir del binding')
})

test('la guarda no crea un sistema de permisos propio: usa el que ya existe', () => {
  const src = readFileSync(new URL('./asistencia-guarda.mjs', import.meta.url), 'utf8')
  assert.match(src, /from '\.\.\/lib\/asistencia-permisos\.mjs'/)
  assert.doesNotMatch(src, /insert into|update .*set|delete from/i, 'la guarda no escribe en ningún lado')
  assert.doesNotMatch(src, /anthropic|claude-(?:opus|sonnet|haiku)|razonar\(/i, 'la puerta no razona con un modelo')
  assert.doesNotMatch(src, /TODO|FIXME|console\.log/)
})
