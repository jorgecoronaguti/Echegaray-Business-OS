#!/usr/bin/env node
// ESCRIBE EL ENCABEZADO DE PROVEEDORES Y LE DA EL FORMATO.
//
// El contenido y su porqué están en `orquestador/lib/proveedores-encabezado.mjs` (13 tests).
// Acá está la puerta al archivo y el criterio VISUAL, que es la otra mitad del pedido:
//
// ═══ MINIMALISMO Y CLASE MUNDIAL, COMO REGLAS EJECUTABLES ═══
//
// · SIN CUADRÍCULA. Lo primero que separa un informe de una planilla. La cuadrícula de fondo es
//   ruido: la alineación ya agrupa los números.
// · UNA SOLA LÍNEA, Y EN UNA SOLA DIRECCIÓN. Regla fina y gris debajo del rótulo y arriba del
//   total. Nunca bordes verticales, nunca una caja alrededor de la tabla.
// · EL CERO SE ESCRIBE "—". Un tramo sin deuda tiene que verse vacío de un vistazo. `$0` obliga a
//   leer el número para descubrir que no hay nada.
// · EL SÍMBOLO $ SÓLO EN LA FILA DEL TOTAL. Repetirlo en cada fila es tinta que no informa: la
//   moneda ya está declarada arriba y no cambia.
// · NÚMEROS A LA DERECHA, TEXTO A LA IZQUIERDA, sin excepción — es lo que permite comparar
//   magnitudes de un vistazo sin leer las cifras.
// · SIN COLOR SALVO PARA UNA COSA. El único color es el rojo del control cuando algo no cierra.
//   Un tablero donde todo está pintado no distingue nada.
// · NADA COMBINADO. Una celda combinada rompe ordenar, filtrar, las dinámicas y la API.
//
//   node orquestador/scripts/proveedores-encabezado-aplicar.mjs            → muestra qué haría
//   node orquestador/scripts/proveedores-encabezado-aplicar.mjs --aplicar  → escribe y verifica

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { grillaEncabezado, celdasEncabezado, F } from '../lib/proveedores-encabezado.mjs'
// Los anchos de columna son de TODA la pestaña: su definición vive una sola vez y este script es el
// único que la aplica. Ver el lib: el encabezado los fijaba mirando sólo su propio cuadro.
import { requestsDeAncho } from '../lib/proveedores-frontera.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const PESTAÑA = 'Proveedores'
const APLICAR = process.argv.includes('--aplicar')
const ANCHO = 8

const GRIS = { red: 0.62, green: 0.62, blue: 0.62 }
const TINTA = { red: 0.13, green: 0.13, blue: 0.13 }
const TENUE = { red: 0.45, green: 0.45, blue: 0.45 }
const ROJO = { red: 0.7, green: 0.11, blue: 0.11 }
/** El cero como raya: un tramo sin deuda se ve vacío sin leerlo. */
// EL NEGATIVO VA ENTRE PARÉNTESIS, NO CON SIGNO MENOS.
//
// No es gusto: es lo que exigen AICPA y FASB bajo US GAAP, lo endosa IFRS y lo pide la SEC en las
// presentaciones de sociedades. El motivo es de lectura, no de norma: un guion chico se confunde
// con una marca de impresión o se pasa por alto, y leer mal un solo número tuerce todo el análisis.
// El paréntesis se ve aunque se lea rápido y no rompe la alineación de la columna.
const MONTO = { type: 'NUMBER', pattern: '#,##0;(#,##0);"—"' }
const MONTO_TOTAL = { type: 'CURRENCY', pattern: '"$"#,##0;("$"#,##0);"—"' }
const PORCENTAJE = { type: 'PERCENT', pattern: '0%;(0%);"—"' }
const ENTERO = { type: 'NUMBER', pattern: '#,##0;(#,##0);"—"' }
const TEXTO = { type: 'TEXT', pattern: '@' }
const LINEA = { style: 'SOLID', width: 1, color: GRIS }

const celda = (sheetId, fila, col, cell, fields) => ({ repeatCell: {
  range: { sheetId, startRowIndex: fila - 1, endRowIndex: fila, startColumnIndex: col, endColumnIndex: col + 1 },
  cell, fields } })
const rango = (sheetId, f1, f2, c1, c2, cell, fields) => ({ repeatCell: {
  range: { sheetId, startRowIndex: f1 - 1, endRowIndex: f2, startColumnIndex: c1, endColumnIndex: c2 },
  cell, fields } })

function pedidosDeFormato(sheetId, anchoHoja) {
  const p = []
  const FMT = 'userEnteredFormat'
  // Base: todo el bloque limpio, sin herencia de la corrida anterior. La limpieza va hasta el
  // BORDE DE LA HOJA, no hasta donde escribo: el borde gris de un rótulo viejo sobrevive a la
  // derecha de mi última columna y se ve como una línea que sale de la nada.
  p.push(rango(sheetId, 1, F.fin, 0, Math.max(anchoHoja, ANCHO), {
    userEnteredFormat: {
      numberFormat: TEXTO, horizontalAlignment: 'LEFT', verticalAlignment: 'MIDDLE',
      textFormat: { bold: false, fontSize: 10, foregroundColor: TINTA },
      borders: {}, backgroundColorStyle: { rgbColor: { red: 1, green: 1, blue: 1 } },
    },
  }, `${FMT}.numberFormat,${FMT}.horizontalAlignment,${FMT}.verticalAlignment,${FMT}.textFormat,${FMT}.borders,${FMT}.backgroundColorStyle`))

  p.push(celda(sheetId, F.titulo, 0, { userEnteredFormat: { textFormat: { bold: true, fontSize: 16, foregroundColor: TINTA } } }, `${FMT}.textFormat`))
  p.push(celda(sheetId, F.bajada, 0, { userEnteredFormat: { textFormat: { fontSize: 9, foregroundColor: TENUE } } }, `${FMT}.textFormat`))

  // Rótulos: negrita, chicos, con la única línea del cuadro debajo.
  for (const [c1, c2] of [[0, 4], [5, ANCHO]]) {
    p.push(rango(sheetId, F.rotulos, F.rotulos, c1, c2, {
      userEnteredFormat: { textFormat: { bold: true, fontSize: 9, foregroundColor: TENUE }, borders: { bottom: LINEA } },
    }, `${FMT}.textFormat,${FMT}.borders`))
    p.push(rango(sheetId, F.rotulos, F.rotulos, c1 + 1, c2, { userEnteredFormat: { horizontalAlignment: 'RIGHT' } }, `${FMT}.horizontalAlignment`))
  }

  // ═══ EL FORMATO SALE DE LA ESPECIE DECLARADA, NO DE UNA LISTA DE RANGOS (14/08/2026) ═══
  //
  // Acá había ocho `rango(...)` y seis `celda(...)` escritos a mano, uno por bloque del cuadro. Cada
  // uno correcto, y el conjunto incompleto: `F.noMostrada` —la fila "Dicen «Pagado» y falta plata",
  // que nació después— no estaba en ninguno, así que sus dos números se quedaron con el TEXTO del
  // reset base y la pestaña publicó `11919062,68` al lado de columnas que dicen "$15.097.040".
  //
  // El formato de una celda no puede depender de que alguien se acuerde de agregarla a una lista que
  // vive en otro archivo. Ahora se recorre la grilla ENTERA y cada celda pide el formato de la especie
  // que declaró donde se escribió su valor (ver lib/proveedores-encabezado.mjs). Una fila nueva se
  // dibuja bien el día que se escribe, sin tocar este archivo.
  const PORESPECIE = { monto: MONTO, montoTotal: MONTO_TOTAL, porcentaje: PORCENTAJE, entero: ENTERO }
  for (const [i, fila] of celdasEncabezado().entries()) {
    for (const [j, c] of fila.entries()) {
      const nf = c && PORESPECIE[c.t]
      if (!nf) continue
      p.push(celda(sheetId, i + 1, j, { userEnteredFormat: { numberFormat: nf, horizontalAlignment: 'RIGHT' } }, `${FMT}.numberFormat,${FMT}.horizontalAlignment`))
    }
  }

  // Totales: negrita y línea arriba. El signo $ de la fila del total ya lo puso su especie
  // `montoTotal` en el bucle de arriba: repetirlo acá sería la segunda lista que se desincroniza.
  const total = (fila, c1, c2) => {
    p.push(rango(sheetId, fila, fila, c1, c2, { userEnteredFormat: { textFormat: { bold: true, fontSize: 10, foregroundColor: TINTA }, borders: { top: LINEA } } }, `${FMT}.textFormat,${FMT}.borders`))
  }
  total(F.totalAging, 0, 4)
  total(F.totalMedios, 5, ANCHO)

  // La línea de ARCA: no es deuda, no se suma a nada, y por eso va tenue y sin borde.
  for (const col of [5, 6, 7]) {
    p.push(celda(sheetId, F.arca, col, { userEnteredFormat: { textFormat: { fontSize: 9, foregroundColor: TENUE }, borders: {} } }, `${FMT}.textFormat,${FMT}.borders`))
  }
  // LA FILA QUE CUELGA DEL TOTAL NO ES EL TOTAL. Está pegada abajo a propósito —la contradicción tiene
  // que leerse junto al número que contradice— pero sin esto hereda la negrita y la regla de la fila de
  // arriba, y un aviso dibujado como subtotal se lee como plata que suma.
  p.push(rango(sheetId, F.noMostrada, F.noMostrada, 0, ANCHO, { userEnteredFormat: { textFormat: { bold: false, fontSize: 9, foregroundColor: TENUE }, borders: {} } }, `${FMT}.textFormat,${FMT}.borders`))

  p.push(celda(sheetId, F.control, 0, { userEnteredFormat: { textFormat: { fontSize: 9, foregroundColor: TENUE } } }, `${FMT}.textFormat`))
  // El único color de la pestaña: rojo cuando el control no cierra.
  p.push({ addConditionalFormatRule: { index: 0, rule: {
    ranges: [{ sheetId, startRowIndex: F.control - 1, endRowIndex: F.control, startColumnIndex: 0, endColumnIndex: 1 }],
    booleanRule: { condition: { type: 'TEXT_STARTS_WITH', values: [{ userEnteredValue: '✗' }] },
      format: { textFormat: { bold: true, foregroundColor: ROJO } } } } } })

  // Sin cuadrícula: es lo que convierte la planilla en un informe.
  p.push({ updateSheetProperties: { properties: { sheetId, gridProperties: { hideGridlines: true, frozenRowCount: 2 } }, fields: 'gridProperties.hideGridlines,gridProperties.frozenRowCount' } })
  // ═══ LOS ANCHOS SON DE LA PESTAÑA ENTERA, ASÍ QUE SU DEFINICIÓN ES UNA SOLA (04/08) ═══
  //
  // Acá vivía la tabla de anchos, medida para el cuadro de la posición y nada más. Abajo de la fila
  // 176 hay tablas de siete columnas con importes de nueve dígitos, y el resultado era texto cortado
  // en toda la pestaña: "$209.231.2", "Qué e", "⇒ Materiales que ninguna familia está mira". Un ancho
  // no se puede decidir mirando un solo bloque porque no existe "ancho por bloque".
  //
  // La definición se mudó a lib/proveedores-frontera.mjs, que ya es el módulo de la geometría
  // compartida de esta pestaña. Este script sigue siendo el único que la APLICA —para que no haya dos
  // escritores peleando por la misma propiedad—, pero ya no es el que la decide solo.
  p.push(...requestsDeAncho(sheetId))
  return p
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const meta = await google.getSheetMeta(ID)
  const hoja = meta.find((s) => s.title === PESTAÑA)
  if (!hoja) throw new Error(`no encontré la pestaña ${PESTAÑA}`)

  const grilla = grillaEncabezado()
  // GUARDA: el bloque termina donde empieza la sección 1. Si la sección 1 se movió hacia arriba,
  // escribir la pisaría — y la sección 1 son dos tablas dinámicas nativas que no se recuperan.
  const visible = await google.readSheetValues(ID, `${PESTAÑA}!A1:A40`, { render: 'FORMATTED_VALUE' })
  const iSec1 = (visible ?? []).findIndex((f) => /^1\s*·/.test(String(f?.[0] ?? '').trim()))
  if (iSec1 < 0) throw new Error('no encontré el título de la sección 1: sin límite no escribo')
  if (iSec1 + 1 <= F.fin) throw new Error(`la sección 1 está en la fila ${iSec1 + 1} y el encabezado llega hasta la ${F.fin}: no la piso`)

  console.log(`ENCABEZADO filas 1..${F.fin} · sección 1 en la ${iSec1 + 1} · ancho ${ANCHO} columnas`)
  for (const [i, f] of grilla.entries()) {
    const s = f.map((c) => (c === null ? '' : String(c))).join(' | ').replace(/(\| ){3,}$/, '')
    if (s.replace(/[|\s]/g, '')) console.log(String(i + 1).padStart(3) + '  ' + s.slice(0, 120))
  }
  if (!APLICAR) { console.log('\n(sin --aplicar: no se escribió nada)'); return }

  await google.spreadsheetBatchUpdate(ID, [
    { updateCells: {
      range: { sheetId: hoja.sheetId, startRowIndex: 0, endRowIndex: F.fin, startColumnIndex: 0, endColumnIndex: ANCHO },
      rows: grilla.map((f) => ({ values: f.map((c) => ({
        userEnteredValue: c === null ? null
          : String(c).startsWith('=') ? { formulaValue: String(c) } : { stringValue: String(c) },
      })) })),
      fields: 'userEnteredValue' } },
    ...pedidosDeFormato(hoja.sheetId, hoja.cols ?? ANCHO),
  ], { espejo: true })

  // ── LA EVIDENCIA: releído del archivo.
  const leido = await google.readSheetValues(ID, `${PESTAÑA}!A1:H${F.fin}`, { render: 'FORMATTED_VALUE' })
  console.log('\nLEÍDO DEL ARCHIVO')
  for (const [i, f] of (leido ?? []).entries()) {
    const s = (f ?? []).map((c) => String(c ?? '')).join(' | ')
    if (s.replace(/[|\s]/g, '')) console.log(String(i + 1).padStart(3) + '  ' + s.slice(0, 120))
  }
  const errores = (leido ?? []).flat().filter((c) => /#(REF|NAME|VALUE|DIV|N\/A|ERROR|¿NOMBRE)/i.test(String(c ?? '')))
  console.log(errores.length ? `\n✗✗ ${errores.length} celda(s) con error: ${errores.join(' · ')}` : '\n✓ sin #ERROR en el bloque')
}

main().catch((e) => { console.error(e.message ?? e); process.exit(1) })
