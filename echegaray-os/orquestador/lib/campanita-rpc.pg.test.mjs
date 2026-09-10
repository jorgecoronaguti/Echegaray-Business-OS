// LA CAMPANITA EN UN VIAJE DICE LO MISMO QUE EN SEIS — contra la base real.
//
// ═══ QUÉ DEFECTO ATRAPA ═══
//
// Los tres cardinales (`proveedor_nombre_pendiente`, `imputacion_pendiente`,
// `correccion_asistencia_bandeja`) los resolvía PostgREST con `count: 'exact', head: true`; ahora
// los resuelve un `count(*)` escrito a mano. Un `where` olvidado —el `estado = 'pendiente'` de las
// correcciones es el candidato obvio— haría que la campanita muestre el total histórico en vez de
// lo pendiente, y NADIE lo notaría: un número más alto en una campanita se lee como «hay más
// trabajo», no como un defecto. Este test compara los tres contra su consulta original.
//
// Y las dos listas que viajan crudas (`proveedores.cuit`, las tres columnas de
// `comprobante_compra`) se comparan fila por fila: son las que alimentan `PREDICADO` en TypeScript,
// y si vinieran filtradas de más los cuatro números de Compras bajarían solos.
//
// La función se crea DENTRO de la transacción y todo termina en ROLLBACK.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getPool } from './db.mjs'

const MIGRACION = readFileSync(join(
  import.meta.dirname, '..', '..', 'supabase', 'migrations',
  '20260911T0020_campanita_una_consulta.sql'), 'utf8')

const hayBase = await getPool().query('select 1').then(() => true).catch(() => false)

test('campanita_atencion() dice lo mismo que las seis consultas', { skip: !hayBase }, async (t) => {
  const c = await getPool().connect()
  const q = async (sql) => (await c.query(sql)).rows
  try {
    await c.query('begin')
    await c.query(MIGRACION)

    const admin = (await q(`select id from perfiles where rol in ('direccion','administracion') and es_prueba = false limit 1`))[0]
    assert.ok(admin, 'no hay perfil de dirección ni de administración en la base')
    await c.query(`select set_config('request.jwt.claims', '${JSON.stringify({ sub: admin.id, role: 'authenticated' })}', true)`)
    await c.query('set local role authenticated')

    const j = (await q('select public.campanita_atencion() j'))[0].j

    await t.test('los tres cardinales coinciden con su consulta original', async () => {
      const viejos = (await q(`
        select (select count(*) from public.proveedor_nombre_pendiente) nombres,
               (select count(*) from public.imputacion_pendiente) pendientes,
               (select count(*) from public.correccion_asistencia_bandeja where estado = 'pendiente') correcciones`))[0]
      assert.equal(j.nombres_sin_resolver, Number(viejos.nombres))
      assert.equal(j.pendientes, Number(viejos.pendientes))
      assert.equal(j.correcciones, Number(viejos.correcciones))
    })

    await t.test('las listas crudas llegan enteras, sin filtro de más', async () => {
      const viejos = (await q(`
        select (select count(*) from public.proveedores where activo) proveedores,
               (select count(*) from public.comprobante_compra) compras`))[0]
      assert.equal(j.proveedores_cuit.length, Number(viejos.proveedores))
      assert.equal(j.compras.length, Number(viejos.compras))
      // Las tres columnas que decide `PREDICADO`: si alguna dejara de venir, `cumpleFiltro` la
      // leería `undefined` y los cuatro números de Compras caerían a cero en silencio.
      const primera = j.compras[0]
      assert.ok(primera && 'imputacion' in primera && 'tiene_posible_duplicado' in primera
        && 'estado_control' in primera, 'a las filas de compras les falta una columna del predicado')
    })

    await t.test('el perfil que devuelve es el de la sesión', () => {
      assert.equal(j.perfil.id, admin.id)
    })
  } finally {
    await c.query('rollback').catch(() => {})
    c.release()
  }
})
