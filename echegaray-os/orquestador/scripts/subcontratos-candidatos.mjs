#!/usr/bin/env node
// LOS SUBCONTRATOS QUE YA ESTÁN EN COMPRAS — informe de sólo lectura, 0 tokens, determinístico.
//
// No escribe nada. Lee `compra_sheet` (el espejo de la pestaña Compras), clasifica comprobante por
// comprobante con `lib/subcontratos-en-compras.mjs` y publica tres cosas: lo que YA es subcontrato
// con su evidencia, lo que quedó `indeterminado` —que es trabajo para el dueño, no para el modelo—,
// y las filas sin CUIT ni comprobante, que es la exposición fiscal y solidaria.
//
//   node orquestador/scripts/subcontratos-candidatos.mjs [--detalle] [--obra <texto>]

import { query, closePool } from '../lib/db.mjs'
import { agruparPorProveedor, clasificarComprobante } from '../lib/subcontratos-en-compras.mjs'

const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null }
const detalle = process.argv.includes('--detalle')
const obra = arg('--obra')
const $ = (n) => new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(n)

const { rows } = await query(
  `select fila, proveedor, obra_texto, fecha, total, concepto, familia_material, detalle_obra, cuit, comprobante
     from public.compra_sheet
    where coalesce(anulada, false) = false and ($1::text is null or obra_texto ilike '%'||$1||'%')
    order by total desc nulls last`,
  [obra],
)

const clasificadas = rows.map((r) => ({ ...r, ...clasificarComprobante(r) }))
const grupos = agruparPorProveedor(clasificadas)
const subcontratos = clasificadas.filter((c) => c.clase === 'subcontrato')
const total = subcontratos.reduce((s, c) => s + Number(c.total ?? 0), 0)
const sinRespaldo = subcontratos.filter((c) => c.sinRespaldo)

console.log(`\nSUBCONTRATOS RECONOCIDOS EN COMPRAS — ${rows.length} comprobantes leídos`)
console.log(`  ${subcontratos.length} comprobantes · $ ${$(total)} · ${grupos.length} proveedores\n`)
for (const g of grupos) {
  const marca = g.sinRespaldo > 0 ? `  ⚠ ${g.sinRespaldo}/${g.n} sin CUIT ni comprobante` : ''
  console.log(`  ${g.proveedor.padEnd(22)} $ ${$(g.monto).padStart(12)}  ${g.n} comp.  conf. ${g.confianzaMinima}${marca}`)
  console.log(`  ${''.padEnd(22)} ${g.obras.join(' · ')}`)
}

console.log(`\nSIN RESPALDO DOCUMENTAL: ${sinRespaldo.length} comprobantes · $ ${$(sinRespaldo.reduce((s, c) => s + Number(c.total ?? 0), 0))}`)
console.log('  Un paquete sin CUIT y sin factura no es un problema de clasificación: es IVA y Ganancias')
console.log('  que no se computan, y responsabilidad solidaria (art. 30 LCT) sin papeles que la acoten.')

const indeterminados = clasificadas
  .filter((c) => c.clase === 'indeterminado' && Number(c.total ?? 0) >= 500_000)
  .filter((c) => !/^(Sueldos|ARCA|Banco|SINDICATOS|SAC|FCL)$/i.test(String(c.proveedor ?? '')))
console.log(`\nLO QUE EL CLASIFICADOR NO PUEDE DECIDIR (≥ $ 500.000): ${indeterminados.length} comprobantes`)
console.log('  No se completan con lo que parezca razonable. Los decide una persona.')
for (const c of indeterminados.slice(0, 20)) {
  console.log(`  $ ${$(Number(c.total)).padStart(11)}  ${String(c.proveedor).padEnd(24)} ${String(c.obra_texto ?? '').padEnd(28)} ${String(c.concepto ?? '').slice(0, 46)}`)
}

if (detalle) {
  console.log('\nDETALLE DE LOS RECONOCIDOS')
  for (const c of subcontratos) {
    console.log(`  fila ${String(c.fila).padStart(4)} $ ${$(Number(c.total)).padStart(11)}  ${String(c.proveedor).padEnd(20)} ${String(c.obra_texto ?? '').padEnd(28)} ${String(c.concepto ?? '').slice(0, 40)}`)
    console.log(`            ${c.confianza} · ${c.senales.join(' · ')}`)
  }
}

console.log('')
await closePool()
