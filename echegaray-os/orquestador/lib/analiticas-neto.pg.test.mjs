// EL CONSUMO NETO DE IVA Y LA RLS DE PRESUPUESTOS, CONTRA LA BASE REAL (migración 20260917T1900).
//
//   1 · Quattropani: materiales netos = 30.878.408,49 (14 F A por importe). Si el IVA vuelve a entrar,
//       dan 37.188.800,09 y este test lo dice.
//   2 · La diferencia con/sin IVA de cada obra es EXACTAMENTE Σ (total − importe) de los comprobantes que
//       discriminan IVA, proporcional a lo que va a la fecha. En Quattropani eso es su IVA; en le-comedor
//       incluye 175.271,66 de percepciones que Compras cargó fuera del importe.
//   3 · Lo pagado no cambia: `costo_de_obras_a_la_fecha(text[])` da lo mismo antes y después.
//   4 · RLS: un jefe de obra lee 0 presupuestos; dirección, todos los aprobados.
//
// Todo dentro de una transacción que termina en ROLLBACK. Sin base, se salta.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getPool } from './db.mjs'

const MIGRACION = readFileSync(join(import.meta.dirname, '..', '..', 'supabase', 'migrations',
  '20260917T1900_analiticas_consumo_neto_de_iva.sql'), 'utf8')
const hayBase = await getPool().query('select 1').then(() => true).catch(() => false)

test('consumo neto de IVA y RLS de presupuestos', { skip: !hayBase }, async (t) => {
  const c = await getPool().connect()
  const q = async (sql, params) => (await c.query(sql, params)).rows
  const como = async (rol) => {
    const p = (await q('select id from perfiles where rol = $1 limit 1', [rol]))[0]
    assert.ok(p, `no hay perfil ${rol}`)
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: p.id, role: 'authenticated' })])
  }
  try {
    await c.query('begin')
    // LO PAGADO SE LEE ANTES Y DESPUÉS CON LA MISMA SESIÓN: la respuesta depende del rol (tarifas).
    await como('direccion')
    await c.query('set local role authenticated')
    const pagadoAntes = (await q(`select public.costo_de_obras_a_la_fecha(array['quattropani','le-comedor']) j`))[0].j
    await c.query('reset role')
    await c.query(MIGRACION.replace("set local lock_timeout = '5s';", ''))
    await c.query('set local role authenticated')
    const obras = async (neto) => new Map((await q(
      `select x->>'obra_id' id, (x->>'materiales')::numeric mat from jsonb_array_elements(public.costo_de_obras_a_la_fecha(array['quattropani','le-comedor'], null, null, $1)) x`, [neto])).map((r) => [r.id, Number(r.mat)]))
    const bruto = await obras(false)
    const neto = await obras(true)

    await t.test('Quattropani: materiales netos por importe de sus F A', () => {
      assert.ok(Math.abs(neto.get('quattropani') - 30878408.49) < 1, `neto ${neto.get('quattropani')}`)
      assert.ok(bruto.get('quattropani') > neto.get('quattropani') + 6e6, 'el IVA volvió a entrar')
    })

    await t.test('la diferencia es Σ (total − importe) de los comprobantes que discriminan IVA', async () => {
      const esperado = new Map((await q(`
        select f.obra_id id, sum((f.total - c.importe) * case when f.total = 0 then 1 else f.a_la_fecha / f.total end) d
          from public.costo_de_obra_filas(array['quattropani','le-comedor']) f
          join public.costos_obra c on c.origen = 'compras_sheet' and c.referencia_externa = f.referencia
         where not f.es_subcontrato and public.costo_neto_de_iva(f.total, c.importe, c.iva, c.tipo) <> f.total
         group by 1`)).map((r) => [r.id, Number(r.d)]))
      for (const id of ['quattropani', 'le-comedor']) {
        assert.ok(Math.abs((bruto.get(id) - neto.get(id)) - esperado.get(id)) < 1, id)
      }
    })

    await t.test('lo pagado no cambia', async () => {
      const despues = (await q(`select public.costo_de_obras_a_la_fecha(array['quattropani','le-comedor']) j`))[0].j
      assert.deepEqual(despues, pagadoAntes)
    })

    await t.test('RLS: jefe de obra no lee presupuestos; dirección sí', async () => {
      const n = async () => Number((await q(`select count(*) n from presupuestos where estado = 'aprobado'`))[0].n)
      assert.ok(await n() > 0)
      await c.query('reset role')
      await como('jefe_obra')
      await c.query('set local role authenticated')
      assert.equal(await n(), 0)
    })
  } finally {
    await c.query('rollback').catch(() => {})
    c.release()
  }
})
