import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  tienePermiso, otorgarPermiso, revocarPermiso, listarAutorizados,
  modoVigente, MODO, DENEGADO, PERMISO_ASISTENCIA_WRITE,
} from './asistencia-permisos.mjs'

// El módulo que decide quién puede escribir en la planilla de jornales no tenía tests
// propios: sólo lo tocaban de refilón 4 aserciones del flujo. Acá se fija su contrato.

/** Puerto de base falso que además CUENTA las consultas: en modo abierto tienen que ser 0. */
function puerto({ rows = [], falla = null } = {}) {
  const p = {
    llamadas: [],
    async query(sql, params) {
      p.llamadas.push({ sql, params })
      if (falla) throw falla
      return { rows }
    },
  }
  return p
}

/** Corre `fn` con ORQ_ASISTENCIA_PERMISOS fijado, y lo restaura pase lo que pase. */
async function conModo(valor, fn) {
  const antes = process.env.ORQ_ASISTENCIA_PERMISOS
  if (valor === undefined) delete process.env.ORQ_ASISTENCIA_PERMISOS
  else process.env.ORQ_ASISTENCIA_PERMISOS = valor
  try { return await fn() } finally {
    if (antes === undefined) delete process.env.ORQ_ASISTENCIA_PERMISOS
    else process.env.ORQ_ASISTENCIA_PERMISOS = antes
  }
}

// ── MODO VIGENTE ────────────────────────────────────────────────────────────

test('el MVP aprobado es ABIERTO: sin variable de entorno, modo abierto', async () => {
  await conModo(undefined, () => assert.equal(modoVigente(), MODO.ABIERTO))
})

test('se endurece por configuración, sin desplegar código', async () => {
  await conModo('estricto', () => assert.equal(modoVigente(), MODO.ESTRICTO))
  await conModo('ESTRICTO', () => assert.equal(modoVigente(), MODO.ESTRICTO))
})

test('un valor cualquiera NO endurece por accidente (queda abierto)', async () => {
  for (const v of ['', 'si', 'true', '1', 'strict', 'abierto', ' estricto ']) {
    await conModo(v, () => assert.equal(modoVigente(), MODO.ABIERTO, `valor ${JSON.stringify(v)}`))
  }
})

// ── MODO ABIERTO · el MVP ───────────────────────────────────────────────────

test('modo abierto: un usuario autenticado cualquiera puede operar', async () => {
  await conModo(undefined, async () => {
    const r = await tienePermiso(puerto(), { plataformaUserId: 'u-cualquiera' })
    assert.equal(r.ok, true)
    assert.equal(r.modo, MODO.ABIERTO)
  })
})

test('modo abierto: la tabla de permisos VACÍA no bloquea — ni se consulta la base', async () => {
  await conModo(undefined, async () => {
    const p = puerto({ rows: [] }) // tabla vacía: en estricto esto denegaría
    const r = await tienePermiso(p, { plataformaUserId: 'u-jefe' })
    assert.equal(r.ok, true)
    assert.equal(p.llamadas.length, 0, 'en modo abierto no se toca la base')
  })
})

test('modo abierto: si la base está caída, igual se puede operar', async () => {
  await conModo(undefined, async () => {
    const p = puerto({ falla: new Error('connection refused') })
    const r = await tienePermiso(p, { plataformaUserId: 'u-jefe' })
    assert.equal(r.ok, true, 'el permiso no depende de la base en modo abierto')
  })
})

test('sin identidad de plataforma se rechaza SIEMPRE: sin identidad no hay a quién auditar', async () => {
  for (const modo of [undefined, 'estricto']) {
    await conModo(modo, async () => {
      for (const id of [undefined, null, '', 0]) {
        const r = await tienePermiso(puerto({ rows: [{ display: 'X' }] }), { plataformaUserId: id })
        assert.equal(r.ok, false, `id ${JSON.stringify(id)} en modo ${modo ?? 'abierto'}`)
        assert.equal(r.motivo, DENEGADO.SIN_IDENTIDAD)
      }
    })
  }
})

test('la respuesta declara el modo siempre: la auditoría lo registra', async () => {
  await conModo(undefined, async () => {
    assert.equal((await tienePermiso(puerto(), { plataformaUserId: 'u' })).modo, MODO.ABIERTO)
    assert.equal((await tienePermiso(puerto(), {})).modo, MODO.ABIERTO)
  })
  await conModo('estricto', async () => {
    assert.equal((await tienePermiso(puerto({ rows: [] }), { plataformaUserId: 'u' })).modo, MODO.ESTRICTO)
  })
})

// ── MODO ESTRICTO · la infraestructura que queda lista para endurecer ───────

test('modo estricto: con grant activo concede y devuelve el display', async () => {
  await conModo('estricto', async () => {
    const p = puerto({ rows: [{ display: 'Jefe de Obra 1' }] })
    const r = await tienePermiso(p, { plataformaUserId: 'u-jefe' })
    assert.equal(r.ok, true)
    assert.equal(r.display, 'Jefe de Obra 1')
    assert.equal(p.llamadas.length, 1)
    assert.deepEqual(p.llamadas[0].params, ['mattermost', 'u-jefe', PERMISO_ASISTENCIA_WRITE])
    assert.match(p.llamadas[0].sql, /activo/, 'sólo cuenta un grant activo')
  })
})

test('modo estricto: sin filas, deniega por sin_permiso', async () => {
  await conModo('estricto', async () => {
    const r = await tienePermiso(puerto({ rows: [] }), { plataformaUserId: 'u-ajeno' })
    assert.equal(r.ok, false)
    assert.equal(r.motivo, DENEGADO.SIN_PERMISO)
  })
})

test('modo estricto es FAIL-CLOSED: si la base no responde, no concede', async () => {
  await conModo('estricto', async () => {
    const r = await tienePermiso(puerto({ falla: new Error('timeout') }), { plataformaUserId: 'u-jefe' })
    assert.equal(r.ok, false)
    assert.equal(r.motivo, DENEGADO.ERROR_VERIFICANDO)
  })
})

test('el error de verificación se recorta: no se filtra un mensaje entero en la traza', async () => {
  await conModo('estricto', async () => {
    const largo = 'x'.repeat(5000)
    const r = await tienePermiso(puerto({ falla: new Error(largo) }), { plataformaUserId: 'u' })
    assert.ok(r.error.length <= 200, `error de ${r.error.length} caracteres`)
  })
})

// ── GESTIÓN DE GRANTS ───────────────────────────────────────────────────────

test('otorgar exige identidad y quién lo otorgó (traza obligatoria)', async () => {
  await assert.rejects(() => otorgarPermiso(puerto(), { otorgadoPor: 'jorge' }), /plataformaUserId/)
  await assert.rejects(() => otorgarPermiso(puerto(), { plataformaUserId: 'u' }), /otorgadoPor/)
})

test('otorgar es idempotente por (plataforma, usuario, permiso)', async () => {
  const p = puerto({ rows: [{ id: 1, activo: true }] })
  const r = await otorgarPermiso(p, { plataformaUserId: 'u', otorgadoPor: 'jorge', display: 'Jefe' })
  assert.equal(r.activo, true)
  assert.match(p.llamadas[0].sql, /on conflict \(plataforma, plataforma_user_id, permiso\)/)
  assert.match(p.llamadas[0].sql, /do update set activo = true/)
})

test('revocar no borra la fila: deja la traza de que el permiso existió', async () => {
  const p = puerto({ rows: [{ id: 1, activo: false }] })
  const r = await revocarPermiso(p, { plataformaUserId: 'u' })
  assert.equal(r.activo, false)
  assert.match(p.llamadas[0].sql, /^\s*update/i)
  assert.doesNotMatch(p.llamadas[0].sql, /delete/i)
})

test('revocar un permiso que no existe devuelve null, no explota', async () => {
  assert.equal(await revocarPermiso(puerto({ rows: [] }), { plataformaUserId: 'u' }), null)
})

test('listar autorizados filtra por plataforma y permiso', async () => {
  const p = puerto({ rows: [{ plataforma_user_id: 'u', activo: true }] })
  const filas = await listarAutorizados(p)
  assert.equal(filas.length, 1)
  assert.deepEqual(p.llamadas[0].params, ['mattermost', PERMISO_ASISTENCIA_WRITE])
})

// ── SIN NOMBRES EN EL CÓDIGO ────────────────────────────────────────────────

test('el permiso es un identificador estable, no un nombre de persona', () => {
  assert.equal(PERMISO_ASISTENCIA_WRITE, 'personal.asistencia.write')
})
