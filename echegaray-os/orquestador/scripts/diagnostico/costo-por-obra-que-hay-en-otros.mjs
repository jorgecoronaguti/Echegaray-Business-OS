#!/usr/bin/env node
// QUÉ HAY EN EL RUBRO «OTROS» QUE LA AUDITORÍA NO CONOCE — por familia, con proveedor y plata.
//
// La migración 20260918T0900 partió el gasto en CUATRO rubros y sacó de «materiales» el alquiler de
// equipos, los servicios de obra, el combustible y los honorarios. La auditoría de costo por obra
// sigue contando DOS cubetas. Este script muestra la plata que quedó en el rubro nuevo, obra por obra
// y familia por familia: es lo que explica 12 de las 14 obras en rojo.
//
// SÓLO LECTURA. node orquestador/scripts/diagnostico/costo-por-obra-que-hay-en-otros.mjs
import { query, closePool } from '../../lib/db.mjs'
const $ = (n) => Math.round(Number(n ?? 0)).toLocaleString('es-AR')
const { rows: obras } = await query(
  `select id, codigo, nombre from public.obra_canonica where fusionada_en is null and codigo not like 'ZZ-%'`)
const ids = obras.map((o) => o.id); const nom = new Map(obras.map((o) => [o.id, `${o.codigo} ${o.nombre}`]))

const { rows } = await query(`
  select f.obra_id, coalesce(s.familia_material, '(sin familia) · ' || coalesce(s.sub_rubro, '—')) as familia,
         count(*)::int as n, sum(f.a_la_fecha) as plata,
         (array_agg(f.proveedor order by f.a_la_fecha desc))[1:3] as top
    from public.costo_de_obra_filas_iva($1, null, false) f
    left join public.compra_sheet s on coalesce(s.sheet_id::text, s.fila::text) = f.referencia
   where public.rubro_de_compra(f.es_subcontrato, s.familia_material, s.sub_rubro) = 'otros'
   group by 1, 2 order by 4 desc`, [ids])

let tot = 0
for (const r of rows) { tot += Number(r.plata) }
console.log(`«otros» en todas las obras: ${$(tot)} en ${rows.reduce((s, r) => s + r.n, 0)} comprobantes\n`)
console.log(`${'obra'.padEnd(36)}${'familia'.padEnd(46)}${'n'.padStart(4)}${'plata'.padStart(14)}  proveedores`)
for (const r of rows) {
  console.log(`${String(nom.get(r.obra_id)).slice(0, 35).padEnd(36)}${String(r.familia).slice(0, 45).padEnd(46)}`
    + `${String(r.n).padStart(4)}${$(r.plata).padStart(14)}  ${r.top.filter(Boolean).join(' · ').slice(0, 60)}`)
}
await closePool()
