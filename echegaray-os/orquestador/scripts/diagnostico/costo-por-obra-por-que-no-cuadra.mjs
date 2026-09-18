#!/usr/bin/env node
// ¿POR QUÉ EL COSTO POR OBRA NO CUADRA? — la cuenta de la RPC contra la cuenta de la auditoría, partida por rubro.
//
// `auditar-costo-por-obra.pg.test.mjs` da rojo con 14 obras en `rpc_vs_recuento` y 13 en
// `conciliacion_incompleta`. Este script no repite el reproche: lo DESARMA. Para cada obra publica
// las mismas filas que consume la pantalla, agrupadas por el rubro que la RPC les asigna
// (`materiales` / `subcontratistas` / `otros`), y al lado el recuento de dos cubetas que hace la
// auditoría. La resta, rubro por rubro, es la explicación.
//
// SÓLO LECTURA. node orquestador/scripts/diagnostico/costo-por-obra-por-que-no-cuadra.mjs
import { query, closePool } from '../../lib/db.mjs'
import * as Q from '../../lib/auditoria-costo-por-obra-sql.mjs'

const $ = (n) => Math.round(Number(n ?? 0)).toLocaleString('es-AR')

const { rows: obras } = await query(
  `select id, codigo, nombre, estado from public.obra_canonica where fusionada_en is null and codigo not like 'ZZ-%' order by codigo`)
const ids = obras.map((o) => o.id)

// La cuenta de la RPC, abierta por rubro. Mismas filas, mismo `a_la_fecha`, misma clasificación.
const { rows: rpc } = await query(`
  select f.obra_id,
         sum(f.a_la_fecha) filter (where r.rubro = 'materiales')      as materiales,
         sum(f.a_la_fecha) filter (where r.rubro = 'subcontratistas') as subcontratos,
         sum(f.a_la_fecha) filter (where r.rubro = 'otros')           as otros,
         count(*) filter (where r.rubro = 'otros')::int               as n_otros,
         sum(f.a_la_fecha) filter (where r.rubro = 'subcontratistas' and not f.es_subcontrato) as sub_por_familia,
         count(*) filter (where r.rubro = 'subcontratistas' and not f.es_subcontrato)::int     as n_sub_por_familia
    from public.costo_de_obra_filas_iva($1, null, false) f
    left join public.compra_sheet s on coalesce(s.sheet_id::text, s.fila::text) = f.referencia
    cross join lateral (select public.rubro_de_compra(f.es_subcontrato, s.familia_material, s.sub_rubro) as rubro) r
   group by 1`, [ids])
const porRpc = new Map(rpc.map((r) => [r.obra_id, r]))

// El recuento de la auditoría: dos cubetas, la regla del proveedor y nada más.
const { rows: rec } = await query(Q.RECUENTO_POR_OBRA, [true])
const porRec = new Map(rec.map((r) => [r.obra_id, r]))

console.log(`${'obra'.padEnd(10)}${'MA rpc'.padStart(14)}${'MA recuento'.padStart(14)}${'dif MA'.padStart(13)}`
  + `${'SUB rpc'.padStart(13)}${'SUB rec'.padStart(13)}${'dif SUB'.padStart(12)}${'OTROS rpc'.padStart(13)}${'n'.padStart(4)}`
  + `${'SUB x familia'.padStart(15)}${'residuo'.padStart(12)}`)
let totOtros = 0; let totFam = 0; let totResiduo = 0
for (const o of obras) {
  const a = porRpc.get(o.id); const b = porRec.get(o.id)
  if (!a && !b) continue
  const dMa = Number(a?.materiales ?? 0) - Number(b?.materiales ?? 0)
  const dSub = Number(a?.subcontratos ?? 0) - Number(b?.subcontratos ?? 0)
  // Si TODA la diferencia se explica por «otros» y por el subcontrato-por-familia, el residuo es cero.
  const residuo = Math.round((dMa + dSub + Number(a?.otros ?? 0)) * 100) / 100
  if (Math.abs(dMa) <= 1 && Math.abs(dSub) <= 1) continue
  totOtros += Number(a?.otros ?? 0); totFam += Number(a?.sub_por_familia ?? 0); totResiduo += residuo
  console.log(`${o.codigo.padEnd(10)}${$(a?.materiales).padStart(14)}${$(b?.materiales).padStart(14)}${$(dMa).padStart(13)}`
    + `${$(a?.subcontratos).padStart(13)}${$(b?.subcontratos).padStart(13)}${$(dSub).padStart(12)}`
    + `${$(a?.otros).padStart(13)}${String(a?.n_otros ?? 0).padStart(4)}${$(a?.sub_por_familia).padStart(15)}${$(residuo).padStart(12)}`)
}
console.log(`\ntotal «otros» de las obras que no cuadran: ${$(totOtros)}`)
console.log(`total subcontrato por FAMILIA (no por proveedor): ${$(totFam)}`)
console.log(`RESIDUO que no explican ni «otros» ni la familia: ${$(totResiduo)}`)
await closePool()
