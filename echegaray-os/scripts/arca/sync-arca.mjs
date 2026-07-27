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

// FRESCURA DE "IVA 2026" DESDE AFIPSDK (24/07). El dueño: "si tenemos afipsdk usalo". La fuente
// "IVA 2026 (Libro IVA Ventas mensual)" apunta a una carpeta de Drive con los libros en PDF, que
// frena en Mayo. Pero AfipSDK ya trajo las VENTAS (libro E) hasta mediados de julio. Entonces la
// cobertura honesta de los datos de ventas que el OS TIENE es la última emisión del libro E — no la
// fecha del PDF viejo. Se registra por nombre; recalcular_frescura_fuentes decide el estado.
try {
  const { query, closePool } = await import('../../orquestador/lib/db.mjs')
  const { registrarSincronizacion, registrarIngesta, FUENTES_INGESTA } = await import('../../orquestador/lib/registrar-sincronizacion.mjs')
  const { rows } = await query("select max(fecha_emision) mx from public.comprobantes_arca where tipo_libro = 'E'")
  const mx = rows?.[0]?.mx
  if (mx) {
    const iso = new Date(mx).toISOString().slice(0, 10)
    const fr = await registrarSincronizacion({ query }, { nombre: 'IVA 2026 (Libro IVA Ventas mensual)', coberturaHasta: iso })
    console.log(fr.ok ? `[arca-sync] frescura IVA 2026: ventas hasta ${iso} → ${fr.estado}` : `[arca-sync] frescura no registrada: ${fr.motivo}`)
  }
  // FRESCURA DEL LADO COMPRAS (26/07). Hasta ahora sólo se registraba la frescura de VENTAS (libro E).
  // Pero los comprobantes RECIBIDOS (libro R) son los que alimentan costo y crédito fiscal — el feed
  // más importante para caja y margen — y no estaba catalogado como fuente. Se asegura la fila y se
  // declara la cobertura real (última emisión de un comprobante de compras que el OS tiene).
  const { rows: rc } = await query("select max(fecha_emision) mx from public.comprobantes_arca where tipo_libro = 'R'")
  const mxc = rc?.[0]?.mx
  const isoC = mxc ? new Date(mxc).toISOString().slice(0, 10) : undefined
  const frc = await registrarIngesta({ query }, { declaracion: FUENTES_INGESTA.arcaCompras, coberturaHasta: isoC })
  console.log(frc.ok
    ? `[arca-sync] frescura ARCA compras: ${isoC ? `hasta ${isoC} ` : ''}→ ${frc.estado}${frc.creada ? ' (fuente catalogada por primera vez)' : ''}`
    : `[arca-sync] frescura ARCA compras no registrada: ${frc.motivo}`)
  await closePool()
} catch (e) {
  console.error('[arca-sync] frescura no registrada:', String(e?.message ?? e).slice(0, 160))
}
console.log('[arca-sync] listo')
