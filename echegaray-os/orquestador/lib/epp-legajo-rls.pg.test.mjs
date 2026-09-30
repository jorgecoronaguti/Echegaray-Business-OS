// LO QUE MUESTRA EL LEGAJO DE CADA UNO COINCIDE CON `activo_existencia`, Y LA RLS LO RECORTA POR NIVEL.
//
// ═══ POR QUÉ ═══
// El legajo («EPP y ropa entregados») y `mi-informacion/epp` leen lo que la persona TIENE de
// `activo_existencia.persona_id`. Si esa lectura se desviara del inventario (otra tabla, otra suma), el
// legajo diría una cosa y la planilla de la obra otra: la misma dualidad que el dueño objetó el 30/09.
// Sólo LECTURA: no escribe nada, así que no hay rollback que olvidar ni dato de prueba en la base viva.
//
// ═══ DEFECTOS QUE ATRAPA ═══
//  1. Que lo que el legajo suma por persona difiera de las existencias asignadas a esa persona.
//  2. Que siga habiendo existencias colgadas de una ubicación tipo «persona» (modelo viejo: el legajo
//     no las vería, el inventario sí).
//  3. Que una sesión de Campo vea a más personas que Dirección, o que el jefe de obra vea menos que
//     Campo: la privacidad del tenedor la da la RLS de `personas` (si no ve a la persona, la pantalla
//     dice «alguien»), así que se mide con el rol real y no con superusuario.
// La migración 20260930T2100 la aplica el dueño: sin ella (aún hay ubicaciones tipo persona con stock)
// los tests saltan en vez de dar un rojo que no es del código.

import test from 'node:test'
import assert from 'node:assert/strict'
import { getPool } from './db.mjs'

const hayBase = await getPool().query('select 1').then(() => true).catch(() => false)

async function comoPerfil(c, sub, sql) {
  await c.query('begin')
  try {
    await c.query("select set_config('request.jwt.claims', json_build_object('sub',$1::text)::text, true)", [sub])
    await c.query('set local role authenticated')
    return (await c.query(sql)).rows
  } finally {
    await c.query('rollback')
  }
}

const TENEDORES = `select persona_id::text p, sum(cantidad)::int n from public.activo_existencia
                    where persona_id is not null group by 1 order by 1`
const PERSONAS = `select id::text p from public.personas order by 1`

test('el legajo suma por persona lo mismo que las existencias asignadas', { skip: !hayBase }, async (t) => {
  const c = await getPool().connect()
  try {
    const viejas = (await c.query(
      `select count(*)::int n from public.activo_existencia e join public.ubicacion u on u.id = e.ubicacion_id
        where u.tipo = 'persona' and e.cantidad > 0`)).rows[0].n
    if (viejas > 0) { t.skip('la migración 20260930T2100 no está aplicada: hay stock en ubicaciones tipo persona'); return }
    const porPersona = (await c.query(TENEDORES)).rows
    // La lectura del legajo, independiente: fila por fila, sumada acá y no en SQL.
    const filas = (await c.query(
      `select persona_id::text p, cantidad from public.activo_existencia where persona_id is not null`)).rows
    const suma = new Map()
    for (const f of filas) suma.set(f.p, (suma.get(f.p) ?? 0) + f.cantidad)
    for (const { p, n } of porPersona) assert.equal(suma.get(p) ?? 0, n, `persona ${p}: el legajo no coincide con el inventario`)
    assert.equal(
      [...suma.values()].reduce((a, b) => a + b, 0),
      porPersona.reduce((a, b) => a + b.n, 0),
      'el total asignado a personas difiere',
    )
  } finally { c.release() }
})

test('por nivel: Dirección nombra a todos los tenedores; Campo no ve más que el jefe ni que Dirección', { skip: !hayBase }, async (t) => {
  const c = await getPool().connect()
  try {
    const perfiles = (await c.query(
      `select rol, min(id::text) id from public.perfiles where rol in ('direccion','jefe_obra','campo') group by rol`)).rows
    const id = Object.fromEntries(perfiles.map((p) => [p.rol, p.id]))
    if (!id.direccion || !id.jefe_obra || !id.campo) { t.skip('faltan perfiles de dirección, jefe de obra o campo'); return }
    const total = (await c.query(TENEDORES)).rows
    const ven = {}
    for (const rol of ['direccion', 'jefe_obra', 'campo']) {
      ven[rol] = {
        existencias: await comoPerfil(c, id[rol], TENEDORES),
        personas: new Set((await comoPerfil(c, id[rol], PERSONAS)).map((r) => r.p)),
      }
    }
    // El inventario es de todos: la RLS de existencias no esconde lo que tiene cada uno (el recuento
    // del jefe y de Campo lo necesita); lo que recorta es el NOMBRE, por la RLS de `personas`.
    for (const rol of Object.keys(ven)) assert.deepEqual(ven[rol].existencias, total, `${rol}: las existencias deben coincidir con el inventario`)
    const nombrados = (rol) => total.filter((x) => ven[rol].personas.has(x.p)).length
    assert.ok(nombrados('direccion') >= nombrados('jefe_obra'), 'Dirección ve al menos a los que ve el jefe')
    assert.ok(nombrados('jefe_obra') >= nombrados('campo'), 'el jefe ve al menos a los que ve Campo')
    assert.equal(nombrados('direccion'), total.length, 'Dirección nombra a todos los tenedores')
  } finally { c.release() }
})
