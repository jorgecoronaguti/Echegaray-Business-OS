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
// con sus tests. La regla, re-medida el 18/08 leyendo FÓRMULAS contra las 1.151 filas vivas:
//
//     SE DEBE ⇔ X · Estado = "Pendiente"        CUÁNTO = O − T − max(U;0) − max(W;0)
//
// ═══ EL ESTADO NO SE DISCUTE CON LOS IMPORTES (18/08) ═══
//
// Acá vivía un `--sin-filtro-de-estado` para imprimir "la otra versión" —la que ignora el Estado y le
// cree a los importes— y subía el titular $11.919.063. Se fue, y la contradicción que publicaba el
// encabezado de "Proveedores" también. Motivo: `Monto Pagado` es una FÓRMULA (`=IF(F="pago";O;0)`,
// 361 filas) que depende de la Modalidad, y `Monto Parcial 1` es `=T-O` en 716 de sus 717 celdas con
// contenido. No son dos testigos de un pago: son la misma celda derivada dos veces. El único dato
// tipeado por una persona en esa fila es el ESTADO —517 filas con el literal escrito ENCIMA de la
// fórmula— y una palabra tipeada sobre una fórmula viva es la declaración más fuerte que hay.
//
// Lo que sí se informa acá, sin un peso al lado: cuántas filas tienen el estado tipeado
// contradiciendo su propia fórmula. Es el único cruce entre dos fuentes distintas de este archivo, y
// sirve para mirar la carga —no para corregir una deuda.
//
//   node orquestador/scripts/compras-saldo-pendiente.mjs            → muestra qué haría
//   node orquestador/scripts/compras-saldo-pendiente.mjs --aplicar  → escribe y verifica

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import {
  COL, estadoTipeadoQueContradice, formulaSaldoPendiente, posicionComercial, ROTULO_SALDO,
} from '../lib/deuda-por-tramos.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const APLICAR = process.argv.includes('--aplicar')
const plata = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-AR')
const letra = (n) => { let s = ''; let x = n + 1; while (x > 0) { const r = (x - 1) % 26; s = String.fromCharCode(65 + r) + s; x = (x - 1 - r) / 26 } return s }

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const meta = await google.getSheetMeta(ID)
  const compras = meta.find((s) => s.title === 'Compras')
  if (!compras) throw new Error('no encontré la pestaña Compras: no escribo a ciegas')

  const col = letra(COL.saldo)
  const formula = formulaSaldoPendiente()
  console.log(`COLUMNA ${col} · "${ROTULO_SALDO}" · grilla ${compras.rows}×${compras.cols}`)
  console.log(formula)

  // ── LA POSICIÓN, CALCULADA EN JS ANTES DE ESCRIBIR NADA.
  // Es la misma aritmética que va a la celda, corrida acá para poder compararla contra lo que el
  // archivo devuelva después. Un control no se valida contra la información que él mismo produce:
  // éstos son dos caminos —JS y Sheets— al mismo número.
  const filas = await google.readSheetValues(ID, 'Compras!A4:AN', { render: 'UNFORMATTED_VALUE' })
  const pos = posicionComercial(filas ?? [])
  console.log(`\nDEUDA COMERCIAL (JS)  ${plata(pos.enElCuadro.monto)} en ${pos.enElCuadro.n} factura(s)`)
  if (pos.pendienteSinSaldo.n) console.log(`  ○ ${pos.pendienteSinSaldo.n} fila(s) "Pendiente" sin saldo: inflan el conteo, no la plata`)

  // ── EL ÚNICO CRUCE INDEPENDIENTE: LA PALABRA TIPEADA CONTRA LA ARITMÉTICA.
  //
  // Se informa SIN un importe al lado, y es a propósito. Un número en pesos impreso debajo de la
  // deuda se lee como deuda diga lo que diga el rótulo — es exactamente cómo $11.919.063 de facturas
  // pagadas terminaron publicados al lado del TOTAL de "Proveedores" durante cuatro días.
  const formulas = await google.readSheetValues(ID, 'Compras!A4:AN', { render: 'FORMULA' })
  const tipeados = []
  for (const [i, f] of (formulas ?? []).entries()) {
    const d = estadoTipeadoQueContradice(f, (filas ?? [])[i] ?? [])
    if (d) tipeados.push({ fila: i + 4, ...d })
  }
  if (tipeados.length) {
    const por = new Map()
    for (const t of tipeados) por.set(`${t.tipeado} (la fórmula diría ${t.calculado})`, (por.get(`${t.tipeado} (la fórmula diría ${t.calculado})`) ?? 0) + 1)
    console.log(`  ○ ${tipeados.length} fila(s) con el Estado TIPEADO encima de su fórmula:`)
    for (const [k, n] of [...por].sort((a, b) => b[1] - a[1])) console.log(`      ${String(n).padStart(4)} · ${k}`)
    console.log('      manda lo tipeado: es lo único que declaró una persona. Se informa, no se corrige.')
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
