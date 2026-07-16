#!/usr/bin/env node
// SYNC MENSUAL de comprobantes ARCA → Supabase. Baja el año en curso hasta hoy (compras R +
// ventas E) vía AfipSDK (clave fiscal) y los ingiere en public.comprobantes_arca. Idempotente:
// el ingest hace on conflict, así que correrlo de nuevo sólo agrega lo nuevo. Pensado para un
// timer mensual (echegaray-arca-sync.timer). No usa la API de Anthropic; usa la cuota de AfipSDK.
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const run = promisify(execFile)
const DIR = dirname(fileURLToPath(import.meta.url))
const NODE = process.execPath
const dd = (n) => String(n).padStart(2, '0')
const hoy = new Date()
const anio = hoy.getFullYear()
const desde = `01/01/${anio}`
const hasta = `${dd(hoy.getDate())}/${dd(hoy.getMonth() + 1)}/${anio}`

async function fetchTipo(tipo) {
  try {
    const { stdout } = await run(NODE, [join(DIR, 'afipsdk-comprobantes.mjs'), tipo, desde, hasta], { timeout: 360000 })
    const linea = stdout.split('\n').filter(Boolean).slice(-4).join(' ')
    console.log(`[arca-sync] ${tipo} ${desde}–${hasta}: ${linea.slice(0, 140)}`)
  } catch (e) {
    console.error(`[arca-sync] ${tipo} falló: ${String(e?.stderr || e?.message).slice(0, 200)}`)
  }
}

await fetchTipo('R')
await fetchTipo('E')
try {
  const { stdout } = await run(NODE, [join(DIR, 'ingest-comprobantes.mjs')], { timeout: 120000 })
  console.log('[arca-sync] ingest:', stdout.split('\n').filter((l) => /TOTAL/.test(l)).join(' | ') || 'ok')
} catch (e) {
  console.error('[arca-sync] ingest falló:', String(e?.stderr || e?.message).slice(0, 200))
  process.exit(1)
}
console.log('[arca-sync] listo')
