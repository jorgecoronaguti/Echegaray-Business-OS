#!/usr/bin/env node
// SYNC de la pestaña "02_Cobranzas" del Sheet Flujo de Caja → public.cobranzas (ingresos/percibido).
// El Sheet es la fuente de verdad; esto es su espejo. Snapshot idempotente por origen='cobranzas_sheet',
// keyed por ID de fila. NO destructivo con otras tablas.
//   node orquestador/scripts/sync-cobranzas.mjs
//
// ═══ LOS IMPORTES SE GUARDAN EN PESOS, NO EN LA MONEDA DE LA CELDA (10/09/2026) ═══
//
// Hasta hoy el rango leído era `A5:R` —hasta la columna 18— y la columna "Moneda" del Sheet es la AA.
// La fila 62 de Quattropani dice `U$S 15.400` y se guardaba como $15.400: la cuenta corriente del
// cliente publicaba $23.273.434 menos de lo cobrado que la pestaña, sin una sola señal de error.
//
// Un espejo "fiel" celda a celda de un importe CON moneda es imposible en una columna sola: guardar
// 15.400 sin decir que son dólares no es fidelidad, es un dato falso (regla de oro 3, ventanas y
// unidades incompatibles). Las once caras que leen esta tabla —cuenta corriente, control
// administrativo, estado de empresa, reclamos, portal— suman `total_bruto` como pesos y ninguna sabe
// de monedas. Así que la columna se define en PESOS, con el mismo `TIPO_CAMBIO_USD` que usa la
// pestaña (misma función `valuarEnPesos`, una sola definición), y el importe NATIVO se conserva en
// `monto_neto_origen` / `total_bruto_origen` junto con `moneda` y `tipo_cambio`.
//
// ESAS CUATRO COLUMNAS PUEDEN NO EXISTIR TODAVÍA: la migración
// `20260910T1500_cobranzas_moneda.sql` está escrita y NO aplicada (nadie aplica migraciones desde un
// worktree). El sync mira el catálogo y, si no están, guarda igual los importes ya valuados y lo
// dice. El arreglo del defecto no espera a la migración; lo que espera es la trazabilidad.
import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { query, closePool } from '../lib/db.mjs'
import { CASHFLOW_ID, parseMonto, parseFecha } from '../lib/cash-briefing.mjs'
import { resolverCliente } from '../lib/portal/cobranzas-a-cliente.mjs'
import { leerTipoCambio } from '../lib/tipo-cambio.mjs'
import { valuarFilaCobranza, IDX_MONEDA_COBRANZAS, RANGO_COBRANZAS } from '../lib/cobranzas-contrato.mjs'

/** ¿Están en la base las columnas de moneda? Ver la cabecera: la migración puede no estar aplicada. */
async function hayColumnasDeMoneda() {
  const { rows } = await query(
    `select column_name from information_schema.columns
      where table_schema='public' and table_name='cobranzas'
        and column_name in ('moneda','tipo_cambio','monto_neto_origen','total_bruto_origen')`)
  return rows.length === 4
}

const iso = (d) => (d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : null)
// 02_Cobranzas!A..AA (headers fila 4, datos desde fila 5): idx0 ID, 1 Categoría, 2 Fecha emisión,
// 3 Factura, 4 N° Comprobante, 5 Unidad, 6 Obra/Cliente, 7 OC, 8 Concepto, 9 Monto neto, 10 IVA,
// 11 Retenciones, 12 TOTAL Bruto, 13 Forma de Cobro, 14 Estado, 15 Fecha Venta, 16 Fecha cobro,
// 17 Mes, … 26 Moneda (col AA).
async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const rows = await google.readSheetValues(CASHFLOW_ID, RANGO_COBRANZAS).catch(() => [])
  const { tc, crudo } = await leerTipoCambio(google, CASHFLOW_ID)
  const cobranzas = []
  const sinValuar = []
  for (const [i, r] of rows.entries()) {
    const id = String(r?.[0] ?? '').trim()
    const obra = String(r?.[6] ?? '').trim()
    // Fila válida = tiene ID y obra/cliente (evita encabezados/vacías/subtotales).
    if (!id || !obra) continue
    const nativos = {
      monto_neto: parseMonto(r?.[9]) || null, iva: parseMonto(r?.[10]) || null,
      retenciones: parseMonto(r?.[11]) || null, total_bruto: parseMonto(r?.[12]) || null,
    }
    const v = valuarFilaCobranza(nativos, r?.[IDX_MONEDA_COBRANZAS], tc)
    if (v.motivo) { sinValuar.push(`fila ${i + 5} (ID ${id}, ${obra}): ${v.motivo}`); continue }
    cobranzas.push({
      sheet_id: id, categoria: String(r?.[1] ?? '').trim() || null, fecha_emision: iso(parseFecha(r?.[2])),
      factura: String(r?.[3] ?? '').trim() || null, numero_comprobante: String(r?.[4] ?? '').trim() || null,
      unidad: String(r?.[5] ?? '').trim() || null, obra_cliente: obra,
      orden_compra: String(r?.[7] ?? '').trim() || null, concepto: String(r?.[8] ?? '').trim() || null,
      monto_neto: v.importes.monto_neto, iva: v.importes.iva, retenciones: v.importes.retenciones,
      total_bruto: v.importes.total_bruto, forma_cobro: String(r?.[13] ?? '').trim() || null,
      estado: String(r?.[14] ?? '').trim() || null, fecha_venta: iso(parseFecha(r?.[15])),
      fecha_cobro: iso(parseFecha(r?.[16])), mes_cobro: String(r?.[17] ?? '').trim() || null,
      moneda: v.moneda, tipo_cambio: v.tipoCambio,
      monto_neto_origen: nativos.monto_neto, total_bruto_origen: nativos.total_bruto,
    })
  }
  // UNA FILA QUE NO SE PUDO VALUAR NO SE GUARDA EN LA MONEDA EQUIVOCADA — Y TAMPOCO SE SALTEA EN
  // SILENCIO. Se aborta la corrida entera: la tabla se borra y se reinserta completa, así que
  // continuar publicaría una réplica a la que le falta plata sin que ninguna cara pueda notarlo.
  if (sinValuar.length) {
    console.error(`no puedo valuar ${sinValuar.length} fila(s) — abortando sin tocar la tabla (TC leído: ${JSON.stringify(crudo)})`)
    sinValuar.forEach((m) => console.error(`   ${m}`))
    await query(
      `insert into public.integraciones (slug, nombre, estado, salud, notas)
       values ('cobranzas_sheet','Cobranzas (Flujo de Caja)','en_curso','degradada',$1)
       on conflict (slug) do update set salud='degradada', notas=excluded.notas`,
      [`sync abortado: ${sinValuar.length} fila(s) sin valuar. ${sinValuar[0]}`],
    )
    await closePool(); process.exit(1)
  }
  if (!cobranzas.length) { console.error('no leí filas de Cobranzas — abortando (no toco la tabla)'); await closePool(); process.exit(1) }
  const enUsd = cobranzas.filter((c) => c.moneda === 'USD')
  if (enUsd.length) console.log(`moneda: ${enUsd.length} fila(s) en USD valuadas a ${tc}`)

  // ═══ A QUÉ CLIENTE PERTENECE CADA FILA (05/09/2026) ═══
  //
  // `cliente_id` existía desde la migración del CRM y este sync nunca la escribía: 96 filas con
  // NULL, y la vista `cliente_cuenta_corriente` —que filtra por `cliente_id is not null`—
  // devolviendo cero para todo el mundo. La cara «Cuenta corriente» de la ficha estaba vacía.
  //
  // El vínculo se resuelve ACÁ y no en un backfill porque tres líneas más abajo hay un `delete`:
  // cualquier cosa escrita aparte dura hasta la próxima corrida.
  //
  // Y se resuelve con `resolverCliente` de `lib/portal/`, que es el MISMO resolutor que usa
  // `sync-esquema-cliente.mjs` para el portal. Escribí uno propio por tokens antes de buscar si ya
  // existía; daba el mismo resultado sobre los ocho rótulos reales y lo tiré. Dos definiciones de
  // «de qué cliente es esta cobranza» es exactamente el problema que el OS tiene prohibido: el día
  // que se corrijan los alias, una se enteraría y la otra no.
  const { rows: indice } = await query(
    `select a.alias, o.cliente_id
       from public.obra_alias a
       join public.obra_canonica o on o.id = a.obra_id
      where o.cliente_id is not null`,
  )
  const sinCliente = new Map()
  for (const c of cobranzas) {
    const r = resolverCliente(c.obra_cliente, indice)
    c.cliente_id = r.cliente_id
    if (!r.cliente_id) sinCliente.set(c.obra_cliente, r.motivo)
  }
  const vinculadas = cobranzas.filter((c) => c.cliente_id).length
  console.log(`clientes: ${vinculadas}/${cobranzas.length} filas vinculadas`)
  // Un rótulo sin cliente NO es un error: MACRO, LIRIO y ADDATO facturan y no tienen alias. Se
  // NOMBRAN para que uno nuevo se vea, en vez de quedar mudo en NULL.
  for (const [rotulo, motivo] of sinCliente) console.log(`   sin cliente: «${rotulo}» — ${motivo}`)

  const conMoneda = await hayColumnasDeMoneda()
  if (!conMoneda) {
    console.log('columnas de moneda ausentes (migración 20260910T1500 sin aplicar):'
      + ' guardo los importes YA VALUADOS en pesos, sin la trazabilidad de la moneda nativa')
  }
  const columnas = ['sheet_id', 'categoria', 'fecha_emision', 'factura', 'numero_comprobante', 'unidad',
    'obra_cliente', 'orden_compra', 'concepto', 'monto_neto', 'iva', 'retenciones', 'total_bruto',
    'forma_cobro', 'estado', 'fecha_venta', 'fecha_cobro', 'mes_cobro', 'cliente_id',
    ...(conMoneda ? ['moneda', 'tipo_cambio', 'monto_neto_origen', 'total_bruto_origen'] : [])]
  const sql = `insert into public.cobranzas (${columnas.join(', ')}, origen, sincronizado_en)`
    + ` values (${columnas.map((_, i) => `$${i + 1}`).join(',')},'cobranzas_sheet',now())`

  await query('begin')
  try {
    await query("delete from public.cobranzas where origen='cobranzas_sheet'")
    for (const c of cobranzas) await query(sql, columnas.map((k) => c[k] ?? null))
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
