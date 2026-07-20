#!/usr/bin/env node
// SYNC de la pestaña "Compras" del Sheet Flujo de Caja → public.costos_obra (costo real por obra).
// El dueño asigna cada compra a una obra en el Sheet (col "Cliente / Asignación"). Espejamos eso
// tal cual, keyed por obra_texto, para que la web muestre el costo real por obra SIN pedir re-asignar
// nada (antes leía comprobantes_arca sin obra → $0). El Sheet es la fuente de verdad; esto es el
// espejo. Idempotente por (origen, referencia_externa=ID de la fila de Compras). NO destructivo:
// refresca solo origen='compras_sheet'.
//   node orquestador/scripts/sync-compras.mjs
import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { query, closePool } from '../lib/db.mjs'
import { CASHFLOW_ID, parseMonto, parseFecha } from '../lib/cash-briefing.mjs'

const iso = (d) => (d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : null)
// Compras!A..Y (headers en fila 3, datos desde fila 4): idx0 ID, 1 Categoría, 2 Fecha factura,
// 16 Fecha prevista de pago, 24 Fecha contable del pago. Leía sólo hasta la O y por eso fecha_pago
// quedaba en NULL en las 736 filas: el calendario de caja ponía cada pago el día de la FACTURA.
// 3 mes, 4 Proveedor, 5 Modalidad, 6 Tipo, 7 N° Comprobante, 8 Unidad de Negocio,
// 9 Cliente/Asignación (OBRA), 10 Detalles/Obra, 11 Concepto, 12 Importe, 13 IVA, 14 Total.
async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const rows = await google.readSheetValues(CASHFLOW_ID, 'Compras!A4:Y5000').catch(() => [])
  const compras = []
  for (const r of rows) {
    const total = parseMonto(r?.[14])
    const obra = String(r?.[9] ?? '').trim()
    const id = String(r?.[0] ?? '').trim()
    // Fila válida = tiene ID, obra y algún importe (evita filas de encabezado/vacías/subtotales).
    if (!id || !obra || (!total && !parseMonto(r?.[12]))) continue
    compras.push({
      referencia_externa: id,
      obra_texto: obra,
      unidad_negocio: String(r?.[8] ?? '').trim() || null,
      proveedor: String(r?.[4] ?? '').trim() || null,
      modalidad: String(r?.[5] ?? '').trim() || null,
      tipo: String(r?.[6] ?? '').trim() || null,
      comprobante: String(r?.[7] ?? '').trim() || null,
      categoria: String(r?.[1] ?? '').trim() || null,
      concepto: [String(r?.[10] ?? '').trim(), String(r?.[11] ?? '').trim()].filter(Boolean).join(' — ') || null,
      importe: parseMonto(r?.[12]) || null,
      iva: parseMonto(r?.[13]) || null,
      total: total || parseMonto(r?.[12]),
      fecha: iso(parseFecha(r?.[2])),
      // Cuándo SALE la plata: la contable si está, si no la prevista. `fecha` es la de factura y
      // sirve para el devengado; el calendario de caja necesita ésta.
      fecha_pago: iso(parseFecha(r?.[24])) ?? iso(parseFecha(r?.[16])),
      mes: String(r?.[3] ?? '').trim() || null,
    })
  }
  if (!compras.length) { console.error('no leí filas de Compras — abortando (no toco la tabla)'); await closePool(); process.exit(1) }

  // Refresco: borro las del origen y reinserto (snapshot del Sheet). costos_obra NO comparte FK
  // con obligaciones (a diferencia de movimientos_caja), así que el refresh total es seguro.
  await query('begin')
  try {
    await query("delete from public.costos_obra where origen='compras_sheet'")
    for (const c of compras) {
      await query(
        `insert into public.costos_obra
          (obra_texto, unidad_negocio, proveedor, modalidad, tipo, comprobante, categoria, concepto, importe, iva, total, fecha, fecha_pago, mes, origen, referencia_externa, sincronizado_en)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'compras_sheet',$15, now())`,
        [c.obra_texto, c.unidad_negocio, c.proveedor, c.modalidad, c.tipo, c.comprobante, c.categoria, c.concepto, c.importe, c.iva, c.total, c.fecha, c.fecha_pago, c.mes, c.referencia_externa],
      )
    }
    await query('commit')
  } catch (e) { await query('rollback'); console.error('sync falló, ROLLBACK:', e.message); process.exit(1) }

  await query(
    `insert into public.integraciones (slug, nombre, estado, salud, ultimo_sync, notas)
     values ('compras_sheet','Compras (Flujo de Caja)','en_curso','ok',now(),$1)
     on conflict (slug) do update set estado='en_curso', salud='ok', ultimo_sync=now(), notas=excluded.notas`,
    [`Pestaña Compras espejada a costos_obra: ${compras.length} compras con obra asignada.`],
  ).catch(() => {})
  const { rows: top } = await query("select obra_texto, round(sum(total)) t, count(*)::int n from public.costos_obra where origen='compras_sheet' group by 1 order by t desc limit 6")
  console.log(`sincronizadas ${compras.length} compras → costos_obra. Top obras:`)
  top.forEach((r) => console.log(`  ${r.obra_texto}: $${Number(r.t).toLocaleString('es-AR')} (${r.n})`))
  await closePool()
}
main().catch((e) => { console.error('sync-compras falló:', e.message); process.exit(1) })
