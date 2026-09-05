#!/usr/bin/env node
// LAS ANOMALÍAS DE COMPRAS Y FINANZAS, CONTRA LOS DATOS REALES. No escribe nada: informa.
//
// Cada hallazgo dice el valor observado, contra qué se lo comparó, cuánto se aparta y con qué
// evidencia. Una alerta que no explica su origen se ignora a la semana.
//
//   node orquestador/scripts/anomalias-informe.mjs [--tope 12]

import { query } from '../lib/db.mjs'
import { detectarAnomalias, duplicadosProbables } from '../lib/ml/anomalias.mjs'

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? Number(process.argv[i + 1]) : d }
const TOPE = arg('--tope', 12)
const $ = (n) => `$${Math.round(n).toLocaleString('es-AR')}`

async function main() {
  // ── COMPRAS: el importe de una compra contra el historial de ESE proveedor y ESA familia ──
  // Comparar contra todas las compras no detecta nada: un balde de pintura y una losa de hormigón
  // no son comparables, y la banda que los contiene a los dos no excluye a nadie.
  const c = await query(`
    select fila, proveedor, familia_material, concepto, fecha, total, comprobante
      from public.compra_sheet
     where total is not null and total > 0 and proveedor is not null and fecha is not null
     order by fecha`)

  const obs = c.rows.map((f) => ({
    id: f.fila, clave: `${f.proveedor}|${f.familia_material ?? '—'}`, valor: Number(f.total),
    fecha: f.fecha, entidad: f.proveedor, etiqueta: `${f.proveedor} · ${String(f.concepto ?? '').slice(0, 34)}`,
  }))
  const anom = detectarAnomalias(obs, { tipo: 'compra.importe' })

  console.log(`COMPRAS    ${c.rows.length} filas · ${new Set(obs.map((o) => o.clave)).size} combinaciones proveedor×familia`)
  console.log(`           ${anom.length} importes fuera de rango contra su propio historial\n`)
  for (const a of anom.slice(0, TOPE)) {
    console.log(`  [${a.severidad.toUpperCase().padEnd(5)}] fila ${String(a.id).padStart(4)}  ${String(a.etiqueta).slice(0, 46).padEnd(47)}`)
    console.log(`           ${a.porQue}`)
  }

  // ── DUPLICADOS PROBABLES ──
  const dup = duplicadosProbables(c.rows.map((f) => ({
    // EL COMPROBANTE ES LA MEJOR PRUEBA DE QUE NO SON EL MISMO GASTO. Pasarlo en `null` hacía que
    // el detector no pudiera distinguir dos facturas reales del mismo importe de una carga
    // duplicada, y todas salían con el mismo mensaje.
    id: f.fila, entidad: f.proveedor, importe: Number(f.total), fecha: f.fecha, comprobante: f.comprobante || null,
  })))
  console.log(`\nDUPLICADOS ${dup.length} pares con el mismo proveedor y el mismo importe a menos de 7 días`)
  for (const d of dup.slice(0, TOPE)) {
    console.log(`  [${d.severidad.toUpperCase().padEnd(5)}] filas ${d.a} y ${d.b} · ${String(d.entidad).slice(0, 28).padEnd(29)} ${$(d.importe).padStart(14)} · ${d.dias} día(s)`)
  }

  const total = dup.reduce((s, d) => s + d.importe, 0)
  if (dup.length) console.log(`\n           Si TODOS fueran duplicados serían ${$(total)}. Ninguno se afirma: cada par lo mira una persona.`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then(() => process.exit(0)).catch((e) => { console.error('ERROR:', e.stack || e.message); process.exit(1) })
}
