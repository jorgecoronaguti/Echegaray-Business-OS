// EFECTIVO: QUIÉN PUEDE RENDIR, CONFIRMAR Y REHACER UN TICKET POR OTRA PERSONA — medido asumiendo cada rol.
//
// ═══ EL DEFECTO (dueño 30/09/2026: «no puedo cargarle rendiciones a nadie») ═══
// Las funciones del circuito del teléfono dejaban pasar a `es_administracion()`, que incluye al JEFE DE OBRA. La
// regla correcta es la de toda la gestión del efectivo: Dirección y Administración (`ve_economia()`), o la propia
// persona. Este test atrapa las dos mitades: que Administración SÍ pueda (y deje su huella en `enviado_por`) y que
// el Jefe de obra y el Campo NO puedan cargar en la caja de otro, ni siquiera verla.
//
// La migración se aplica DENTRO de la transacción (no tiene begin/commit a propósito): el test no depende de que
// alguien ya la haya aplicado, y todo termina en ROLLBACK. La entrega de prueba usa un `numero` explícito para no
// gastar la secuencia de códigos ER-xxxx en cada corrida.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { getPool } from './db.mjs'
import { MIGRACION, armar, como, hayBase } from './efectivo-pg-helpers.mjs'

const rendir = (c, quien, entrega, n) => como(c, quien,
  `select public.rendir_comprobante($1::uuid, $2 || '/rendicion/t${n}.jpg', 't.jpg', 'image/jpeg', 10)::text as n`, [entrega, quien])

test('rendir por otro: Dirección y Administración sí; Jefe de obra y Campo no', { skip: !hayBase }, async (t) => {
  const c = await getPool().connect()
  try {
    await c.query('begin')
    await c.query(readFileSync(MIGRACION, 'utf8'))
    const m = await armar(c)
    if (!m) { t.skip('la base no tiene 4 perfiles y 2 personas para armar los roles'); return }

    for (const rol of ['direccion', 'administracion']) {
      const r = await rendir(c, m[rol], m.ajena, rol)
      assert.equal(r.ok, true, `${rol} carga el ticket en la caja de otra persona: ${r.error ?? ''}`)
      // La huella: quien cargó queda como `enviado_por`, no la persona a la que se le cargó.
      const huella = await c.query('select enviado_por::text from public.efectivo_comprobante where id = $1', [r.n])
      assert.equal(huella.rows[0].enviado_por, m[rol], `${rol} queda registrado como quien lo cargó`)
    }

    // Jefe de obra: es_administracion() = true, ve_economia() = false. Antes de la migración esto pasaba.
    const jefe = await rendir(c, m.jefe, m.ajena, 'jefe')
    assert.equal(jefe.ok, false, 'el Jefe de obra NO rinde por otro')
    assert.match(jefe.error, /sólo rinde quien recibió/)

    // Campo: rinde lo SUYO, no lo de otro.
    assert.equal((await rendir(c, m.campo, m.propia, 'campo-propio')).ok, true, 'campo rinde su propia entrega')
    const ajeno = await rendir(c, m.campo, m.ajena, 'campo-ajeno')
    assert.equal(ajeno.ok, false, 'Campo NO rinde por otro')
    assert.match(ajeno.error, /sólo rinde quien recibió/)
  } finally {
    await c.query('rollback')
    c.release()
  }
})

test('confirmar y rehacer el ticket de otro: lo mismo que rendir', { skip: !hayBase }, async (t) => {
  const c = await getPool().connect()
  try {
    await c.query('begin')
    await c.query(readFileSync(MIGRACION, 'utf8'))
    const m = await armar(c)
    if (!m) { t.skip('la base no tiene 4 perfiles y 2 personas para armar los roles'); return }
    // El ticket de la persona ajena lo carga Dirección; a partir de ahí lo toca quien corresponda.
    const a = await rendir(c, m.direccion, m.ajena, 'a')
    const b = await rendir(c, m.direccion, m.ajena, 'b')
    assert.ok(a.ok && b.ok, 'se cargaron los dos tickets de la prueba')

    for (const [fn, quien] of [
      ['confirmar_lectura_rendicion', m.jefe], ['confirmar_lectura_rendicion', m.campo],
      ['rehacer_foto_rendicion', m.jefe], ['rehacer_foto_rendicion', m.campo],
    ]) {
      const r = await como(c, quien, `select public.${fn}($1::uuid)`, [a.n])
      assert.equal(r.ok, false, `${fn} por otro lo rechaza la base`)
      assert.match(r.error, /quien mandó|recibió/i)
    }
    assert.equal((await como(c, m.administracion, 'select public.confirmar_lectura_rendicion($1::uuid)', [a.n])).ok, true,
      'Administración confirma lo leído por la persona')
    assert.equal((await como(c, m.administracion, 'select public.rehacer_foto_rendicion($1::uuid)', [b.n])).ok, true,
      'Administración rehace la foto por la persona')
    assert.equal((await como(c, m.jefe, 'select public.responder_observacion_rendicion($1::uuid, $2)', [a.n, 'x'])).ok, false,
      'el Jefe de obra no contesta por otro')
  } finally {
    await c.query('rollback')
    c.release()
  }
})

test('el Jefe de obra no ve la plata ajena y Campo sólo la suya (migraciones 2700/3000/3010)', { skip: !hayBase }, async (t) => {
  const c = await getPool().connect()
  try {
    await c.query('begin')
    const m = await armar(c)
    if (!m) { t.skip('la base no tiene 4 perfiles y 2 personas para armar los roles'); return }
    const ids = [m.propia, m.ajena]
    const ve = (quien) => como(c, quien, 'select count(*)::int n from public.efectivo_entrega where id = any($1::uuid[])', [ids])
    assert.equal((await ve(m.jefe)).n, 0, 'jefe_obra no ve entregas de nadie ajeno')
    assert.equal((await ve(m.campo)).n, 1, 'campo ve SÓLO la suya')
    assert.equal((await ve(m.administracion)).n, 2, 'administración ve las de todos')
    assert.equal((await ve(m.direccion)).n, 2, 'dirección ve las de todos')
  } finally {
    await c.query('rollback')
    c.release()
  }
})
