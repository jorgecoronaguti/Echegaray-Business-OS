#!/usr/bin/env node
// Ingiere los comprobantes ARCA extraídos (out/comprobantes-<t>-*.json) a la tabla
// public.comprobantes_arca del OS. Idempotente: on conflict (tipo_libro,cae,numero).
// Parsea números en formato es_AR ("1.234,50" -> 1234.50; "" -> 0).
//   node scripts/arca/ingest-comprobantes.mjs                 # todos los out/*.json
//   node scripts/arca/ingest-comprobantes.mjs out/comprobantes-R-01062026-30062026.json
import { readFileSync, readdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { query, closePool } from '../../orquestador/lib/db.mjs'

const DIR = dirname(fileURLToPath(import.meta.url))
const OUT = join(DIR, 'out')

// "1.234,50" -> 1234.5 ; "" -> 0 (miles con punto, decimal con coma, es_AR)
const num = (s) => {
  if (s == null || String(s).trim() === '') return 0
  const n = Number(String(s).replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}
const ALIC = ['2,5', '5', '10,5', '21', '27']
const periodoDe = (f) => (f && /^\d{4}-\d{2}/.test(f) ? f.slice(0, 7) : null)

async function ingestFile(file) {
  const tipo = /comprobantes-([ER])-/.exec(file)?.[1]
  if (!tipo) { console.log('salteado (no es comprobantes-R/E):', file); return 0 }
  const arr = JSON.parse(readFileSync(join(OUT, file.replace(/^out\//, '')), 'utf8'))
  if (!Array.isArray(arr)) { console.log('salteado (no es array):', file); return 0 }
  let n = 0
  for (const c of arr) {
    const alic = {}
    for (const a of ALIC) {
      const iva = num(c[`IVA ${a}%`]); const neto = num(c[`Imp. Neto Gravado IVA ${a}%`])
      if (iva || neto) alic[a.replace(',', '.')] = { neto, iva }
    }
    const fecha = c['Fecha de Emisión'] || null
    await query(
      `insert into public.comprobantes_arca
        (tipo_libro, fecha_emision, tipo_comprobante, punto_venta, numero, cae, emisor_cuit, emisor_nombre,
         receptor_cuit, moneda, neto_gravado, neto_no_gravado, exento, total_iva, otros_tributos, imp_total,
         iva_por_alicuota, periodo, origen)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,'afipsdk')
       on conflict (tipo_libro, cae, numero) do update set
         imp_total=excluded.imp_total, total_iva=excluded.total_iva, neto_gravado=excluded.neto_gravado,
         iva_por_alicuota=excluded.iva_por_alicuota`,
      [tipo, fecha, c['Tipo de Comprobante'] || null, c['Punto de Venta'] || null,
       c['Número Desde'] || null, c['Cód. Autorización'] || null, c['Nro. Doc. Emisor'] || null,
       c['Denominación Emisor'] || null, c['Nro. Doc. Receptor'] || null, c['Moneda'] || '$',
       num(c['Imp. Neto Gravado Total']), num(c['Imp. Neto No Gravado']), num(c['Imp. Op. Exentas']),
       num(c['Total IVA']), num(c['Otros Tributos']), num(c['Imp. Total']),
       JSON.stringify(alic), periodoDe(fecha)])
    n++
  }
  return n
}

async function main() {
  const args = process.argv.slice(2)
  const files = args.length ? args : readdirSync(OUT).filter((f) => /^comprobantes-[ER]-.*\.json$/.test(f))
  let total = 0
  for (const f of files) { const n = await ingestFile(f); console.log(`  ${f}: ${n} comprobantes`); total += n }
  // marcar salud de la integración
  await query(`update public.integraciones set ultimo_sync=now(), salud='ok' where slug='arca'`).catch(() => {})
  console.log(`TOTAL ingerido: ${total}`)
  await closePool()
}
main().catch((e) => { console.error('ingest falló:', e.message); process.exit(1) })
