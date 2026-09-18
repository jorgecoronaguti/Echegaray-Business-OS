#!/usr/bin/env node
// EL CAJÓN «Sin obra – LA ESTRELLA»: dos maneras de decidir de quién es la fila.
//
// `conciliacionSinObra` junta las filas por el TEXTO de la columna Obra («Sin obra – X»); la RPC
// `compras_sin_obra_de_clientes` las junta por `compra_obra_asignada.via = 'sin_obra'` y el cliente
// CANÓNICO de la asignación. Cuando el texto y la asignación no dicen lo mismo, los dos caminos
// cuentan conjuntos distintos y el residuo no es un filtro desconocido: es una clave distinta.
//
// SÓLO LECTURA. node orquestador/scripts/diagnostico/costo-sin-obra-la-estrella.mjs
import { query, closePool } from '../../lib/db.mjs'
const $ = (n) => Math.round(Number(n ?? 0)).toLocaleString('es-AR')

const { rows } = await query(`
  select coalesce(s.sheet_id::text, s.fila::text) as ref, s.fila, s.obra_celda, s.obra_texto,
         s.proveedor, s.total, a.via, a.cliente as cliente_asignado, a.obra_id
    from public.compra_sheet s
    join public.compra_obra_asignada a on a.referencia = coalesce(s.sheet_id::text, s.fila::text)
   where a.via = 'sin_obra' and a.obra_id is null
     and coalesce(s.anulada, false) = false and upper(btrim(coalesce(s.estado, ''))) <> 'ELIMINADO'
   order by a.cliente, s.fila`)

const porCliente = new Map()
for (const r of rows) {
  const texto = String(r.obra_celda ?? '').trim()
  const k = r.cliente_asignado ?? '(sin cliente)'
  if (!porCliente.has(k)) porCliente.set(k, [])
  porCliente.get(k).push({ ...r, coincide: /^sin\s+obra/i.test(texto) })
}
for (const [cli, fs] of porCliente) {
  const si = fs.filter((f) => f.coincide); const no = fs.filter((f) => !f.coincide)
  console.log(`\n══ asignadas al cajón de «${cli}»: ${fs.length} fila(s) · ${$(fs.reduce((s, f) => s + Number(f.total), 0))}`)
  console.log(`   la columna Obra dice «Sin obra …»: ${si.length} · ${$(si.reduce((s, f) => s + Number(f.total), 0))}`)
  console.log(`   la columna Obra dice OTRA cosa   : ${no.length} · ${$(no.reduce((s, f) => s + Number(f.total), 0))}`)
  for (const f of no.sort((a, b) => Number(b.total) - Number(a.total))) {
    console.log(`      fila ${String(f.fila).padStart(5)} ${$(f.total).padStart(12)}  Obra=«${String(f.obra_celda ?? '(vacía)').slice(0, 34).padEnd(35)}» J=«${String(f.obra_texto ?? '').slice(0, 22)}» ${String(f.proveedor).slice(0, 22)}`)
  }
}
await closePool()
