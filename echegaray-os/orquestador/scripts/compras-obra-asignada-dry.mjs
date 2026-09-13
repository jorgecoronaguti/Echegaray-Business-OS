#!/usr/bin/env node
// LA ASIGNACIÓN COMPRAS → OBRA, EN SECO. Lee `compra_sheet` y los catálogos de Postgres, corre la
// MISMA regla que escribe `sync-compras.mjs` y muestra a dónde iría cada peso. No escribe nada: ni en
// la base ni en el Sheet.
//
//   node orquestador/scripts/compras-obra-asignada-dry.mjs [--cliente "SAN FRANCISCO,MESSINA"] [--detalle]

import { query, closePool } from '../lib/db.mjs'
import { asignadorDeCompras, catalogosDeAsignacion, planDeAsignacion } from '../lib/compras-obra-asignada.mjs'

const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : null }
const CLIENTES = (arg('cliente') ?? 'SAN FRANCISCO,MESSINA,LA ESTRELLA,QUATTROPANI,ARCOR').split(',').map((s) => s.trim())
const DETALLE = process.argv.includes('--detalle')
const $ = (n) => Math.round(n).toLocaleString('es-AR')

async function main() {
  const catalogos = await catalogosDeAsignacion(query)
  const { rows: compras } = await query(
    `select fila, sheet_id, obra_texto, detalle_obra, total::float8 total, importe::float8 importe, estado,
            anulada, to_char(fecha, 'YYYY-MM-DD') fecha from public.compra_sheet`)
  const plan = planDeAsignacion(compras, asignadorDeCompras(catalogos))
  const porRef = new Map(compras.map((c) => [String(c.sheet_id ?? c.fila), c]))
  const nombre = new Map(catalogos.canonicas.map((o) => [o.id, o.nombre]))

  for (const cliente of CLIENTES) {
    const filas = plan.filter((p) => p.cliente === cliente)
    const grupos = new Map()
    for (const p of filas) {
      const c = porRef.get(p.referencia)
      const k = p.obra_id ?? '(sin obra asignada)'
      const g = grupos.get(k) ?? { n: 0, total: 0, via: new Set(), detalles: new Map() }
      g.n += 1; g.total += Number(c.total ?? c.importe ?? 0); g.via.add(p.via)
      const d = (c.detalle_obra ?? '(vacía)').slice(0, 40)
      g.detalles.set(d, (g.detalles.get(d) ?? 0) + Number(c.total ?? 0))
      grupos.set(k, g)
    }
    const total = [...grupos.values()].reduce((s, g) => s + g.total, 0)
    console.log(`\n## ${cliente} — ${filas.length} filas · $ ${$(total)}`)
    for (const [k, g] of [...grupos].sort((a, b) => b[1].total - a[1].total)) {
      console.log(`  ${(nombre.get(k) ?? k).padEnd(42)} ${String(g.n).padStart(4)} filas  $ ${$(g.total).padStart(13)}  ${[...g.via].join(',')}`)
      if (DETALLE || k === '(sin obra asignada)') {
        for (const [d, t] of [...g.detalles].sort((a, b) => b[1] - a[1]).slice(0, 8)) console.log(`      · ${d.padEnd(40)} $ ${$(t)}`)
      }
    }
  }
  await closePool()
}
main().catch(async (e) => { console.error('dry falló:', e.message); await closePool().catch(() => {}); process.exit(1) })
