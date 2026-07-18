#!/usr/bin/env node
// SYNC de la pestaña "02_Cobranzas" del Sheet Flujo de Caja → public.cobranzas (ingresos/percibido).
// El Sheet es la fuente de verdad; esto es el espejo FIEL (reconcilia $0). Snapshot idempotente
// por origen='cobranzas_sheet', keyed por ID de fila. NO destructivo con otras tablas.
//   node orquestador/scripts/sync-cobranzas.mjs
import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { query, closePool } from '../lib/db.mjs'
import { CASHFLOW_ID, parseMonto, parseFecha } from '../lib/cash-briefing.mjs'

const iso = (d) => (d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : null)
// 02_Cobranzas!A..R (headers fila 4, datos desde fila 5): idx0 ID, 1 Categoría, 2 Fecha emisión,
// 3 Factura, 4 N° Comprobante, 5 Unidad, 6 Obra/Cliente, 7 OC, 8 Concepto, 9 Monto neto, 10 IVA,
// 11 Retenciones, 12 TOTAL Bruto, 13 Forma de Cobro, 14 Estado, 15 Fecha Venta, 16 Fecha cobro, 17 Mes.
async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const rows = await google.readSheetValues(CASHFLOW_ID, '02_Cobranzas!A5:R5000').catch(() => [])
  const cobranzas = []
  for (const r of rows) {
    const id = String(r?.[0] ?? '').trim()
    const obra = String(r?.[6] ?? '').trim()
    const bruto = parseMonto(r?.[12])
    // Fila válida = tiene ID y obra/cliente (evita encabezados/vacías/subtotales).
    if (!id || !obra) continue
    cobranzas.push({
      sheet_id: id, categoria: String(r?.[1] ?? '').trim() || null, fecha_emision: iso(parseFecha(r?.[2])),
      factura: String(r?.[3] ?? '').trim() || null, numero_comprobante: String(r?.[4] ?? '').trim() || null,
      unidad: String(r?.[5] ?? '').trim() || null, obra_cliente: obra,
      orden_compra: String(r?.[7] ?? '').trim() || null, concepto: String(r?.[8] ?? '').trim() || null,
      monto_neto: parseMonto(r?.[9]) || null, iva: parseMonto(r?.[10]) || null, retenciones: parseMonto(r?.[11]) || null,
      total_bruto: bruto || null, forma_cobro: String(r?.[13] ?? '').trim() || null,
      estado: String(r?.[14] ?? '').trim() || null, fecha_venta: iso(parseFecha(r?.[15])),
      fecha_cobro: iso(parseFecha(r?.[16])), mes_cobro: String(r?.[17] ?? '').trim() || null,
    })
  }
  if (!cobranzas.length) { console.error('no leí filas de 02_Cobranzas — abortando (no toco la tabla)'); await closePool(); process.exit(1) }

  await query('begin')
  try {
    await query("delete from public.cobranzas where origen='cobranzas_sheet'")
    for (const c of cobranzas) {
      await query(
        `insert into public.cobranzas
          (sheet_id, categoria, fecha_emision, factura, numero_comprobante, unidad, obra_cliente, orden_compra,
           concepto, monto_neto, iva, retenciones, total_bruto, forma_cobro, estado, fecha_venta, fecha_cobro,
           mes_cobro, origen, sincronizado_en)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,'cobranzas_sheet',now())`,
        [c.sheet_id, c.categoria, c.fecha_emision, c.factura, c.numero_comprobante, c.unidad, c.obra_cliente,
          c.orden_compra, c.concepto, c.monto_neto, c.iva, c.retenciones, c.total_bruto, c.forma_cobro,
          c.estado, c.fecha_venta, c.fecha_cobro, c.mes_cobro],
      )
    }
    await query('commit')
  } catch (e) { await query('rollback'); console.error('sync falló, ROLLBACK:', e.message); process.exit(1) }

  await query(
    `insert into public.integraciones (slug, nombre, estado, salud, ultimo_sync, notas)
     values ('cobranzas_sheet','Cobranzas (Flujo de Caja)','en_curso','ok',now(),$1)
     on conflict (slug) do update set estado='en_curso', salud='ok', ultimo_sync=now(), notas=excluded.notas`,
    [`Pestaña 02_Cobranzas espejada a public.cobranzas: ${cobranzas.length} cobranzas.`],
  )
  const { rows: est } = await query("select estado, count(*)::int n, round(sum(total_bruto)) t from public.cobranzas where origen='cobranzas_sheet' group by 1 order by t desc nulls last")
  console.log(`sincronizadas ${cobranzas.length} cobranzas → public.cobranzas. Por estado:`)
  est.forEach((r) => console.log(`  ${r.estado}: $${Number(r.t || 0).toLocaleString('es-AR')} (${r.n})`))
  await closePool()
}
main().catch((e) => { console.error(e); process.exit(1) })
