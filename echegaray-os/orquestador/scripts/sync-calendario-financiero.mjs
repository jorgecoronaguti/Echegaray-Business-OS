#!/usr/bin/env node
// SYNC del CALENDARIO FINANCIERO → public.finanzas_calendario.
//
// Corre el motor de Ingeniería Financiera (calendarioDiario + modeloLiquidez + recomendaciones) y
// guarda el resultado ya calculado para que la Web lo LEA. La lógica vive en el motor; esto sólo lo
// materializa. El worker tiene las credenciales de Google (lee las pestañas reales); la Web no.
//
//   node orquestador/scripts/sync-calendario-financiero.mjs [--dias 60]
import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { query, closePool } from '../lib/db.mjs'
import { calendarioDiario } from '../lib/calendario-financiero.mjs'
import { modeloLiquidez, recomendaciones } from '../lib/ingenieria-financiera.mjs'

const diasArg = Number((process.argv.find((a) => a.startsWith('--dias')) || '').split(/[ =]/)[1]) || 60

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const cal = await calendarioDiario({ google }, { dias: diasArg })
  const modelo = await modeloLiquidez({ google })
  const recs = recomendaciones(modelo)

  const payload = { ...cal, modelo, recomendaciones: recs, generado_en: new Date().toISOString() }
  // Se guarda un snapshot nuevo y se conservan sólo los últimos 5 (histórico corto para depurar).
  await query('insert into public.finanzas_calendario (payload) values ($1::jsonb)', [JSON.stringify(payload)])
  await query('delete from public.finanzas_calendario where id not in (select id from public.finanzas_calendario order by generado_en desc limit 5)')

  const conMov = cal.dias.filter((d) => d.movimientos.length > 0).length
  console.log(`calendario materializado: ${cal.dias.length} días (${conMov} con movimientos), ${recs.length} recomendaciones, caja inicial $${Math.round(cal.caja_inicial).toLocaleString('es-AR')}`)
}

main().then(() => closePool()).catch(async (e) => { console.error('sync-calendario-financiero falló:', e?.message ?? e); await closePool(); process.exit(1) })
