// LA CAMPANITA CUENTA EN LA BASE, Y CUENTA LO MISMO QUE TYPESCRIPT — contra los datos reales.
//
// ═══ QUÉ DEFECTO ATRAPA ═══
//
// `comprobante_cumple_filtro()` (20260911T0130) es el lado SQL de `PREDICADO`
// (`src/features/administracion/services/comprasEstado.ts`). Dos implementaciones de la misma regla
// se separan en el primer cambio de criterio si nada las compara — y cuando se separan, el número de
// la campanita y las filas de la pantalla 24 dicen cosas distintas sin un solo error: «7 sin
// imputar» arriba y nueve filas abajo. Es el mismo trato que `cobranza_imputacion` (SQL) y
// `cobranza-obra.mjs` (JS) desde el 10/09/2026: se comparan sobre TODAS las filas reales, no sobre
// un caso elegido.
//
// Se recorren los SEIS filtros, no los tres que la campanita usa: los otros tres los usa
// `aplicarFiltro` contra la base para la lista de la pantalla 24, y son los que tienen que coincidir
// con el conteo o la pantalla se contradice consigo misma.
//
// ═══ Y ATRAPA LA VUELTA ATRÁS ═══
//
// El payload se mide. Hasta 20260911T0020 la RPC transportaba las filas crudas: 76 KB por
// navegación, en TODAS las pantallas del OS. Si alguien las devuelve al JSON, el subtest del tamaño
// se pone rojo aunque los números sigan siendo correctos.
//
// Las dos migraciones se aplican DENTRO de la transacción y todo termina en ROLLBACK.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getPool } from './db.mjs'
import {
  FILTROS, cumpleFiltro,
} from '../../src/features/administracion/services/comprasEstado.ts'

const migracion = (nombre) => readFileSync(join(
  import.meta.dirname, '..', '..', 'supabase', 'migrations', nombre), 'utf8')

const EL_PARECIDO = migracion('20260911T0120_el_parecido_se_calcula_en_una_pasada.sql')
const LA_CAMPANITA = migracion('20260911T1030_una_vista_cara_se_recorre_una_vez_por_viaje.sql')

/** El techo del payload. Medido después: 251 bytes. Antes: 76.366. */
const TECHO_DE_PAYLOAD = 10_240

const hayBase = await getPool().query('select 1').then(() => true).catch(() => false)

test('campanita_atencion() cuenta en la base lo mismo que PREDICADO en TypeScript', { skip: !hayBase }, async (t) => {
  const c = await getPool().connect()
  const q = async (sql, params) => (await c.query(sql, params)).rows
  try {
    await c.query('begin')
    await c.query(EL_PARECIDO)
    await c.query(LA_CAMPANITA)

    const admin = (await q(`select id from perfiles where rol in ('direccion','administracion') and es_prueba = false limit 1`))[0]
    assert.ok(admin, 'no hay perfil de dirección ni de administración en la base')
    await c.query(`select set_config('request.jwt.claims', $1, true)`,
      [JSON.stringify({ sub: admin.id, role: 'authenticated' })])
    await c.query('set local role authenticated')

    const payload = (await q('select public.campanita_atencion()::text t'))[0].t
    const j = JSON.parse(payload)
    // Las MISMAS filas que la RPC transportaba hasta 20260911T0020. Son la referencia de TypeScript.
    const compras = await q(
      'select imputacion, tiene_posible_duplicado, estado_control from public.comprobante_compra')
    assert.ok(compras.length > 0, 'no hay comprobantes: este test no probó nada')

    await t.test('los seis filtros dan lo mismo en SQL y en TypeScript', async () => {
      for (const filtro of FILTROS) {
        const enSql = Number((await q(
          `select count(*) n from public.comprobante_compra k
            where public.comprobante_cumple_filtro($1, k.imputacion, k.tiene_posible_duplicado, k.estado_control)`,
          [filtro]))[0].n)
        const enTs = compras.filter((f) => cumpleFiltro(f, filtro)).length
        assert.equal(enSql, enTs, `el filtro «${filtro}» cuenta ${enSql} en SQL y ${enTs} en TypeScript`)
      }
    })

    await t.test('los tres números de Compras de la campanita son esos mismos conteos', () => {
      assert.equal(j.compras_sin_imputar, compras.filter((f) => cumpleFiltro(f, 'sin-imputar')).length)
      assert.equal(j.compras_sin_resolver, compras.filter((f) => cumpleFiltro(f, 'sin-resolver')).length)
      assert.equal(j.compras_duplicadas, compras.filter((f) => cumpleFiltro(f, 'duplicados')).length)
    })

    await t.test('«sin CUIT» es la misma decisión que `!p.cuit`', async () => {
      const proveedores = await q('select cuit from public.proveedores where activo')
      assert.ok(proveedores.length > 0, 'no hay proveedores activos: este subtest no probó nada')
      // `!p.cuit` toma el NULL y la cadena vacía, y NO la cadena de espacios: `coalesce(cuit,'')=''`
      // es exactamente eso. Un `btrim` de más en SQL contaría uno más que la pantalla.
      assert.equal(j.proveedores_sin_cuit, proveedores.filter((p) => !p.cuit).length)
    })

    await t.test('los tres cardinales coinciden con su consulta original', async () => {
      const viejos = (await q(`
        select (select count(*) from public.proveedor_nombre_pendiente) nombres,
               (select count(*) from public.imputacion_pendiente) pendientes,
               (select count(*) from public.correccion_asistencia_bandeja where estado = 'pendiente') correcciones`))[0]
      assert.equal(j.nombres_sin_resolver, Number(viejos.nombres))
      assert.equal(j.pendientes, Number(viejos.pendientes))
      assert.equal(j.correcciones, Number(viejos.correcciones))
    })

    await t.test('un filtro que no existe FALLA, no devuelve false', async () => {
      // Si devolviera false, un typo en el nombre del filtro haría que la campanita afirme «no hay
      // nada que resolver» —una afirmación sobre la empresa— en vez de romperse.
      // EL SAVEPOINT NO ES CEREMONIA: una excepción aborta la transacción entera y los subtests que
      // siguen fallarían por eso y no por lo que miran.
      await c.query('savepoint filtro_malo')
      await assert.rejects(
        () => c.query(`select public.comprobante_cumple_filtro('sin-inputar', 'sin_identificar', false, 'sin_revisar')`),
        /filtro de compras desconocido/,
      )
      await c.query('rollback to savepoint filtro_malo')
    })

    await t.test('el filtro «duplicados» sin la columna del parecido FALLA', async () => {
      // Un NULL ahí daría «0 duplicados» en silencio: el KPI diría que no hay nada que comparar.
      await c.query('savepoint parecido_nulo')
      await assert.rejects(
        () => c.query(`select public.comprobante_cumple_filtro('duplicados', 'obra', null, 'sin_revisar')`),
        /necesita tiene_posible_duplicado/,
      )
      await c.query('rollback to savepoint parecido_nulo')
    })

    await t.test('el perfil que devuelve es el de la sesión, y sólo su id y su rol', () => {
      assert.equal(j.perfil.id, admin.id)
      assert.deepEqual(Object.keys(j.perfil).sort(), ['id', 'rol'])
    })

    await t.test('el payload no vuelve a transportar filas', () => {
      assert.ok(payload.length < TECHO_DE_PAYLOAD,
        `la campanita devolvió ${payload.length} bytes (techo ${TECHO_DE_PAYLOAD}). Transportar las `
        + 'filas crudas costaba 76.366 bytes por navegación, en todas las pantallas del OS.')
      for (const clave of ['compras', 'proveedores_cuit']) {
        assert.equal(Array.isArray(j[clave]), false, `«${clave}» volvió a viajar como lista de filas`)
      }
    })
  } finally {
    await c.query('rollback').catch(() => {})
    c.release()
  }
})
