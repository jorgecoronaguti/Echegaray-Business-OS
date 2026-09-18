#!/usr/bin/env node
// EL RESIDUO QUE «OTROS» NO EXPLICA — fila por fila, con su motivo.
//
// Descontado el tercer rubro (`otros`) y el subcontrato-por-familia, quedan ~$1,34 M repartidos en
// cuatro obras. Esa plata está en `compra_sheet` + `compra_obra_asignada` y NO sale por la RPC, o
// sale por otro importe. La RPC arranca en `costos_obra`; el recuento arranca en el espejo. Este
// script empareja las dos listas por referencia y clasifica cada diferencia.
//
// SÓLO LECTURA. node orquestador/scripts/diagnostico/costo-por-obra-residuo-fila-por-fila.mjs
import { query, closePool } from '../../lib/db.mjs'
import * as Q from '../../lib/auditoria-costo-por-obra-sql.mjs'

const $ = (n) => Math.round(Number(n ?? 0)).toLocaleString('es-AR')
const { rows: obras } = await query(
  `select id, codigo from public.obra_canonica where fusionada_en is null and codigo not like 'ZZ-%' order by codigo`)
const ids = obras.map((o) => o.id)
const codigo = new Map(obras.map((o) => [o.id, o.codigo]))

// El lado del espejo: cada fila que el recuento de la auditoría suma, con su `a la fecha`.
const { rows: espejo } = await query(`
  select a.obra_id, coalesce(s.sheet_id::text, s.fila::text) as ref, s.fila, s.proveedor, s.comprobante,
         s.total, s.estado, s.fecha, s.fecha_prevista, s.fecha_caja, s.unidad_negocio, s.destino,
         (${Q.A_LA_FECHA}) as a_la_fecha
    from public.compra_sheet s
    join public.compra_obra_asignada a on a.referencia = coalesce(s.sheet_id::text, s.fila::text)
   where a.obra_id is not null and coalesce(s.total, 0) > 0 and ${Q.FILTROS_RPC}`)

// El lado de la RPC: exactamente lo que la pantalla suma.
const { rows: rpc } = await query(
  `select obra_id, referencia as ref, total, a_la_fecha from public.costo_de_obra_filas_iva($1, null, false)`, [ids])
const porRef = new Map(rpc.map((r) => [`${r.obra_id}|${r.ref}`, r]))

// ¿Existe la fila en `costos_obra` y con qué área/unidad? Es la aduana que la RPC mira y el espejo no.
const { rows: co } = await query(`
  select c.referencia_externa as ref, c.total, c.area, c.unidad_negocio, c.fecha, c.fecha_pago
    from public.costos_obra c where c.origen = 'compras_sheet'`)
const porCo = new Map(co.map((r) => [r.ref, r]))

const fam = new Map()
for (const e of espejo) {
  const r = porRef.get(`${e.obra_id}|${e.ref}`)
  const dif = Math.round((Number(r?.a_la_fecha ?? 0) - Number(e.a_la_fecha)) * 100) / 100
  if (Math.abs(dif) <= 1) continue
  const c = porCo.get(e.ref)
  const causa = !c ? 'la fila no existe en costos_obra (el sync no la escribió)'
    : !r ? `costos_obra la tiene pero la RPC la descarta (area=${c.area}, unidad=${c.unidad_negocio})`
      : Math.abs(Number(c.total) - Number(e.total)) > 1 ? `costos_obra.total (${$(c.total)}) ≠ compra_sheet.total (${$(e.total)})`
        : 'mismo total, distinto «a la fecha»: costos_obra.fecha/fecha_pago ≠ compra_sheet.fecha/fecha_prevista'
  if (!fam.has(causa)) fam.set(causa, [])
  fam.get(causa).push({ ...e, dif, co: c, rpc: r })
}
for (const [causa, filas] of [...fam.entries()].sort((a, b) =>
  Math.abs(b[1].reduce((s, f) => s + f.dif, 0)) - Math.abs(a[1].reduce((s, f) => s + f.dif, 0)))) {
  console.log(`\n══ ${causa} · ${filas.length} fila(s) · ${$(filas.reduce((s, f) => s + f.dif, 0))}`)
  for (const f of filas.sort((a, b) => Math.abs(b.dif) - Math.abs(a.dif)).slice(0, 12)) {
    console.log(`   ${codigo.get(f.obra_id)} fila ${String(f.fila).padStart(5)} ${$(f.dif).padStart(13)}  ${String(f.proveedor).slice(0, 26).padEnd(27)}`
      + `total ${$(f.total).padStart(12)} estado ${String(f.estado ?? '—').padEnd(9)} f=${String(f.fecha ?? '—').slice(0, 10)} prev=${String(f.fecha_prevista ?? '—').slice(0, 10)}`
      + (f.co ? ` | CO f=${String(f.co.fecha ?? '—').slice(0, 10)} pago=${String(f.co.fecha_pago ?? '—').slice(0, 10)} tot=${$(f.co.total)}` : ''))
  }
}
// Y al revés: filas que la RPC suma y el espejo no.
let solo = 0; const soloRpc = []
for (const r of rpc) {
  const k = `${r.obra_id}|${r.ref}`
  if (!espejo.some((e) => `${e.obra_id}|${e.ref}` === k)) { solo += Number(r.a_la_fecha ?? 0); soloRpc.push(r) }
}
console.log(`\n══ filas que la RPC suma y el recuento del espejo NO: ${soloRpc.length} · ${$(solo)}`)
for (const r of soloRpc.sort((a, b) => Math.abs(b.a_la_fecha) - Math.abs(a.a_la_fecha)).slice(0, 12)) {
  console.log(`   ${codigo.get(r.obra_id)} ref ${String(r.ref).padStart(6)} ${$(r.a_la_fecha).padStart(13)} total ${$(r.total)}`)
}
await closePool()
