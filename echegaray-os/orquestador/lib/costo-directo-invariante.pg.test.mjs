// LA INVARIANTE DE LA RECLASIFICACIÓN DE SUBCONTRATOS, SOBRE TODAS LAS OBRAS — SÓLO LECTURA.
//
// ═══ QUÉ DEFECTO ATRAPA ═══
//
// Que la 0810 pierda o duplique plata al separar Subcontratos de Materiales. Para CADA obra y CADA
// cliente (fila «sin obra»), materiales + subcontratos del cuerpo de la 0810 tiene que ser igual a lo que
// publica hoy la función viva. Estructura se saca en la 0815 y no entra en esta cuenta: en la primera
// versión estaba mezclada y le-comedor daba −350.000, sin que se viera que era otra regla.
//
// No crea nada: corre los cuerpos de la migración como SELECT en una transacción READ ONLY.
//
//     ORQ_PG_LECTURA=1 node --test orquestador/lib/costo-directo-invariante.pg.test.mjs

import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { closePool, getPool } from './db.mjs'

const MIG = readFileSync(join(import.meta.dirname, '..', '..', 'supabase', 'migrations', '20260915T0810_subcontratos_por_obra.sql'), 'utf8')
const obras = MIG.indexOf('CREATE OR REPLACE FUNCTION public.costo_de_obras_a_la_fecha')
const MATERIALES = `with ${MIG.slice(MIG.indexOf('  materiales as (', obras), MIG.indexOf('  -- ── MANO DE OBRA', obras)).trim().replace(/,$/, '')}
  select obra_id, coalesce(materiales, 0) + coalesce(subcontratos, 0) as directo from materiales`.replaceAll('p_obras', '$1::text[]')
const sinObra = MIG.indexOf('CREATE OR REPLACE FUNCTION public.compras_sin_obra_de_clientes')
const desde = MIG.indexOf('$function$', sinObra) + '$function$'.length
const SIN_OBRA = MIG.slice(desde, MIG.indexOf('$function$;', desde)).replaceAll('p_clientes', '$1::uuid[]')

const PERMITIDO = process.env.ORQ_PG_LECTURA === '1'
const hayBase = PERMITIDO && await getPool().query('select 1').then(() => true).catch(() => false)
after(() => closePool())

const directo = (x) => Number(x.materiales ?? 0) + Number(x.subcontratos ?? 0)

test('materiales + subcontratos no cambia en NINGUNA obra ni en la fila sin obra de NINGÚN cliente', { skip: !hayBase }, async () => {
  const c = await getPool().connect()
  try {
    await c.query('begin transaction read only')
    const ids = (await c.query('select distinct obra_id from public.compra_obra_asignada where obra_id is not null')).rows.map((r) => r.obra_id)
    assert.ok(ids.length > 0)
    const vivo = new Map(((await c.query('select public.costo_de_obras_a_la_fecha($1) j', [ids])).rows[0].j ?? []).map((x) => [x.obra_id, directo(x)]))
    const nuevo = new Map((await c.query(MATERIALES, [ids])).rows.map((r) => [r.obra_id, Number(r.directo)]))
    const obrasMal = ids.filter((id) => Math.abs((vivo.get(id) ?? 0) - (nuevo.get(id) ?? 0)) >= 0.01)
      .map((id) => `${id}: ${vivo.get(id) ?? 0} → ${nuevo.get(id) ?? 0}`)
    assert.deepEqual(obrasMal, [], 'la reclasificación cambió el costo directo de estas obras')

    const clientes = (await c.query('select cliente_id from public.cliente_panel')).rows.map((r) => r.cliente_id)
    const vivoSin = new Map(((await c.query('select public.compras_sin_obra_de_clientes($1) j', [clientes])).rows[0].j ?? []).map((x) => [x.cliente_id, directo(x)]))
    const nuevoSin = new Map(((await c.query(SIN_OBRA, [clientes])).rows[0] ?? {})[Object.keys((await c.query(SIN_OBRA, [clientes])).rows[0] ?? {})[0]]
      ?.map((x) => [x.cliente_id, directo(x)]) ?? [])
    const clientesMal = clientes.filter((id) => Math.abs((vivoSin.get(id) ?? 0) - (nuevoSin.get(id) ?? 0)) >= 0.01)
      .map((id) => `${id}: ${vivoSin.get(id) ?? 0} → ${nuevoSin.get(id) ?? 0}`)
    assert.deepEqual(clientesMal, [], 'la reclasificación cambió lo sin obra de estos clientes')
  } finally {
    await c.query('rollback').catch(() => {})
    c.release()
  }
})
