#!/usr/bin/env node
// CUÁNTA PLATA DE OBRA NO LLEGA A LA PANTALLA — la tabla para decidir, ordenada por impacto.
//
// La base publica desde el 18/09/2026 cuatro rubros (`materiales`, `subcontratistas`, `otros`,
// mano de obra). El código que corre en producción (main @ f4ef261a, desplegado el 17/09) lee tres:
// la clave `otros` vuelve en el JSON y nadie la suma. Esta tabla dice, obra por obra, cuánto costo
// real quedó fuera de la pantalla, desde qué comprobante, y cuánto pesa sobre el costo de esa obra.
//
// SÓLO LECTURA. node orquestador/scripts/diagnostico/costo-por-obra-cuanto-falta-en-pantalla.mjs
import { query, closePool } from '../../lib/db.mjs'
const $ = (n) => Math.round(Number(n ?? 0)).toLocaleString('es-AR')
const { rows: obras } = await query(
  `select id, codigo, nombre, estado from public.obra_canonica where fusionada_en is null and codigo not like 'ZZ-%' order by codigo`)
const ids = obras.map((o) => o.id); const meta = new Map(obras.map((o) => [o.id, o]))

const { rows } = await query(`
  select f.obra_id,
         sum(f.a_la_fecha) filter (where r.rubro = 'materiales')      as materiales,
         sum(f.a_la_fecha) filter (where r.rubro = 'subcontratistas') as subcontratos,
         coalesce(sum(f.a_la_fecha) filter (where r.rubro = 'otros'), 0) as otros,
         min(f.fecha)      filter (where r.rubro = 'otros')           as otros_desde,
         max(f.fecha)      filter (where r.rubro = 'otros')           as otros_hasta,
         count(*)          filter (where r.rubro = 'otros')::int      as n_otros
    from public.costo_de_obra_filas_iva($1, null, false) f
    left join public.compra_sheet s on coalesce(s.sheet_id::text, s.fila::text) = f.referencia
    cross join lateral (select public.rubro_de_compra(f.es_subcontrato, s.familia_material, s.sub_rubro) as rubro) r
   group by 1`, [ids])

const filas = rows.map((r) => {
  const enPantalla = Number(r.materiales ?? 0) + Number(r.subcontratos ?? 0)
  const real = enPantalla + Number(r.otros)
  return { ...r, enPantalla, real, pct: real === 0 ? 0 : (Number(r.otros) / real) * 100 }
}).filter((r) => Number(r.otros) !== 0).sort((a, b) => Number(b.otros) - Number(a.otros))

console.log(`${'obra'.padEnd(36)}${'estado'.padEnd(10)}${'en pantalla'.padStart(14)}${'costo real'.padStart(14)}${'falta'.padStart(13)}${'%'.padStart(7)}${'n'.padStart(4)}  desde → hasta`)
for (const r of filas) {
  const o = meta.get(r.obra_id)
  console.log(`${`${o.codigo} ${o.nombre}`.slice(0, 35).padEnd(36)}${String(o.estado).padEnd(10)}${$(r.enPantalla).padStart(14)}${$(r.real).padStart(14)}`
    + `${$(r.otros).padStart(13)}${r.pct.toFixed(1).padStart(7)}${String(r.n_otros).padStart(4)}  ${String(r.otros_desde).slice(0, 10)} → ${String(r.otros_hasta).slice(0, 10)}`)
}
const t = filas.reduce((s, r) => s + Number(r.otros), 0)
const tp = filas.reduce((s, r) => s + r.enPantalla, 0)
console.log(`\nTOTAL fuera de la pantalla: ${$(t)} sobre ${$(tp + t)} de costo de compras (${((t / (tp + t)) * 100).toFixed(1)} %)`)
await closePool()
