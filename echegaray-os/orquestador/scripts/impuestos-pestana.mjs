#!/usr/bin/env node
// Rehace "Impuestos y Financieros" con el IVA REAL de ARCA, y deja el hueco de IIBB a la vista.
//
// LO QUE APARECIÓ AL MIRARLO (20/07), y es lo importante de esta pestaña:
//   · En Compras no hay UNA SOLA fila de IVA ni de IIBB. Los $9.835.877 que figuraban como
//     "Impuestos" eran planes de pago de deuda previsional mal clasificados. El impuesto que más
//     plata mueve estaba íntegramente fuera del cash flow.
//   · ARCA tiene 459 comprobantes cargados. Con ellos, la empresa pagó $11.070.680 de IVA en marzo
//     y hoy tiene $7.467.318 de saldo técnico A FAVOR que no se ve en ningún lado.
//   · De IIBB no hay ni pagos cargados ni alícuota conocida. No se la invento: queda una celda para
//     que la complete el contador y todo el bloque se calcula solo a partir de ahí.
//
// DE DÓNDE SALE CADA NÚMERO. El IVA no puede ser una fórmula del Sheet: sale de los comprobantes de
// ARCA que viven en Supabase. Se escribe como VALOR, pero con la cantidad de comprobantes de cada
// mes al lado — un número trazable, no un número suelto. Lo demás (planes de pago, financiero) sí es
// fórmula contra Compras.
//
//   node orquestador/scripts/impuestos-pestana.mjs [--dry]

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { posicionIvaCompleta, ALICUOTA_IVA } from '../lib/posicion-iva.mjs'
import { query } from '../lib/db.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const PESTAÑA = 'Impuestos y Financieros'
const DRY = process.argv.includes('--dry')
const AÑO = 2026
const ANCHO = 9

const letra = (i) => { let s = ''; for (let n = i; n >= 0; n = Math.floor(n / 26) - 1) s = String.fromCharCode(65 + (n % 26)) + s; return s }
const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** Las ventas ya facturadas o proyectadas por mes, para proyectar el débito fiscal. */
async function ventasProyectadas(google) {
  // Sale de Cobranzas: monto NETO (columna J) por mes de emisión (columna C). Es la mejor
  // estimación de facturación futura que tiene la empresa, y ya está cargada — no hay que inventarla.
  const v = await google.readSheetValues(ID, 'Cobranzas!C5:J200')
  const out = {}
  for (const f of v) {
    const fecha = String(f?.[0] ?? '').trim()
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(fecha)
    if (!m) continue
    const per = `${m[3]}-${String(m[2]).padStart(2, '0')}`
    const neto = parseFloat(String(f?.[7] ?? '').replace(/[^0-9,.-]/g, '').replace(/\./g, '').replace(',', '.')) || 0
    out[per] = (out[per] ?? 0) + neto
  }
  return out
}

async function planesDePago() {
  // Los planes viven en Compras con el rubro "Deuda previsional (planes de pago)". Se agrupan por
  // plan mirando el texto: son tres ("931 Dic 25", "931 Enero 26", "Plan F931 W303094").
  const r = await query(`
    select concepto, total, fecha_pago
      from public.costos_obra
     where origen = 'compras_sheet'
       and concepto ~* 'deuda previcional|deuda previsional|plan f931'
     order by fecha_pago`)
  const planes = new Map()
  for (const x of r.rows) {
    const c = String(x.concepto ?? '')
    const nombre = /w303094/i.test(c) ? 'Plan F931 W303094 (financiación junio)'
      : /dic\s*25/i.test(c) ? 'Deuda previsional F931 Diciembre 2025'
        : /enero\s*26/i.test(c) ? 'Deuda previsional F931 Enero 2026'
          : 'Otro plan'
    const p = planes.get(nombre) ?? { nombre, cuotas: 0, total: 0, primera: null, ultima: null, monto_cuota: 0 }
    p.cuotas++
    p.total += Number(x.total) || 0
    const f = x.fecha_pago ? new Date(x.fecha_pago).toISOString().slice(0, 10) : null
    if (f && (!p.primera || f < p.primera)) p.primera = f
    if (f && (!p.ultima || f > p.ultima)) p.ultima = f
    p.monto_cuota = Math.round(p.total / p.cuotas)
    planes.set(nombre, p)
  }
  return [...planes.values()].sort((a, b) => b.total - a.total)
}

function grilla(iva, planes) {
  const filas = []
  const push = (c = []) => { const r = [...c]; while (r.length < ANCHO) r.push(''); filas.push(r); return filas.length }
  const hoy = new Date().toISOString().slice(0, 10)

  push(['IMPUESTOS Y FINANCIEROS'])
  push([`Al ${hoy}. El IVA sale de los comprobantes reales de ARCA (tabla comprobantes_arca del OS), no de una fórmula del Sheet: por eso al lado de cada mes va de cuántos comprobantes salió. Los planes de pago y el financiero son fórmulas contra Compras.`])
  push()

  // ── 1. IVA ──────────────────────────────────────────────────────────────────────────────────────
  push(['1. POSICIÓN DE IVA — con el saldo a favor arrastrado, que es lo que se paga de verdad'])
  const cab = push(['Mes', 'Débito fiscal (ventas)', 'Crédito fiscal (compras)', 'Posición del mes', 'Saldo a favor que venía', 'A PAGAR', 'Saldo a favor que queda', 'Comprobantes (vta/cpa)', 'Origen'])
  const f0 = filas.length + 1
  for (const m of iva) {
    const i = Number(m.periodo.slice(5, 7)) - 1
    if (!m.disponible && !m.es_proyeccion) { push([`${MES[i]}-26`, '', '', '', '', '', '', '', 'sin comprobantes cargados']); continue }
    push([
      `${MES[i]}-26`,
      Math.round(m.debito_fiscal ?? 0),
      Math.round(m.credito_fiscal ?? 0),
      Math.round(m.posicion ?? 0),
      Math.round(m.saldo_previo ?? 0),
      m.a_pagar_real == null ? '' : Math.round(m.a_pagar_real),
      Math.round(m.saldo_queda ?? 0),
      m.es_proyeccion ? '—' : `${m.n_ventas ?? 0} / ${m.n_compras ?? 0}`,
      m.es_proyeccion ? `PROYECCIÓN · ${m.metodo}` : 'ARCA — comprobantes reales',
    ])
  }
  const f1 = filas.length
  const tot = push(['TOTAL 2026',
    `=SUM(B${f0}:B${f1})`, `=SUM(C${f0}:C${f1})`, `=SUM(D${f0}:D${f1})`, '',
    `=SUM(F${f0}:F${f1})`, '', '', 'La suma de "A PAGAR" es la caja que el IVA se lleva en el año.'])
  push()
  const ult = [...iva].reverse().find((m) => m.disponible)
  push(['⚠ Saldo técnico a favor HOY', Math.round(ult?.saldo_queda ?? 0), '', '', '', '', '', '',
    'Plata de la empresa adelantada al fisco. Si crece mes a mes, hay que revisar las retenciones que sufre (Cobranzas columnas X a AA).'])
  push(['⚠ IVA pagado que figura en Compras', '=SUMIF(Compras!$AC$4:$AC;"Impuestos";Compras!$O$4:$O)', '', '', '', '', '', '',
    'Si esto da $0 y arriba hay meses "A PAGAR", el IVA se está pagando fuera del Sheet y el cash flow miente.'])
  push()

  // ── 2. IIBB ─────────────────────────────────────────────────────────────────────────────────────
  push(['2. INGRESOS BRUTOS (San Juan) — FALTA EL DATO, no lo invento'])
  const fIIBB = push(['Alícuota IIBB construcción San Juan', '', '', '', '', '', '', '',
    '← COMPLETAR ACÁ (ej. 0,025 para 2,5%). Lo sabe el contador o está en la Ley Impositiva de San Juan. Busqué la alícuota oficial en la web y no la pude confirmar; poner un número inventado sería peor que dejarlo vacío.'])
  push(['Base imponible del año (ventas netas)', `=SUM(B${f0}:B${f1})/${ALICUOTA_IVA}`, '', '', '', '', '', '',
    'Sale del débito fiscal de arriba dividido la alícuota de IVA.'])
  const fIIBBcalc = filas.length + 1
  push(['IIBB estimado del año', `=IF($B$${fIIBB}="";"(falta la alícuota)";$B$${fIIBBcalc - 1}*$B$${fIIBB})`, '', '', '', '', '', '',
    'Se calcula solo apenas se complete la alícuota. ESTIMACIÓN: no contempla convenio multilateral ni exenciones.'])
  push(['IIBB pagado que figura en Compras', '=SUMPRODUCT((REGEXMATCH(LOWER(Compras!$E$4:$E&" "&Compras!$L$4:$L);"iibb|ingresos brutos|rentas|dgr"))*IF(ISNUMBER(Compras!$O$4:$O);Compras!$O$4:$O;0))', '', '', '', '', '', '',
    'Hoy da $0: no hay ningún pago de IIBB cargado en todo el año.'])
  push()

  // ── 3. PLANES DE PAGO ───────────────────────────────────────────────────────────────────────────
  push(['3. PLANES DE PAGO DE DEUDA PREVISIONAL — F931 viejos financiados'])
  push(['Plan', 'Cuotas cargadas', 'Monto por cuota', 'Total cargado', 'Primera', 'Última', '', '', 'Origen'])
  const p0 = filas.length + 1
  for (const p of planes) push([p.nombre, p.cuotas, p.monto_cuota, Math.round(p.total), p.primera ?? '', p.ultima ?? '', '', '', 'Compras, rubro "Deuda previsional (planes de pago)"'])
  const p1 = filas.length
  push(['TOTAL PLANES', `=SUM(B${p0}:B${p1})`, '', `=SUM(D${p0}:D${p1})`, '', '', '', '', ''])
  const fCtrlP = filas.length + 1
  push(['⇒ Control contra Compras', '=SUMIF(Compras!$AC$4:$AC;"Deuda previsional (planes de pago)";Compras!$O$4:$O)', '', `=$B${fCtrlP}-$D${fCtrlP - 1}`, '', '', '', '',
    'La columna D tiene que dar $0: si no, hay cuotas que esta tabla no está viendo.'])
  push()

  // ── 4. FINANCIERO ───────────────────────────────────────────────────────────────────────────────
  push(['4. FINANCIERO — préstamos y créditos'])
  push(['Concepto', 'Total del año', 'Cuotas', '', '', '', '', '', 'Origen'])
  const b0 = filas.length + 1
  push(['Crédito prendario — Camioneta Ford XLS',
    '=SUMIF(Compras!$AC$4:$AC;"Financiero";Compras!$O$4:$O)',
    '=COUNTIF(Compras!$AC$4:$AC;"Financiero")', '', '', '', '', '',
    'Compras, rubro "Financiero". Cuotas 15 a 26 de 2026.'])
  push()

  // ── 5. LO QUE FALTA ─────────────────────────────────────────────────────────────────────────────
  push(['LO QUE FALTA PARA QUE ESTA PESTAÑA ESTÉ COMPLETA'])
  push(['· La alícuota de IIBB de San Juan para construcción (celda B' + fIIBB + ').'])
  push(['· Cargar en Compras los pagos de IVA y de IIBB que se hayan hecho. Hoy no hay ninguno y el cash flow no los ve.'])
  push(['· Revisar las retenciones de IVA que sufre la empresa (Cobranzas, columnas X a AA): son la causa probable del saldo a favor creciente.'])
  return { filas, f0, f1, tot, p0, p1, b0, cab, fIIBB }
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const ventas = await ventasProyectadas(google)
  // La regla de oro: toda proyección considera inflación, y el dato lo trae el OS de la web.
  const fi = await query("select periodo, factor_acumulado from public.factor_ajuste where indice='ipc' order by periodo")
  const factor = Object.fromEntries(fi.rows.map((r) => [r.periodo, Number(r.factor_acumulado)]))
  const iva = await posicionIvaCompleta(AÑO, ventas, factor)
  const planes = await planesDePago()
  const g = grilla(iva, planes)
  console.log(`${PESTAÑA}: ${g.filas.length} filas · ${planes.length} planes · IVA de ${iva.filter((m) => m.disponible).length} meses reales`)
  if (DRY) {
    for (const m of iva.filter((x) => x.disponible || x.es_proyeccion)) {
      console.log(`  ${m.periodo}  débito ${Math.round(m.debito_fiscal).toLocaleString('es-AR').padStart(12)}  crédito ${Math.round(m.credito_fiscal).toLocaleString('es-AR').padStart(12)}  a pagar ${Math.round(m.a_pagar_real ?? 0).toLocaleString('es-AR').padStart(12)}  saldo a favor ${Math.round(m.saldo_queda).toLocaleString('es-AR').padStart(12)}${m.es_proyeccion ? '  (proyección)' : ''}`)
    }
    for (const p of planes) console.log(`  ${p.nombre.padEnd(42)} ${p.cuotas} cuotas x ${p.monto_cuota.toLocaleString('es-AR')} = ${Math.round(p.total).toLocaleString('es-AR')}`)
    return
  }

  const hoja = (await google.getSheetMeta(ID)).find((s) => s.title === PESTAÑA)
  await google.clearValues(ID, `${PESTAÑA}!A1:Z200`)
  await google.batchUpdateValues(ID, [{ range: `${PESTAÑA}!A1:${letra(ANCHO - 1)}${g.filas.length}`, values: g.filas }])
  await formatear(google, hoja.sheetId, g)

  const v = await google.readSheetValues(ID, `${PESTAÑA}!A1:I${g.filas.length}`)
  const err = []
  v.forEach((f, i) => (f || []).forEach((c, j) => { if (/^#(REF|ERROR|N\/A|VALUE|¡|DIV|NAME|NUM|NULL)/.test(String(c ?? ''))) err.push(`${letra(j)}${i + 1}=${c}`) }))
  console.log(err.length ? `\n⚠ ${err.length} celdas en error: ${err.slice(0, 6).join(' ')}` : '\n✓ sin errores')
  console.log('\nMES    DÉBITO         CRÉDITO        A PAGAR        SALDO A FAVOR')
  for (let i = g.f0; i <= g.tot; i++) {
    const f = v[i - 1] || []
    console.log(`${String(f[0] ?? '').padEnd(7)}${String(f[1] ?? '').padStart(14)}${String(f[2] ?? '').padStart(15)}${String(f[5] ?? '').padStart(15)}${String(f[6] ?? '').padStart(16)}`)
  }
}

async function formatear(google, sheetId, g) {
  const AZUL = { red: 0.17, green: 0.25, blue: 0.37 }
  const AMBAR = { red: 1, green: 0.97, blue: 0.88 }
  const ROJO = { red: 1, green: 0.93, blue: 0.93 }
  const n = g.filas.length
  const r = (r0, r1, c0 = 0, c1 = ANCHO) => ({ sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 })
  const req = [{ unmergeCells: { range: r(0, n) } }]
  const fmt = (rg, fields, format) => req.push({ repeatCell: { range: rg, cell: { userEnteredFormat: format }, fields } })

  fmt(r(0, n, 1, 8), 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
    { numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0;[Red]-"$"#,##0;"—"' }, horizontalAlignment: 'RIGHT' })
  fmt(r(0, 1), 'userEnteredFormat.textFormat', { textFormat: { bold: true, fontSize: 13 } })
  fmt(r(1, 2), 'userEnteredFormat.textFormat,userEnteredFormat.wrapStrategy',
    { textFormat: { italic: true, fontSize: 9, foregroundColor: { red: 0.4, green: 0.4, blue: 0.45 } }, wrapStrategy: 'WRAP' })
  // La columna I es siempre explicación: nunca plata.
  fmt(r(0, n, 8, 9), 'userEnteredFormat',
    { numberFormat: { type: 'TEXT' }, horizontalAlignment: 'LEFT', textFormat: { fontSize: 9, italic: true, foregroundColor: { red: 0.4, green: 0.4, blue: 0.45 } }, wrapStrategy: 'CLIP' })
  fmt(r(g.cab - 1, g.cab), 'userEnteredFormat',
    { backgroundColor: AZUL, textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 }, fontSize: 9 }, horizontalAlignment: 'CENTER', wrapStrategy: 'WRAP' })
  // Los meses proyectados, en ámbar: nunca confundir con un comprobante real.
  const primeraProy = g.f0 + 7
  fmt(r(primeraProy - 1, g.f1), 'userEnteredFormat.backgroundColor,userEnteredFormat.textFormat', { backgroundColor: AMBAR, textFormat: { italic: true } })
  fmt(r(g.tot - 1, g.tot), 'userEnteredFormat.textFormat,userEnteredFormat.backgroundColor',
    { textFormat: { bold: true }, backgroundColor: { red: 0.89, green: 0.91, blue: 0.94 } })
  // La celda de la alícuota que hay que completar, en rojo suave: es un pedido, no un dato.
  fmt({ ...r(g.fIIBB - 1, g.fIIBB), startColumnIndex: 1, endColumnIndex: 2 },
    'userEnteredFormat.backgroundColor,userEnteredFormat.numberFormat',
    { backgroundColor: ROJO, numberFormat: { type: 'PERCENT', pattern: '0.00%' } })
  // Los encabezados de sección.
  g.filas.forEach((f, i) => {
    if (/^\d\. |^LO QUE FALTA/.test(String(f[0] ?? ''))) fmt(r(i, i + 1), 'userEnteredFormat.textFormat', { textFormat: { bold: true, fontSize: 11 } })
    if (/^(Plan|Concepto)$/.test(String(f[0] ?? ''))) fmt(r(i, i + 1), 'userEnteredFormat', { backgroundColor: AZUL, textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 }, fontSize: 9 }, horizontalAlignment: 'CENTER' })
    if (/^⚠/.test(String(f[0] ?? ''))) fmt(r(i, i + 1, 0, 1), 'userEnteredFormat.textFormat', { textFormat: { bold: true, foregroundColor: { red: 0.7, green: 0.2, blue: 0.1 } } })
  })
  // Las cuotas son cantidades.
  fmt({ ...r(g.p0 - 1, g.p1 + 1), startColumnIndex: 1, endColumnIndex: 2 }, 'userEnteredFormat.numberFormat', { numberFormat: { type: 'NUMBER', pattern: '0' } })
  fmt({ ...r(g.b0 - 1, g.b0), startColumnIndex: 2, endColumnIndex: 3 }, 'userEnteredFormat.numberFormat', { numberFormat: { type: 'NUMBER', pattern: '0' } })

  req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 280 }, fields: 'pixelSize' } })
  req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: 8 }, properties: { pixelSize: 130 }, fields: 'pixelSize' } })
  req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 8, endIndex: 9 }, properties: { pixelSize: 420 }, fields: 'pixelSize' } })
  await google.spreadsheetBatchUpdate(ID, req)
}

main().then(() => process.exit(0)).catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
