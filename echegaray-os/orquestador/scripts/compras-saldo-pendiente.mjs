#!/usr/bin/env node
// LE DA DUEÑO A `Compras!AL · Saldo pendiente (OS)` — la columna de la que cuelga toda la pestaña.
//
// ═══ EL PEDIDO, TEXTUAL (14/08) ═══
//
// *"tomaba mal columnas de compras"* · *"esta considerando mal las columnas de montos adeudados y
// pagos parciales en pestaña compras por ende los valores son equivocados"*.
//
// ═══ LO PRIMERO QUE APARECIÓ NO FUE UNA FÓRMULA MAL ESCRITA: FUE UNA FÓRMULA SIN DUEÑO ═══
//
// El titular de "Proveedores", su aging, el cuadro por proveedor y el detalle —las cuatro vistas—
// suman esa columna. Buscándola en el repositorio no aparecía: no la escribía ningún script, no la
// cubría ningún test y no estaba en `PASOS`. Vivía tipeada a mano en la celda AL4. Un número así no
// puede estar bien ni mal a propósito: nadie es responsable de lo que dice.
//
// Este script es la puerta al archivo; el criterio y su porqué viven en `lib/deuda-por-tramos.mjs`,
// con sus tests. La regla, medida contra las 843 filas vivas:
//
//     pagado = T + max(U;0) + max(W;0)          saldo = O − pagado
//
// Un `Monto Parcial` NEGATIVO no es un pago: es LO QUE FALTA, escrito entre paréntesis (Gerson
// Castro: O=2.300.000 · T=1.000.000 · U=−1.300.000). Sumarlo como pago da deuda CERO donde faltan
// $1,3M; restarlo de nuevo la duplica — medido, $30.167.844 contra $15.083.922, el doble exacto.
//
// ═══ LO QUE ESTE SCRIPT NO DECIDE, Y ES DELIBERADO ═══
//
// La fórmula sigue mirando el ESTADO (`X = "Pendiente"`). Sacarlo mueve el titular $11.919.063 hacia
// arriba: son ocho facturas comerciales que dicen "Pagado" con el monto pagado en CERO y el
// paréntesis declarando que falta la plata entera. O se pagaron y la columna quedó con basura vieja,
// o no se pagaron y hay $11,9M de deuda que nadie ve. Las dos son posibles, tiene efecto económico y
// no lo firma un generador. `--sin-filtro-de-estado` imprime la otra versión para compararlas con el
// dueño delante; el encabezado de "Proveedores" ya publica esa contradicción al lado del total.
//
//   node orquestador/scripts/compras-saldo-pendiente.mjs            → muestra qué haría
//   node orquestador/scripts/compras-saldo-pendiente.mjs --aplicar  → escribe y verifica

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import {
  COL, formulaSaldoPendiente, paréntesisQueNoCierran, posicionComercial, ROTULO_SALDO,
} from '../lib/deuda-por-tramos.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const APLICAR = process.argv.includes('--aplicar')
const SIN_FILTRO = process.argv.includes('--sin-filtro-de-estado')
const plata = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-AR')
const letra = (n) => { let s = ''; let x = n + 1; while (x > 0) { const r = (x - 1) % 26; s = String.fromCharCode(65 + r) + s; x = (x - 1 - r) / 26 } return s }

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const meta = await google.getSheetMeta(ID)
  const compras = meta.find((s) => s.title === 'Compras')
  if (!compras) throw new Error('no encontré la pestaña Compras: no escribo a ciegas')

  const col = letra(COL.saldo)
  const formula = formulaSaldoPendiente({ soloPendiente: !SIN_FILTRO })
  console.log(`COLUMNA ${col} · "${ROTULO_SALDO}" · grilla ${compras.rows}×${compras.cols}`)
  console.log(formula)

  // ── LA POSICIÓN, CALCULADA EN JS ANTES DE ESCRIBIR NADA.
  // Es la misma aritmética que va a la celda, corrida acá para poder compararla contra lo que el
  // archivo devuelva después. Un control no se valida contra la información que él mismo produce:
  // éstos son dos caminos —JS y Sheets— al mismo número.
  const filas = await google.readSheetValues(ID, 'Compras!A4:AN', { render: 'UNFORMATTED_VALUE' })
  const pos = posicionComercial(filas ?? [])
  console.log(`\nDEUDA COMERCIAL (JS)  ${plata(pos.enElCuadro.monto)} en ${pos.enElCuadro.n} factura(s)`)
  if (pos.contradictorio.n) {
    console.log(`  ⚠ ${pos.contradictorio.n} factura(s) dicen "Pagado" y los importes dicen que falta`
      + ` ${plata(pos.contradictorio.monto)} — NO entran al total (lo decide el dueño):`)
    for (const f of pos.contradictorio.filas) {
      console.log(`      ${f.proveedor.padEnd(30)} ${f.comprobante.padEnd(16)} ${plata(f.saldo).padStart(13)}`)
    }
    console.log(`  TECHO si resultaran impagas: ${plata(pos.techo)}`)
  }
  if (pos.pendienteSinSaldo.n) console.log(`  ○ ${pos.pendienteSinSaldo.n} fila(s) "Pendiente" sin saldo: inflan el conteo, no la plata`)
  const noCierran = paréntesisQueNoCierran(filas ?? [])
  if (noCierran.length) {
    console.log(`  ⚠ ${noCierran.length} fila(s) donde el paréntesis y la aritmética no coinciden:`)
    for (const f of noCierran.slice(0, 8)) {
      console.log(`      ${f.proveedor.padEnd(30)} calculado ${plata(f.saldo).padStart(13)} · declarado ${plata(f.declarado).padStart(13)}`)
    }
  }

  // ── LA GUARDA: la celda destino tiene que ser MÍA o estar vacía.
  //
  // Hoy tiene una fórmula tipeada a mano que hace la misma cuenta. Se pisa a propósito —es el punto
  // del paso: pasar de "alguien la escribió una vez" a "la escribe el OS y la cubren tests"— pero el
  // RÓTULO tiene que seguir siendo el mismo. Si la columna dice otra cosa, es de otro y no se toca.
  const cabecera = await google.readSheetValues(ID, `Compras!${col}3:${col}3`, { render: 'FORMATTED_VALUE' })
  const rotuloActual = String(cabecera?.[0]?.[0] ?? '').trim()
  if (rotuloActual && rotuloActual !== ROTULO_SALDO) {
    throw new Error(`la columna ${col} de Compras dice "${rotuloActual}" y no "${ROTULO_SALDO}". No es mía: no la piso.`)
  }
  if (SIN_FILTRO && APLICAR) {
    throw new Error('--sin-filtro-de-estado sube el titular $11,9M: eso lo firma el dueño, no un script. Es sólo para mirar.')
  }
  if (!APLICAR) { console.log('\n(sin --aplicar: no se escribió nada)'); return }

  if (compras.cols <= COL.saldo) {
    await google.spreadsheetBatchUpdate(ID, [{ appendDimension: {
      sheetId: compras.sheetId, dimension: 'COLUMNS', length: COL.saldo + 1 - compras.cols } }], { espejo: true })
  }

  // SE ESCRIBE EL ANCLA Y NADA MÁS. Escribir el derrame de un ARRAYFORMULA rompe la fórmula entera:
  // ver la lección "Fórmula por API va en locale". El rótulo va aparte, en la fila 3.
  await google.spreadsheetBatchUpdate(ID, [
    { updateCells: {
      range: { sheetId: compras.sheetId, startRowIndex: 2, endRowIndex: 3, startColumnIndex: COL.saldo, endColumnIndex: COL.saldo + 1 },
      rows: [{ values: [{ userEnteredValue: { stringValue: ROTULO_SALDO } }] }], fields: 'userEnteredValue' } },
    { updateCells: {
      range: { sheetId: compras.sheetId, startRowIndex: 3, endRowIndex: 4, startColumnIndex: COL.saldo, endColumnIndex: COL.saldo + 1 },
      rows: [{ values: [{ userEnteredValue: { formulaValue: formula } }] }], fields: 'userEnteredValue' } },
  ], { espejo: true })

  // ── LA EVIDENCIA ES DEL EFECTO: el dato releído del archivo contra la cuenta de JS.
  const despues = await google.readSheetValues(ID, 'Compras!A4:AN', { render: 'UNFORMATTED_VALUE' })
  const saldos = (despues ?? []).map((f) => Number(f?.[COL.saldo]) || 0)
  // Se comparan las filas CON SALDO, que son las que el cuadro muestra. Sumar la columna entera
  // mezclaría un eventual negativo —una fila donde lo pagado supera al total, que es un error de
  // carga y no una deuda— y haría creer que la fórmula está mal cuando lo que está mal es un dato.
  const enElSheet = saldos.filter((v) => v > 1).reduce((a, v) => a + v, 0)
  const negativos = saldos.filter((v) => v < -1).length
  const errores = (despues ?? []).filter((f) => /#(REF|NAME|VALUE|DIV|N\/A|ERROR|¿NOMBRE)/i.test(String(f?.[COL.saldo] ?? '')))
  console.log(`\nLEÍDO DEL ARCHIVO   ${plata(enElSheet)}`)
  if (errores.length) { console.error(`✗✗ ${errores.length} celda(s) de ${col} en error`); process.exitCode = 1; return }
  if (negativos) console.log(`  ⚠ ${negativos} fila(s) con saldo NEGATIVO: se pagó más que el total. Es un dato mal cargado en Compras.`)
  const dif = Math.round(enElSheet - pos.enElCuadro.monto)
  if (Math.abs(dif) <= 1) console.log('✓ el Sheet y la aritmética de JS dan el mismo total, al peso')
  else { console.error(`✗✗ difieren en ${plata(dif)}: la fórmula del archivo no es la de deuda-por-tramos`); process.exitCode = 1 }
}

main().catch((e) => { console.error(e.message ?? e); process.exit(1) })
