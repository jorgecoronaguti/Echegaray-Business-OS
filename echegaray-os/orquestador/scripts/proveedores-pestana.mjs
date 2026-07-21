#!/usr/bin/env node
// LA PESTAÑA PROVEEDORES — CUÁNTO SE LE DEBE A CADA UNO Y DESDE CUÁNDO.
//
// EL PEDIDO (21/07). "Quiero resolver el tema modalidad en Compras: las opciones son Pago o Cuenta
// Corriente, y la cuenta corriente genera una deuda con ese proveedor que debería quedar reflejada
// en alguna parte del Sheet."
//
// LA CORRECCIÓN QUE HACE FALTA ANTES DE CONSTRUIR NADA, medida sobre las 739 filas: la modalidad
// dice cómo se PACTÓ la compra, no si hoy se debe. De las 212 compras en cuenta corriente, 209 ya
// están pagadas. Sumarlas todas daría una deuda de $71.028.598 y la real es $16.447.674.
//
// La deuda la define un hecho más simple —hay factura y no hay pago— y ese dato ya estaba en Compras,
// en la columna X "Estado", que era una de las que nadie leía. Lo que la modalidad sí aporta es cómo
// LEER cada saldo, y por eso va en dos columnas separadas:
//   · CUENTA CORRIENTE impaga = plazo pactado. Es normal, y es financiación sin interés.
//   · PAGO impaga = atraso. Se acordó pagar contra entrega y no se pagó.
//
// POR QUÉ NO DUPLICA NADA. Esta pestaña no guarda un solo importe: son todos SUMIFS sobre Compras.
// Si mañana se corrige una factura allá, acá cambia solo. Lo único propio es el NOMBRE de cada
// proveedor, que es un rótulo y no un número.
//
//   node orquestador/scripts/proveedores-pestana.mjs [--dry]

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { hallarPestana } from '../lib/sheet-pestanas.mjs'
import { ESTADO_DEUDA, MODALIDADES, saldosPorProveedor } from '../lib/cuentas-por-pagar.mjs'
import { parseMonto, parseFecha } from '../lib/cash-briefing.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const PESTAÑA = 'Proveedores'
const DRY = process.argv.includes('--dry')
const ANCHO = 9

const letra = (i) => { let s = ''; for (let n = i; n >= 0; n = Math.floor(n / 26) - 1) s = String.fromCharCode(65 + (n % 26)) + s; return s }

// Las columnas de Compras de las que sale todo. Una sola definición.
const C = { prov: '$E$4:$E', modal: '$F$4:$F', total: '$O$4:$O', estado: '$X$4:$X', caja: '$AD$4:$AD', semaforo: '$AA$4:$AA' }
const R = (c) => `Compras!${c}`

function grilla(proveedores) {
  const filas = []
  const push = (c = []) => { const r = [...c]; while (r.length < ANCHO) r.push(''); filas.push(r); return filas.length }
  const esc = (t) => String(t).replace(/"/g, '""')

  push(['PROVEEDORES — CUENTAS POR PAGAR'])
  push([`Cuánto se le debe hoy a cada proveedor. Sale de Compras: una factura es deuda cuando su Estado dice "${ESTADO_DEUDA}". Las que dicen "Proyectado" NO son deuda —son un gasto previsto, todavía sin factura— y confundirlas multiplicaría la cifra por diez. Acá no hay ningún importe escrito: son todas fórmulas sobre Compras, así que se corrige allá y cambia solo.`])
  push()
  push(['La MODALIDAD no genera la deuda, pero cambie cómo se lee: una compra en cuenta corriente impaga es un plazo que el proveedor concedió; una marcada "Pago" impaga es un atraso, porque se había acordado pagar contra entrega.'])
  push()

  const cab = push(['Proveedor', 'Facturas', 'Deuda total', 'En cuenta corriente', 'Contra entrega (atraso)',
    'Vencida', 'Todavía no vence', 'Sin fecha de pago', 'La más vieja'])
  const f0 = filas.length + 1
  for (const p of proveedores) {
    const f = filas.length + 1
    const base = `${R(C.total)};${R(C.prov)};$A${f};${R(C.estado)};"${ESTADO_DEUDA}"`
    push([
      p.proveedor,
      `=COUNTIFS(${R(C.prov)};$A${f};${R(C.estado)};"${ESTADO_DEUDA}")`,
      `=SUMIFS(${base})`,
      `=SUMIFS(${base};${R(C.modal)};"${esc(MODALIDADES.cuentaCorriente)}")`,
      `=SUMIFS(${base};${R(C.modal)};"${esc(MODALIDADES.contado)}")`,
      // VENCIDA SE MIDE CONTRA LA FECHA DE CAJA, no contra la prevista: la columna "Fecha prevista
      // de pago" tiene el TEXTO "Pendiente" en 9 de las 14 filas con deuda, y sobre un texto no se
      // puede calcular un vencimiento. Es la razón por la que el semáforo de Compras marca "Por
      // vencer" cinco facturas que vencieron hace más de un mes.
      `=SUMIFS(${base};${R(C.caja)};">0";${R(C.caja)};"<"&TODAY())`,
      `=SUMIFS(${base};${R(C.caja)};">="&TODAY())`,
      `=C${f}-F${f}-G${f}`,
      `=IF(F${f}=0;"";TEXT(TODAY()-MINIFS(${R(C.caja)};${R(C.prov)};$A${f};${R(C.estado)};"${ESTADO_DEUDA}";${R(C.caja)};">0");"0")&" días")`,
    ])
  }
  const f1 = filas.length
  const fTot = push(['TOTAL ADEUDADO A PROVEEDORES',
    ...['B', 'C', 'D', 'E', 'F', 'G', 'H'].map((c) => `=SUM(${c}${f0}:${c}${f1})`), ''])
  push()

  // ── CONTROL ─────────────────────────────────────────────────────────────────────────────────────
  push(['CONTROL — ¿esta pestaña ve toda la deuda?'])
  const ctrl = filas.length + 1
  push([`Deuda en Compras (Estado = "${ESTADO_DEUDA}")`, '', `=SUMIFS(${R(C.total)};${R(C.estado)};"${ESTADO_DEUDA}")`, '', '', '', '', '',
    'Todas las filas de Compras con factura y sin pago.'])
  push(['Suma de esta pestaña', '', `=C${fTot}`, '', '', '', '', '', 'Tiene que dar igual: si no, hay un proveedor que no está listado.'])
  push(['⇒ Diferencia', '', `=C${ctrl}-C${ctrl + 1}`, '', '', '', '', '', 'Distinto de cero = falta un proveedor en la lista de arriba.'])
  push([])
  push(['Deuda SIN fecha de pago', '', `=H${fTot}`, '', '', '', '', '',
    '⚠ Esta plata no aparece en ninguna semana ni mes del cash flow: sin fecha, el cuadro no la puede ubicar. Cargar la fecha en Compras la hace visible.'])
  push(['Facturas donde el semáforo de Compras dice "por vencer" pero la fecha ya pasó', '',
    `=SUMPRODUCT((${R(C.estado)}="${ESTADO_DEUDA}")*(REGEXMATCH(${R(C.semaforo)}&"";"vencer"))*(${R(C.caja)}>0)*(${R(C.caja)}<TODAY())*${R(C.total)})`,
    '', '', '', '', '',
    '⚠ El semáforo de Compras se calcula con la columna "Fecha prevista de pago", que en estas filas dice el texto "Pendiente". Sobre un texto no hay vencimiento posible, así que marca verde una deuda vencida.'])
  push(['Filas con la fórmula del semáforo rota (#REF!)', '',
    `=SUMPRODUCT((${R(C.estado)}="${ESTADO_DEUDA}")*(ISERROR(${R(C.semaforo)}))*${R(C.total)})`,
    '', '', '', '', '', '⚠ Una celda en #REF! no es un estado: esa factura no la clasifica nadie.'])
  push()
  push(['CÓMO SE ACTUALIZA'])
  push(['· El agente rehace esta pestaña cada 2 horas junto con el resto del archivo. No se edita a mano.'])
  push([`· Una factura sale de acá cuando su Estado en Compras pasa a "Pagado". Mientras diga "${ESTADO_DEUDA}", se le debe.`])

  return { filas, cab, f0, f1, fTot, ctrl }
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const compras = await google.readSheetValues(ID, 'Compras!A4:AD800')
  const filas = compras.map((f) => ({
    proveedor: f?.[4], modalidad: f?.[5], total: parseMonto(f?.[14]), estado: f?.[23], fechaCaja: parseFecha(f?.[29]),
  }))
  const proveedores = saldosPorProveedor(filas, new Date())
  console.log(`${PESTAÑA}: ${proveedores.length} proveedores con deuda · $${Math.round(proveedores.reduce((s, p) => s + p.total, 0)).toLocaleString('es-AR')}`)
  for (const p of proveedores) console.log(`  ${p.proveedor.slice(0, 30).padEnd(32)}${String(p.facturas).padStart(3)} fac  $${Math.round(p.total).toLocaleString('es-AR')}`)
  if (!proveedores.length) return console.log('  sin deuda: no escribo la pestaña vacía')

  const g = grilla(proveedores)
  if (DRY) return console.log(`--dry: ${g.filas.length} filas, no escribí nada.`)

  const hojas = await google.getSheetMeta(ID)
  let hoja
  try { hoja = hallarPestana(hojas, PESTAÑA) } catch { hoja = null }
  if (!hoja) {
    const r = await google.spreadsheetBatchUpdate(ID, [{ addSheet: { properties: { title: PESTAÑA, gridProperties: { rowCount: 200, columnCount: ANCHO + 2 } } } }])
    hoja = { sheetId: r.replies[0].addSheet.properties.sheetId, title: PESTAÑA }
    console.log(`  pestaña "${PESTAÑA}" creada`)
  }

  await google.clearValues(ID, `${hoja.title}!A1:Z120`)
  await google.batchUpdateValues(ID, [{ range: `${hoja.title}!A1:${letra(ANCHO - 1)}${g.filas.length}`, values: g.filas }])
  await formatear(google, hoja.sheetId, g)

  const v = await google.readSheetValues(ID, `${hoja.title}!A1:I${g.filas.length}`)
  console.log(`\nTOTAL ADEUDADO ${v[g.fTot - 1]?.[2]} · en cuenta corriente ${v[g.fTot - 1]?.[3]} · contra entrega ${v[g.fTot - 1]?.[4]}`)
  console.log(`  vencida ${v[g.fTot - 1]?.[5]} · todavía no vence ${v[g.fTot - 1]?.[6]} · sin fecha ${v[g.fTot - 1]?.[7]}`)
  const dif = Number(String(v[g.ctrl + 1]?.[2] ?? '0').replace(/[^\d,-]/g, '').replace(/\./g, '').replace(',', '.')) || 0
  console.log(`  CONTROL diferencia contra Compras: ${v[g.ctrl + 1]?.[2]}`)
  if (Math.abs(dif) >= 1) { console.log('  ⚠ la diferencia no es $0'); process.exitCode = 1 }
}

async function formatear(google, sheetId, g) {
  const AZUL = { red: 0.17, green: 0.25, blue: 0.37 }
  const GRIS = { red: 0.93, green: 0.94, blue: 0.95 }
  const ROJO = { red: 1, green: 0.93, blue: 0.93 }
  const n = g.filas.length
  const r = (r0, r1, c0 = 0, c1 = ANCHO) => ({ sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 })
  const req = [{ unmergeCells: { range: r(0, n) } }]
  const fmt = (rg, fields, format) => req.push({ repeatCell: { range: rg, cell: { userEnteredFormat: format }, fields } })

  fmt(r(0, n, 2, 8), 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
    { numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0;[Red]-"$"#,##0;"—"' }, horizontalAlignment: 'RIGHT' })
  fmt(r(0, n, 1, 2), 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
    { numberFormat: { type: 'NUMBER', pattern: '0;;""' }, horizontalAlignment: 'CENTER' })
  fmt(r(0, n, 8, 9), 'userEnteredFormat.horizontalAlignment,userEnteredFormat.textFormat',
    { horizontalAlignment: 'CENTER', textFormat: { fontSize: 9 } })
  fmt(r(0, 1), 'userEnteredFormat.textFormat', { textFormat: { bold: true, fontSize: 13 } })
  for (const i of [1, 3]) {
    fmt(r(i, i + 1), 'userEnteredFormat.textFormat,userEnteredFormat.wrapStrategy',
      { textFormat: { italic: true, fontSize: 9, foregroundColor: { red: 0.4, green: 0.4, blue: 0.45 } }, wrapStrategy: 'WRAP' })
  }
  fmt(r(g.cab - 1, g.cab), 'userEnteredFormat',
    { backgroundColor: AZUL, textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 }, fontSize: 9 }, horizontalAlignment: 'CENTER', wrapStrategy: 'WRAP' })
  fmt(r(g.fTot - 1, g.fTot), 'userEnteredFormat.textFormat,userEnteredFormat.backgroundColor',
    { textFormat: { bold: true }, backgroundColor: GRIS })
  // La columna de lo VENCIDO en rojo suave: es la única que exige hacer algo hoy.
  fmt(r(g.f0 - 1, g.f1, 5, 6), 'userEnteredFormat.backgroundColor', { backgroundColor: ROJO })
  g.filas.forEach((f, i) => {
    const t = String(f[0] ?? '')
    if (/^CONTROL|^CÓMO SE ACTUALIZA/.test(t)) fmt(r(i, i + 1), 'userEnteredFormat.textFormat', { textFormat: { bold: true, fontSize: 11 } })
    if (/^⇒/.test(t)) fmt(r(i, i + 1), 'userEnteredFormat.textFormat', { textFormat: { bold: true } })
    if (/^·/.test(t)) fmt(r(i, i + 1), 'userEnteredFormat.textFormat', { textFormat: { italic: true, fontSize: 9, foregroundColor: { red: 0.4, green: 0.4, blue: 0.45 } } })
  })
  const ancho = [230, 70, 120, 130, 140, 120, 130, 120, 100]
  ancho.forEach((px, i) => req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 }, properties: { pixelSize: px }, fields: 'pixelSize' } }))
  await google.spreadsheetBatchUpdate(ID, req)
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
