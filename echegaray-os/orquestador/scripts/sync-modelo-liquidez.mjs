#!/usr/bin/env node
// SYNC del MODELO ÚNICO DE LIQUIDEZ → public.finanzas_modelo_liquidez.
//
// POR QUÉ (25/07). El motor de Ingeniería Financiera arma un modelo único de liquidez + recomendaciones
// (orquestador/lib/ingenieria-financiera.mjs). El sync-calendario-financiero YA lo calcula —con la
// versión CORRECTA (con vencidoComercial de Compras)— y lo guarda dentro del payload del calendario.
// Este paso PROYECTA ese modelo a su propia tabla singleton para que la Web lo muestre como una salida
// independiente del motor, sin re-leer el Sheet ni recalcular un peso: una sola cifra, una sola fuente.
//
// Corre DESPUÉS de sync-calendario-financiero. No necesita Google: lee el snapshot que el calendario ya
// materializó. Idempotente: upsert de la fila singleton id=1.
//
//   node orquestador/scripts/sync-modelo-liquidez.mjs
import { query, closePool } from '../lib/db.mjs'
import { registrarFotoSeguro } from '../lib/registro-aprendizaje.mjs'

async function main() {
  const { rows } = await query(
    'select payload, generado_en from public.finanzas_calendario order by generado_en desc limit 1',
  )
  if (!rows.length) {
    console.log('modelo de liquidez: todavía no hay calendario materializado — no se actualiza el snapshot')
    return
  }
  const payload = rows[0].payload || {}
  const modelo = payload.modelo
  const recomendaciones = payload.recomendaciones || []
  if (!modelo) {
    console.log('modelo de liquidez: el calendario no trae el modelo — no se actualiza el snapshot')
    return
  }

  // calculado_en = el generado_en del calendario, así la Web muestra la MISMA marca de tiempo del
  // cálculo real (no la del proyecto). Una cifra, una fecha.
  const calculadoEn = rows[0].generado_en || payload.generado_en || new Date().toISOString()

  await query(
    `insert into public.finanzas_modelo_liquidez (id, modelo, recomendaciones, calculado_en, actualizado_en)
     values (1, $1::jsonb, $2::jsonb, $3, now())
     on conflict (id) do update set
       modelo = excluded.modelo,
       recomendaciones = excluded.recomendaciones,
       calculado_en = excluded.calculado_en,
       actualizado_en = now()`,
    [JSON.stringify(modelo), JSON.stringify(recomendaciones), calculadoEn],
  )

  // CAJA NEGRA (F0): congela el modelo append-only, con la misma marca de cálculo que la foto vigente.
  await registrarFotoSeguro({}, { fuente: 'modelo', foto: modelo, calculadoEn })

  const caja = modelo.disponible?.estado === 'ok' ? modelo.disponible.caja_hoy : null
  const colchon = modelo.colchon_total
  console.log(`✓ modelo de liquidez materializado · caja ${caja == null ? 's/d' : '$' + Math.round(caja).toLocaleString('es-AR')} · colchón ${colchon == null ? 's/d' : '$' + Math.round(colchon).toLocaleString('es-AR')} · ${recomendaciones.length} recomendaciones`)
}

main().then(() => closePool()).catch(async (e) => { console.error('sync-modelo-liquidez falló:', e?.message ?? e); await closePool(); process.exit(1) })
