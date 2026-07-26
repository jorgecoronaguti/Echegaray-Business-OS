#!/usr/bin/env node
// SYNC de las CONDICIONES DE FINANCIAMIENTO → public.finanzas_condiciones_vigentes.
//
// POR QUÉ (25/07). La fuente única de tasas, costos y límites vigentes vive en
// public.condiciones_financieras y el motor la expone con fuente, vigencia y nivel de confianza, más lo
// que EXISTE como producto pero todavía no tiene tasa cargada (orquestador/lib/condiciones-financieras.mjs).
// Este paso PROYECTA esa lectura a la tabla singleton que lee la Web. Replica EXACTO lo que hace el tool
// finanzas.condiciones_financieras: condicionesVigentes + paramsParaMotor(faltan). 0 recálculo.
//
// No necesita Google (condicionesVigentes lee Supabase). Idempotente: upsert de la fila singleton id=1.
//
//   node orquestador/scripts/sync-condiciones-financieras.mjs
import { query, closePool } from '../lib/db.mjs'
import { condicionesVigentes, paramsParaMotor } from '../lib/condiciones-financieras.mjs'

async function main() {
  const conds = await condicionesVigentes({})
  const { faltan } = paramsParaMotor(conds)

  // Mismo shape que el tool finanzas.condiciones_financieras: la Web pinta esto tal cual.
  const condiciones = conds.map((c) => ({
    entidad: c.entidad, producto: c.producto, tipo: c.tipo_financiacion, moneda: c.moneda,
    tna: c.tna, cft: c.cft, limite_disponible: c.limite_disponible, saldo_utilizado: c.saldo_utilizado,
    vigencia_hasta: c.vigencia_hasta, nivel_confianza: c.nivel_confianza, fuente: c.fuente, observaciones: c.observaciones,
  }))

  const doc = {
    condiciones,
    faltan_datos: faltan,
    nota: 'Toda condición tiene fuente y nivel de confianza. Las tasas en null NO están inventadas: falta conseguirlas (ver faltan_datos).',
    generado_en: new Date().toISOString(),
  }

  await query(
    `insert into public.finanzas_condiciones_vigentes (id, condiciones, calculado_en, actualizado_en)
     values (1, $1::jsonb, now(), now())
     on conflict (id) do update set
       condiciones = excluded.condiciones,
       calculado_en = excluded.calculado_en,
       actualizado_en = now()`,
    [JSON.stringify(doc)],
  )

  console.log(`✓ condiciones materializadas · ${condiciones.length} vigentes · ${faltan.length} sin tasa cargada`)
}

main().then(() => closePool()).catch(async (e) => { console.error('sync-condiciones-financieras falló:', e?.message ?? e); await closePool(); process.exit(1) })
