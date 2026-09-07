#!/usr/bin/env node
// ¿Cuánto disco está gastando la instancia de Supabase AHORA, y cuánto de eso es swap?
//
// POR QUÉ (07/09/2026). Supabase avisó «running out of Disk IO Budget». Postgres decía hit rate 100%
// y 17.000 bloques leídos en dos meses: el disco no lo gastaba la base sino la MEMORIA de la
// instancia (Nano, 406 MB): 224 MB de shared_buffers + el stack de Supabase no entran, y el kernel
// pagina código y buffers contra el disco raíz a 5–8 MB/s y 250–500 IOPS, arriba del baseline de
// Nano (5 MB/s, 250 IOPS). Ninguna vista de pg_stat lo muestra; el endpoint de métricas de la
// instancia sí. Este script toma dos muestras y dice la tasa contra el baseline.
//
//   node orquestador/scripts/disk-io-supabase.mjs [--segundos 90] [--baseline-mbs 5 --baseline-iops 250]
//   sale 1 si la instancia está por encima del baseline (el presupuesto se está gastando), 2 si no pudo medir.
import '../lib/config.mjs'

export const BASELINE_NANO = { mbs: 5, iops: 250 }

/** Parsea el texto Prometheus a { nombre[:device] → valor }. Sólo lo que hace falta. */
export function parsearMetricas(texto) {
  const out = {}
  const re = /^(node_disk_(?:read|written)_bytes_total|node_disk_(?:reads|writes)_completed_total|node_vmstat_pswpin|node_vmstat_pswpout|node_vmstat_pgmajfault|node_memory_(?:SwapTotal|SwapFree|MemTotal|MemAvailable)_bytes|node_filesystem_size_bytes)(\{[^}]*\})? ([0-9.eE+-]+)$/
  for (const linea of texto.split('\n')) {
    const m = re.exec(linea)
    if (!m) continue
    const etiquetas = m[2] || ''
    if (m[1] === 'node_filesystem_size_bytes') {
      const dev = /device="\/dev\/([^"]+)"/.exec(etiquetas)
      const mp = /mountpoint="([^"]+)"/.exec(etiquetas)
      if (dev && mp) out[`fs:${mp[1]}`] = dev[1].replace(/p\d+$/, '') // nvme0n1p2 → nvme0n1
      continue
    }
    const dev = /device="([^"]+)"/.exec(etiquetas)
    out[m[1] + (dev ? `:${dev[1]}` : '')] = Number(m[3])
  }
  return out
}

/** Tasas por segundo entre dos muestras. `datos` es el disco de /data (Postgres); `raiz`, el resto. */
export function tasas(a, b, segundos) {
  const raizDev = b['fs:/'] || 'nvme0n1'
  const datosDev = b['fs:/data'] || 'nvme1n1'
  const d = (k) => (b[k] - a[k]) / segundos
  const disco = (dev) => ({
    lectura_mbs: d(`node_disk_read_bytes_total:${dev}`) / 1e6,
    escritura_mbs: d(`node_disk_written_bytes_total:${dev}`) / 1e6,
    iops: d(`node_disk_reads_completed_total:${dev}`) + d(`node_disk_writes_completed_total:${dev}`),
  })
  const raiz = disco(raizDev), datos = disco(datosDev)
  return {
    raiz, datos,
    total_mbs: raiz.lectura_mbs + raiz.escritura_mbs + datos.lectura_mbs + datos.escritura_mbs,
    total_iops: raiz.iops + datos.iops,
    swap_in_mbs: d('node_vmstat_pswpin') * 4096 / 1e6,
    swap_out_mbs: d('node_vmstat_pswpout') * 4096 / 1e6,
    fallos_mayores_s: d('node_vmstat_pgmajfault'),
    swap_usado_mb: (b.node_memory_SwapTotal_bytes - b.node_memory_SwapFree_bytes) / 1048576,
    mem_total_mb: b.node_memory_MemTotal_bytes / 1048576,
    mem_disponible_mb: b.node_memory_MemAvailable_bytes / 1048576,
  }
}

/** Rojo si la tasa supera el baseline: ahí el presupuesto de burst se consume en vez de recargarse.
 *  Sin medida (NaN: faltó una métrica) o con dos muestras idénticas (el endpoint cachea ~1 min),
 *  el control NO dice verde: dice que no pudo mirar. */
export function veredicto(t, baseline = BASELINE_NANO) {
  if (!Number.isFinite(t.total_mbs) || !Number.isFinite(t.total_iops)) return { sobre_baseline: null, motivo: 'faltan métricas' }
  if (t.total_mbs === 0 && t.total_iops === 0 && t.fallos_mayores_s === 0) return { sobre_baseline: null, motivo: 'muestras idénticas: ampliar --segundos' }
  const sobre = t.total_mbs > baseline.mbs || t.total_iops > baseline.iops
  return { sobre_baseline: sobre, uso_mbs_pct: Math.round(100 * t.total_mbs / baseline.mbs), uso_iops_pct: Math.round(100 * t.total_iops / baseline.iops) }
}

async function muestra() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('faltan SUPABASE_URL (o NEXT_PUBLIC_SUPABASE_URL) / SUPABASE_SERVICE_ROLE_KEY')
  const r = await fetch(`${url}/customer/v1/privileged/metrics`, { headers: { Authorization: 'Basic ' + Buffer.from(`service_role:${key}`).toString('base64') } })
  if (!r.ok) throw new Error(`métricas ${r.status}`)
  return parsearMetricas(await r.text())
}

function arg(nombre, def) { const i = process.argv.indexOf(nombre); return i > 0 ? Number(process.argv[i + 1]) : def }

async function main() {
  const segundos = arg('--segundos', 90) // el endpoint cachea ~1 min: menos de eso devuelve dos muestras iguales
  const baseline = { mbs: arg('--baseline-mbs', BASELINE_NANO.mbs), iops: arg('--baseline-iops', BASELINE_NANO.iops) }
  const a = await muestra()
  await new Promise((r) => setTimeout(r, segundos * 1000))
  const b = await muestra()
  const t = tasas(a, b, segundos)
  const v = veredicto(t, baseline)
  const f = (n) => n.toFixed(2)
  console.log(`disco raíz  ${f(t.raiz.lectura_mbs)} MB/s leídos · ${f(t.raiz.escritura_mbs)} MB/s escritos · ${t.raiz.iops.toFixed(0)} IOPS`)
  console.log(`disco datos ${f(t.datos.lectura_mbs)} MB/s leídos · ${f(t.datos.escritura_mbs)} MB/s escritos · ${t.datos.iops.toFixed(0)} IOPS`)
  console.log(`swap in ${f(t.swap_in_mbs)} MB/s · out ${f(t.swap_out_mbs)} MB/s · fallos mayores ${t.fallos_mayores_s.toFixed(0)}/s · swap usado ${t.swap_usado_mb.toFixed(0)} MB · RAM ${t.mem_disponible_mb.toFixed(0)}/${t.mem_total_mb.toFixed(0)} MB disponible`)
  if (v.sobre_baseline === null) { console.log(`NO SE PUDO MEDIR: ${v.motivo}`); process.exit(2) }
  console.log(`TOTAL ${f(t.total_mbs)} MB/s (${v.uso_mbs_pct}% del baseline ${baseline.mbs}) · ${t.total_iops.toFixed(0)} IOPS (${v.uso_iops_pct}% de ${baseline.iops}) → ${v.sobre_baseline ? 'SOBRE EL BASELINE: el presupuesto se gasta' : 'bajo el baseline: el presupuesto se recarga'}`)
  process.exit(v.sobre_baseline ? 1 : 0)
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) main().catch((e) => { console.error(e.message); process.exit(2) })
