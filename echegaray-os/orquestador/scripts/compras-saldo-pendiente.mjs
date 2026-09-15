#!/usr/bin/env node
// LE DA DUEÑO A «Saldo pendiente (OS)» EN COMPRAS — la columna de la que cuelga toda la pestaña Proveedores.
//
// ═══ EL PEDIDO, TEXTUAL (14/08) ═══
//
// *"tomaba mal columnas de compras"* · *"esta considerando mal las columnas de montos adeudados y
// pagos parciales en pestaña compras por ende los valores son equivocados"*.
//
// ═══ LO PRIMERO QUE APARECIÓ NO FUE UNA FÓRMULA MAL ESCRITA: FUE UNA FÓRMULA SIN DUEÑO ═══
//
// El titular de "Proveedores", su aging, el cuadro por proveedor y el detalle —las cuatro vistas—
// suman esa columna. No la escribía ningún script, no la cubría ningún test y no estaba en `PASOS`:
// vivía tipeada a mano en la celda del ancla. El criterio y su porqué viven en
// `lib/deuda-por-tramos.mjs`, con sus tests:
//
//     SE DEBE ⇔ Estado = "Pendiente"        CUÁNTO = Total − Monto Pagado − Monto Parcial 2
//
// ═══ LA COLUMNA SALE DEL RÓTULO (14/09/2026) ═══
//
// Era `COL.saldo = 37` (AL). Con «Obra» insertada en L el saldo pasa a la AM y la AL es «¿Comprobante
// repetido? (OS)»: la corrida siguiente le habría escrito el saldo encima a otra ARRAYFORMULA. Se
// resuelve contra la fila viva, pasa por el portón y la fórmula se ancla traducida a ese layout. La
// aritmética de JS (`posicionComercial`) sigue indexando el layout de referencia: se le pasan las
// filas llevadas a ese layout por rótulo, no por posición.
//
//   node orquestador/scripts/compras-saldo-pendiente.mjs            → muestra qué haría
//   node orquestador/scripts/compras-saldo-pendiente.mjs --aplicar  → escribe y verifica

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { estadoTipeadoQueContradice, formulaSaldoPendiente, posicionComercial, ROTULO_SALDO } from '../lib/deuda-por-tramos.mjs'
import { lectorDeEncabezados, rangoFilas } from '../lib/columnas-por-encabezado.mjs'
import { columnaParaEscribir, filasAlLayoutDeReferencia, portonDeRequests } from '../lib/compras-layout.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const APLICAR = process.argv.includes('--aplicar')
const ESCRITOR = 'compras-saldo-pendiente'
const plata = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-AR')

/** NÚCLEO PURO: los dos requests (rótulo y ancla) contra la fila de rótulos viva, pasados por el portón. */
export function requestsDeSaldo(encabezado, sheetId) {
  const col = columnaParaEscribir(encabezado, ESCRITOR, 'saldo')
  const celda = (fila, valor) => ({ updateCells: {
    range: { sheetId, startRowIndex: fila, endRowIndex: fila + 1, startColumnIndex: col.indice, endColumnIndex: col.indice + 1 },
    rows: [{ values: [{ userEnteredValue: valor }] }], fields: 'userEnteredValue' } })
  const req = [celda(2, { stringValue: ROTULO_SALDO }), celda(3, { formulaValue: formulaSaldoPendiente(encabezado) })]
  return { col, req: portonDeRequests(encabezado, ESCRITOR, req) }
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const compras = (await google.getSheetMeta(ID)).find((s) => s.title === 'Compras')
  if (!compras) throw new Error('no encontré la pestaña Compras: no escribo a ciegas')
  const encabezado = await lectorDeEncabezados(google, ID).encabezado('Compras')
  const { col, req } = requestsDeSaldo(encabezado, compras.sheetId)
  console.log(`COLUMNA ${col.letra} · "${ROTULO_SALDO}" · grilla ${compras.rows}×${compras.cols}`)
  console.log(formulaSaldoPendiente(encabezado))

  // ── LA POSICIÓN, CALCULADA EN JS ANTES DE ESCRIBIR NADA: dos caminos —JS y Sheets— al mismo número.
  const filas = await google.readSheetValues(ID, rangoFilas('Compras', 4), { render: 'UNFORMATTED_VALUE' })
  const pos = posicionComercial(filasAlLayoutDeReferencia(filas ?? [], encabezado))
  console.log(`\nDEUDA COMERCIAL (JS)  ${plata(pos.enElCuadro.monto)} en ${pos.enElCuadro.n} factura(s)`)
  if (pos.pendienteSinSaldo.n) console.log(`  ○ ${pos.pendienteSinSaldo.n} fila(s) "Pendiente" sin saldo: inflan el conteo, no la plata`)

  // ── EL ÚNICO CRUCE INDEPENDIENTE: LA PALABRA TIPEADA CONTRA LA ARITMÉTICA. Sin un importe al lado.
  const formulas = await google.readSheetValues(ID, rangoFilas('Compras', 4), { render: 'FORMULA' })
  const [fRef, vRef] = [filasAlLayoutDeReferencia(formulas ?? [], encabezado), filasAlLayoutDeReferencia(filas ?? [], encabezado)]
  const por = new Map()
  let tipeados = 0
  for (const [i, f] of fRef.entries()) {
    const d = estadoTipeadoQueContradice(f, vRef[i] ?? [])
    if (!d) continue
    tipeados++
    const k = `${d.tipeado} (la fórmula diría ${d.calculado})`
    por.set(k, (por.get(k) ?? 0) + 1)
  }
  if (tipeados) {
    console.log(`  ○ ${tipeados} fila(s) con el Estado TIPEADO encima de su fórmula:`)
    for (const [k, n] of [...por].sort((a, b) => b[1] - a[1])) console.log(`      ${String(n).padStart(4)} · ${k}`)
    console.log('      manda lo tipeado: es lo único que declaró una persona. Se informa, no se corrige.')
  }
  if (!APLICAR) { console.log('\n(sin --aplicar: no se escribió nada)'); return }

  // SE ESCRIBE EL ANCLA Y NADA MÁS. Escribir el derrame de un ARRAYFORMULA rompe la fórmula entera.
  await google.spreadsheetBatchUpdate(ID, req, { espejo: true })

  // ── LA EVIDENCIA ES DEL EFECTO: el dato releído del archivo contra la cuenta de JS.
  const despues = await google.readSheetValues(ID, rangoFilas('Compras', 4), { render: 'UNFORMATTED_VALUE' })
  const saldos = (despues ?? []).map((f) => Number(f?.[col.indice]) || 0)
  const enElSheet = saldos.filter((v) => v > 1).reduce((a, v) => a + v, 0)
  const negativos = saldos.filter((v) => v < -1).length
  const errores = (despues ?? []).filter((f) => /#(REF|NAME|VALUE|DIV|N\/A|ERROR|¿NOMBRE)/i.test(String(f?.[col.indice] ?? '')))
  console.log(`\nLEÍDO DEL ARCHIVO   ${plata(enElSheet)}`)
  if (errores.length) { console.error(`✗✗ ${errores.length} celda(s) de ${col.letra} en error`); process.exitCode = 1; return }
  if (negativos) console.log(`  ⚠ ${negativos} fila(s) con saldo NEGATIVO: se pagó más que el total. Es un dato mal cargado en Compras.`)
  const dif = Math.round(enElSheet - pos.enElCuadro.monto)
  if (Math.abs(dif) <= 1) console.log('✓ el Sheet y la aritmética de JS dan el mismo total, al peso')
  else { console.error(`✗✗ difieren en ${plata(dif)}: la fórmula del archivo no es la de deuda-por-tramos`); process.exitCode = 1 }
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e.message ?? e); process.exit(1) })
}
