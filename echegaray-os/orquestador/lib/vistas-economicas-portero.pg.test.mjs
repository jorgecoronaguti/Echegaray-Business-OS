// LAS VISTAS ECONÓMICAS SÓLO PARA QUIEN VE ECONOMÍA — CONTRA LA BASE REAL.
//
// ═══ QUÉ DEFECTOS ATRAPA ═══
//
//  1 · LA FUGA. Con la sesión de un perfil `campo`, las seis vistas de `20260913T1200` y sus seis
//      tablas de origen tienen que devolver CERO filas. Revertir el portero de cualquiera la pone roja.
//  2 · EL ARREGLO QUE APAGA A DIRECCIÓN. Con la sesión de Dirección real, cada vista, cada tabla,
//      `obra_cuenta`, `cliente_economia`, `pantalla_clientes()` y `pantalla_cliente(messina)` tienen
//      que dar el MISMO conteo y el MISMO md5 que antes de la migración. Pasar `obra_economia_cartera`
//      a `security_invoker` rompería esto (lee `obra_canonica.monto_contratado`, cerrada desde T1600).
//  3 · EL CBU. `authenticated` no tiene SELECT sobre `recupero_art.cbu_acreditacion` y sí sobre el resto.
//  4 · LA PRUEBA EN LA TABLA. Una cuenta real deja de ver `personas.es_prueba` y NO pierde a nadie
//      más; una cuenta de prueba sigue viéndolas (los E2E escriben sobre ellas).
//
// LOS NÚMEROS NO SE CLAVAN: se comparan dos lecturas de la misma base, en la misma transacción
// `repeatable read`, antes y después de aplicar el archivo. Nada queda aplicado: termina en ROLLBACK.
//
// ═══ POR QUÉ PIDE `ORQ_PG_DDL=1` ═══
//
// Aplica la migración dentro de la transacción: toma ACCESS EXCLUSIVE sobre `personas`, las seis
// vistas y seis tablas mientras mide. Medido el 13/09/2026: 18 s de lock, casi todo
// `pantalla_cliente`. Eso frena a la app entera, así que no corre solo:
//
//     ORQ_PG_DDL=1 node --test orquestador/lib/vistas-economicas-portero.pg.test.mjs

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getPool } from './db.mjs'

const MIGRACION = readFileSync(join(import.meta.dirname, '..', '..', 'supabase', 'migrations',
  '20260913T1200_vistas_economicas_solo_para_quien_ve_economia.sql'), 'utf8')

const VISTAS = ['obra_economia_cartera', 'egreso_por_area', 'finanzas_scorecard_vigente',
  'nomina_por_mes', 'recupero_art_por_mes', 'recupero_art_sin_imputar']
const TABLAS = ['jornales_quincena', 'cargas_sociales_periodo', 'recupero_art',
  'recupero_art_imputacion', 'finanzas_scorecard', 'obra_economia_sheet']

const DDL_PERMITIDO = process.env.ORQ_PG_DDL === '1'
const hayBase = DDL_PERMITIDO && await getPool().query('select 1').then(() => true).catch(() => false)

test('20260913T1200: la plata sólo para quien ve economía, la prueba sólo para la prueba', { skip: !hayBase }, async (t) => {
  const c = await getPool().connect()
  const q = async (sql, params) => (await c.query(sql, params)).rows
  const uno = async (sql, params) => (await q(sql, params))[0]
  /** Conteo y md5 del contenido, leído con la sesión de `sub`. */
  const medir = async (sub, from) => {
    await q(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub, role: 'authenticated' })])
    await q('set local role authenticated')
    try {
      return await uno(`select count(*)::int n, md5(coalesce(string_agg(t::text, '|' order by t::text), '')) h from (${from}) t`)
    } finally { await q('reset role') }
  }
  try {
    await q('begin isolation level repeatable read')
    await q('select pg_advisory_xact_lock(20260822)') // el turno del DDL en la base compartida
    await q("set local lock_timeout = '5s'")

    const direccion = (await uno(`select id from perfiles where rol='direccion' and es_prueba is not true order by id limit 1`))?.id
    const campo = (await uno(`select id from perfiles where rol='campo' and es_prueba order by id limit 1`))?.id
    const dirPrueba = (await uno(`select id from perfiles where rol='direccion' and es_prueba order by id limit 1`))?.id
    assert.ok(direccion && campo && dirPrueba, 'faltan los perfiles de Dirección real, QA Campo o Dirección de prueba')

    // Las columnas que `authenticated` puede pedir de las tablas con grant por columna: el mismo
    // `select` antes y después, para que el md5 compare lo mismo.
    const cols = async (tabla, sinCbu) => (await uno(
      `select string_agg(quote_ident(column_name), ',' order by column_name) c from information_schema.columns
        where table_schema='public' and table_name=$1 and ($2::boolean is false or column_name <> 'cbu_acreditacion')
          and (table_name <> 'obra_economia_sheet' or has_column_privilege('authenticated', 'public.'||table_name, column_name, 'select'))`,
      [tabla, sinCbu])).c
    const fuentes = {}
    for (const v of VISTAS) fuentes[v] = `select * from public.${v}`
    for (const tb of TABLAS) fuentes[tb] = `select ${await cols(tb, tb === 'recupero_art')} from public.${tb}`
    const deDireccion = {
      ...fuentes,
      obra_cuenta: 'select * from public.obra_cuenta',
      cliente_economia: 'select * from public.cliente_economia',
      pantalla_clientes: 'select public.pantalla_clientes() x',
      pantalla_cliente_messina: "select public.pantalla_cliente('messina','obras') x",
    }
    const personasReales = 'select id from public.personas where es_prueba is not true'

    const antes = {}
    for (const [k, s] of Object.entries(deDireccion)) antes[k] = await medir(direccion, s)
    const realesAntes = await medir(direccion, personasReales)
    const pruebaAntes = await medir(dirPrueba, 'select id from public.personas where es_prueba')

    await c.query(MIGRACION)

    await t.test('un perfil campo no lee ninguna de las doce', async () => {
      for (const [k, s] of Object.entries(fuentes)) {
        const r = await medir(campo, s)
        assert.equal(r.n, 0, `\`${k}\` le publica ${r.n} fila(s) a un perfil campo`)
      }
    })

    await t.test('Dirección lee exactamente lo mismo que antes, pantallas incluidas', async () => {
      for (const [k, s] of Object.entries(deDireccion)) {
        const r = await medir(direccion, s)
        assert.deepEqual(r, antes[k], `\`${k}\` cambió para Dirección: el portero le sacó lo que sí puede ver`)
      }
    })

    await t.test('el CBU de la ART no se lee con sesión; el resto de la fila sí', async () => {
      const r = await uno(`select has_column_privilege('authenticated','public.recupero_art','cbu_acreditacion','select') cbu,
                                  has_column_privilege('authenticated','public.recupero_art','importe_liquidado','select') importe`)
      assert.equal(r.cbu, false, 'authenticated sigue leyendo recupero_art.cbu_acreditacion')
      assert.equal(r.importe, true, 'el revoke se llevó columnas que no eran el CBU')
    })

    await t.test('una cuenta real no ve la prueba y no pierde a nadie real; la de prueba la sigue viendo', async () => {
      const vistas = await medir(direccion, 'select id from public.personas where es_prueba')
      assert.equal(vistas.n, 0, `una cuenta real ve ${vistas.n} persona(s) de prueba en la tabla`)
      assert.deepEqual(await medir(direccion, personasReales), realesAntes,
        'la policy le escondió a Dirección personas REALES: eso saca gente de la liquidación')
      assert.deepEqual(await medir(dirPrueba, 'select id from public.personas where es_prueba'), pruebaAntes,
        'la cuenta de prueba dejó de ver a las personas de prueba: los E2E se quedan sin sobre qué escribir')
    })

    await t.test('las seis siguen corriendo como su dueño y conservan el grant', async () => {
      const rows = await q(`select relname, coalesce(array_to_string(reloptions, ','), '') o,
                                   has_table_privilege('authenticated', oid, 'select') g
                              from pg_class where relnamespace = 'public'::regnamespace and relname = any($1)`, [VISTAS])
      assert.equal(rows.length, VISTAS.length)
      for (const r of rows) {
        assert.ok(!/security_invoker=(true|on)/.test(r.o), `\`${r.relname}\` pasó a invoker: Dirección leería permission denied`)
        assert.equal(r.g, true, `\`${r.relname}\` perdió el grant a authenticated`)
      }
    })
  } finally {
    await c.query('rollback').catch(() => {})
    c.release()
  }
})
