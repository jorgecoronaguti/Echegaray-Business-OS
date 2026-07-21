#!/usr/bin/env node
// Agrega a "Cargas Sociales" el bloque de PLANES DE PAGO de deuda previsional.
//
// "En pestaña cargas sociales, quiero ver los planes de pago de deuda previsional". La pestaña ya
// tenía una línea suelta que decía "Deuda previsional F931" con un total por mes, pero no se veía
// QUÉ planes son, de cuántas cuotas, cuánto falta ni cuándo vencen — que es lo único que sirve para
// anticipar la caja.
//
// APPEND, NO REESCRITURA. Los bloques 1 a 3 (declarado según F931, pagado según Compras, y la
// diferencia entre ambos) están bien y son de otra fuente. Se agrega abajo y no se toca nada de lo
// que ya está: hoy ya rompí una pestaña por escribir donde creía que no había nada.
//
// LO QUE NO SE PUEDE SABER Y NO SE INVENTA: cuántas cuotas tiene cada plan en total. En Compras
// están cargadas las cuotas que se pagaron o se previeron, no el plan original. Así que la columna
// "cuotas del plan" dice lo que hay cargado y avisa que el total no está en el OS.
//
//   node orquestador/scripts/cargas-planes.mjs [--dry]

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { query } from '../lib/db.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const PESTAÑA = 'Cargas Sociales'
const DRY = process.argv.includes('--dry')
const ANCHO = 9
const HOY = new Date().toISOString().slice(0, 10)

const letra = (i) => { let s = ''; for (let n = i; n >= 0; n = Math.floor(n / 26) - 1) s = String.fromCharCode(65 + (n % 26)) + s; return s }
const ar = (d) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '')
/** La firma del bloque: permite rehacerlo en su lugar en vez de agregar una copia cada día. */
const FIRMA = '5 · PLANES DE PAGO DE DEUDA PREVISIONAL'
/**
 * CÓMO SE RECONOCE EL BLOQUE VIEJO, con o sin su número.
 *
 * POR QUÉ (21/07). La búsqueda era `startsWith(FIRMA)`, o sea el rótulo COMPLETO con el "4 · "
 * adelante. En la pestaña había una versión anterior del mismo bloque escrita sin numerar, así que
 * no la encontraba, la dejaba donde estaba y escribía otra abajo: dos bloques de planes de pago con
 * los mismos tres planes, y el lector no tiene forma de saber cuál mira. Y como el bloque 4 de la
 * proyección también se llamaba "4 ·", había dos bloques distintos con el mismo número.
 *
 * Un bloque se reconoce por lo que DICE, no por cómo está numerado: la numeración es lo que más
 * cambia cuando se reordena una pestaña.
 */
const ES_BLOQUE = /^\s*(?:\d+\s*·\s*)?PLANES DE PAGO DE DEUDA PREVISIONAL/i

async function planes() {
  // El MISMO filtro que la regla de rubro-caja: por concepto, no por cliente. Bajo la etiqueta
  // "Plan de pago" también hay Anticipo de Ganancias y Acciones y Participaciones, que son
  // impuestos y no tienen nada que hacer acá.
  const r = await query(`
    select concepto, total, fecha_pago
      from public.costos_obra
     where origen = 'compras_sheet'
       and concepto ~* 'deuda previcional|deuda previsional|plan f931'
     order by fecha_pago`)
  const m = new Map()
  for (const x of r.rows) {
    const c = String(x.concepto ?? '')
    const nombre = /w303094/i.test(c) ? 'Plan F931 W303094 — financiación de junio 2026'
      : /dic\s*25/i.test(c) ? 'Deuda previsional F931 — Diciembre 2025'
        : /enero\s*26/i.test(c) ? 'Deuda previsional F931 — Enero 2026'
          : `Otro — ${c.slice(0, 40)}`
    const p = m.get(nombre) ?? { nombre, cuotas: [], total: 0 }
    p.cuotas.push({ monto: Number(x.total) || 0, fecha: x.fecha_pago ? new Date(x.fecha_pago).toISOString().slice(0, 10) : null })
    p.total += Number(x.total) || 0
    m.set(nombre, p)
  }
  return [...m.values()].map((p) => {
    const pagadas = p.cuotas.filter((c) => c.fecha && c.fecha <= HOY)
    const pendientes = p.cuotas.filter((c) => !c.fecha || c.fecha > HOY)
    return {
      ...p,
      n: p.cuotas.length,
      monto_cuota: Math.round(p.total / p.cuotas.length),
      pagadas: pagadas.length,
      monto_pagado: pagadas.reduce((s, c) => s + c.monto, 0),
      pendientes: pendientes.length,
      saldo: pendientes.reduce((s, c) => s + c.monto, 0),
      proxima: pendientes.map((c) => c.fecha).filter(Boolean).sort()[0] ?? null,
      ultima: p.cuotas.map((c) => c.fecha).filter(Boolean).sort().slice(-1)[0] ?? null,
    }
  }).sort((a, b) => b.saldo - a.saldo)
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const ps = await planes()
  console.log(`${ps.length} planes · saldo total ${Math.round(ps.reduce((s, p) => s + p.saldo, 0)).toLocaleString('es-AR')}`)
  for (const p of ps) console.log(`  ${p.nombre.padEnd(48)} ${p.pagadas}/${p.n} pagadas · cuota ${p.monto_cuota.toLocaleString('es-AR')} · saldo ${Math.round(p.saldo).toLocaleString('es-AR')} · próxima ${ar(p.proxima) || '—'}`)
  if (DRY) return

  // IDEMPOTENTE. Este script corre todos los días desde el agente: si simplemente agregara al final,
  // cada corrida dejaría otra copia del bloque. Se busca la firma; si ya está, se limpia y se
  // reescribe EN EL MISMO LUGAR. Si no está, se agrega después de lo último que haya.
  const actual = await google.readSheetValues(ID, `${PESTAÑA}!A1:${letra(ANCHO - 1)}200`)
  const yaEsta = actual.findIndex((f) => ES_BLOQUE.test(String(f?.[0] ?? '')))
  const copias = actual.filter((f) => ES_BLOQUE.test(String(f?.[0] ?? ''))).length
  if (copias > 1) console.log(`  ⚠ había ${copias} copias del bloque: las reemplaza una sola`)
  let F
  if (yaEsta >= 0) {
    F = yaEsta + 1
    await google.clearValues(ID, `${PESTAÑA}!A${F}:${letra(ANCHO - 1)}200`)
  } else {
    let fin = 0
    actual.forEach((f, i) => { if ((f || []).some((c) => String(c ?? '').trim())) fin = i + 1 })
    F = fin + 2
  }
  console.log(`\nEl bloque ${yaEsta >= 0 ? 'ya existía y se rehace' : 'se agrega'} en la fila ${F}.`)

  const filas = []
  const push = (c = []) => { const r = [...c]; while (r.length < ANCHO) r.push(''); filas.push(r); return F + filas.length - 1 }
  push([FIRMA])
  push([`F931 de períodos viejos financiados en cuotas. Sale de Compras, rubro "Deuda previsional (planes de pago)". Al ${ar(HOY)}.`])
  const cab = push(['Plan', 'Cuotas cargadas', 'Pagadas', 'Monto por cuota', 'Ya pagado', 'Cuotas pendientes', 'SALDO PENDIENTE', 'Próximo vencimiento', 'Último vencimiento cargado'])
  const p0 = F + filas.length
  for (const p of ps) push([p.nombre, p.n, p.pagadas, p.monto_cuota, Math.round(p.monto_pagado), p.pendientes, Math.round(p.saldo), ar(p.proxima), ar(p.ultima)])
  const p1 = F + filas.length - 1
  const tot = push(['TOTAL PLANES', `=SUM(B${p0}:B${p1})`, `=SUM(C${p0}:C${p1})`, '', `=SUM(E${p0}:E${p1})`, `=SUM(F${p0}:F${p1})`, `=SUM(G${p0}:G${p1})`, '', ''])
  push()
  const ctrl = push(['⇒ Control contra Compras', '=SUMIF(Compras!$AC$4:$AC;"Deuda previsional (planes de pago)";Compras!$O$4:$O)', '', '', '', '', '', '', 'Total del rubro en Compras.'])
  push(['⇒ Diferencia (tiene que ser $0)', `=$B${ctrl}-($E${tot}+$G${tot})`, '', '', '', '', '', '', 'Pagado + saldo tiene que dar el total del rubro. Si no, hay cuotas que esta tabla no ve.'])
  push()
  push(['LO QUE FALTA: de cuántas cuotas es cada plan en total. En Compras están las cuotas cargadas, no el plan original de ARCA — así que "saldo pendiente" es sólo lo que está previsto en la planilla, no necesariamente lo que falta pagar de verdad.'])

  await google.batchUpdateValues(ID, [{ range: `${PESTAÑA}!A${F}:${letra(ANCHO - 1)}${F + filas.length - 1}`, values: filas }])

  const hoja = (await google.getSheetMeta(ID)).find((s) => s.title === PESTAÑA)
  const sheetId = hoja.sheetId
  const rg = (r0, r1, c0 = 0, c1 = ANCHO) => ({ sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 })
  await google.spreadsheetBatchUpdate(ID, [
    { repeatCell: { range: rg(F - 1, F + filas.length - 1, 1), cell: { userEnteredFormat: { numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0;[Red]-"$"#,##0;"—"' }, horizontalAlignment: 'RIGHT' } }, fields: 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment' } },
    // Las cantidades de cuotas son cantidades; los vencimientos son texto.
    { repeatCell: { range: { ...rg(p0 - 1, tot), startColumnIndex: 1, endColumnIndex: 3 }, cell: { userEnteredFormat: { numberFormat: { type: 'NUMBER', pattern: '0' } } }, fields: 'userEnteredFormat.numberFormat' } },
    { repeatCell: { range: { ...rg(p0 - 1, tot), startColumnIndex: 5, endColumnIndex: 6 }, cell: { userEnteredFormat: { numberFormat: { type: 'NUMBER', pattern: '0' } } }, fields: 'userEnteredFormat.numberFormat' } },
    { repeatCell: { range: { ...rg(F - 1, F + filas.length - 1), startColumnIndex: 7, endColumnIndex: 9 }, cell: { userEnteredFormat: { numberFormat: { type: 'TEXT' }, horizontalAlignment: 'CENTER' } }, fields: 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment' } },
    { repeatCell: { range: rg(F - 1, F), cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 12 } } }, fields: 'userEnteredFormat.textFormat' } },
    { repeatCell: { range: rg(F, F + 1), cell: { userEnteredFormat: { textFormat: { italic: true, fontSize: 9, foregroundColor: { red: 0.4, green: 0.4, blue: 0.45 } } } }, fields: 'userEnteredFormat.textFormat' } },
    { repeatCell: { range: rg(cab - 1, cab), cell: { userEnteredFormat: { backgroundColor: { red: 0.17, green: 0.25, blue: 0.37 }, textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 }, fontSize: 9 }, horizontalAlignment: 'CENTER', wrapStrategy: 'WRAP' } }, fields: 'userEnteredFormat' } },
    { repeatCell: { range: rg(tot - 1, tot), cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red: 0.89, green: 0.91, blue: 0.94 } } }, fields: 'userEnteredFormat.textFormat,userEnteredFormat.backgroundColor' } },
    { repeatCell: { range: rg(F + filas.length - 2, F + filas.length - 1), cell: { userEnteredFormat: { numberFormat: { type: 'TEXT' }, textFormat: { italic: true, fontSize: 9, foregroundColor: { red: 0.7, green: 0.3, blue: 0.1 } }, wrapStrategy: 'WRAP' } }, fields: 'userEnteredFormat' } },
  ])

  const v = await google.readSheetValues(ID, `${PESTAÑA}!A${F}:${letra(ANCHO - 1)}${F + filas.length - 1}`)
  const err = v.flat().filter((c) => /^#(REF|ERROR|N\/A|VALUE|¡|DIV|NAME|NUM|NULL)/.test(String(c ?? '')))
  console.log(err.length ? `⚠ ${err.length} celdas en error` : '✓ sin errores')
  for (const f of v) if (f?.[0] && /TOTAL|⇒/.test(String(f[0]))) console.log(`  ${String(f[0]).slice(0, 40).padEnd(42)}${String(f[1] ?? '').padStart(16)}${String(f[6] ?? '').padStart(16)}`)
}

main().then(() => process.exit(0)).catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
