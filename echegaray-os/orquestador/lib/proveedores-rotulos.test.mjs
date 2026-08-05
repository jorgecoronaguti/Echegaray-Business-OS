// LOS TESTS PRUEBAN EL DEFECTO, NO EL CÓDIGO.
//
// Cada caso construye la pestaña como la LEE el auditor (`readSheetFormats`: valor + formato + ancho
// + alto), le aplica lo que emite este módulo y corre `detectar()` de verdad. Si mañana alguien
// vuelve a formatear la fila de rótulos con la banda del cuerpo, o baja el alto de la fila, estos
// tests se ponen rojos con el MISMO defecto que reporta `auditar-pantalla.mjs` sobre el archivo real.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { detectar } from './defectos-pantalla.mjs'
import { ANCHOS_PROVEEDORES } from './proveedores-frontera.mjs'
import {
  ALTO_MINIMO, FONT_ROTULO, altoDeRotulos, lineasQueOcupa, requestsDeRotulos, rotulosQueNoEntran,
} from './proveedores-rotulos.mjs'

const MONEDA = { type: 'CURRENCY', pattern: '"$"#,##0' }
const CONTADOR = { type: 'NUMBER', pattern: '#,##0' }
const TEXTO = { type: 'TEXT', pattern: '@' }

/** Una celda como la devuelve `readSheetFormats`. */
const celda = (valor, numberFormat, extra = {}) => ({
  valor, formato: { numberFormat, textFormat: { fontSize: FONT_ROTULO }, ...extra },
})

/**
 * La sección 2 tal como se ve: un titular con plata arriba (para que el detector NO tome la fila de
 * rótulos por encabezado de columna), la fila de rótulos, y dos proveedores.
 */
function seccion2({ rotulosEnFormatoDelCuerpo, wrap = false, altoRotulos = ALTO_MINIMO }) {
  const fmtRotulo = (numeroDelCuerpo) => (rotulosEnFormatoDelCuerpo ? numeroDelCuerpo : TEXTO)
  const extraRotulo = wrap ? { wrapStrategy: 'WRAP' } : { wrapStrategy: 'CLIP' }
  return {
    anchos: [...ANCHOS_PROVEEDORES],
    altos: [ALTO_MINIMO, altoRotulos, ALTO_MINIMO, ALTO_MINIMO],
    filas: [
      [celda('2 · CUENTA CORRIENTE', TEXTO), celda('', TEXTO), celda('$281.227.326', MONEDA), celda('105', CONTADOR)],
      [
        celda('Proveedor', fmtRotulo(TEXTO), extraRotulo),
        celda('CUIT (OS)', fmtRotulo(TEXTO), extraRotulo),
        celda('Comprado 2026', fmtRotulo(MONEDA), extraRotulo),
        celda('Comprobantes', fmtRotulo(CONTADOR), extraRotulo),
      ],
      [celda('Alumetal', TEXTO), celda('30-71647696-7', TEXTO), celda('$12.345', MONEDA), celda('7', CONTADOR)],
      [celda('Hormiserv', TEXTO), celda('20-26287437-1', TEXTO), celda('$9.000', MONEDA), celda('3', CONTADOR)],
    ],
  }
}

test('EL DEFECTO: la banda del cuerpo formatea la fila de rótulos y "Comprado 2026" queda en una celda de moneda', () => {
  const d = detectar(seccion2({ rotulosEnFormatoDelCuerpo: true }))
  const enNumero = d.filter((x) => x.tipo === 'texto_en_numero')
  assert.deepEqual(enNumero.map((x) => x.valor).sort(), ['Comprado 2026', 'Comprobantes'],
    'son los dos rótulos que el auditor reporta hoy como C69 y D69')
})

test('ARREGLADO: con el formato propio de la fila de rótulos no queda un solo defecto', () => {
  const d = detectar(seccion2({ rotulosEnFormatoDelCuerpo: false, wrap: true }))
  assert.deepEqual(d, [], `quedaron defectos: ${JSON.stringify(d)}`)
})

test('EL DEFECTO: "Fecha prevista de pago (día)" no entra en la columna C y se corta', () => {
  // El rótulo del campo de fila lo hereda del encabezado de Compras y la API no deja renombrarlo:
  // acortarlo NO es una opción, y por eso el remedio tiene que ser el wrap.
  const largo = 'Fecha prevista de pago (día)'
  const grilla = {
    anchos: [...ANCHOS_PROVEEDORES],
    altos: [ALTO_MINIMO, ALTO_MINIMO],
    filas: [
      [celda('Proveedor', TEXTO), celda('N° Comprobante', TEXTO), celda(largo, TEXTO, { wrapStrategy: 'CLIP' }), celda('Cliente / Asignación', TEXTO)],
      [celda('Alumetal', TEXTO), celda('0001-00000211', TEXTO), celda('16/08/2026', { type: 'DATE', pattern: 'dd/mm/yyyy' }), celda('LA ESTRELLA', TEXTO)],
    ],
  }
  const d = detectar(grilla)
  assert.equal(d.filter((x) => x.tipo === 'texto_cortado' && x.valor === largo).length, 1)

  // Y con WRAP + el alto que calcula este módulo, el mismo rótulo deja de ser un defecto.
  const textos = ['Proveedor', 'N° Comprobante', largo, 'Cliente / Asignación']
  const alto = altoDeRotulos(textos, ANCHOS_PROVEEDORES)
  grilla.filas[0] = textos.map((t) => celda(t, TEXTO, { wrapStrategy: 'WRAP' }))
  grilla.altos = [alto, ALTO_MINIMO]
  assert.deepEqual(detectar(grilla), [], 'con dos líneas y la fila más alta, el rótulo se lee entero')
})

test('el alto sale de la cuenta del auditor, no de un número a ojo', () => {
  // Una sola línea: el alto por defecto alcanza y no se estira la fila sin motivo.
  assert.equal(altoDeRotulos(['Proveedor'], [330]), ALTO_MINIMO)
  // Dos líneas: 2 × (fontSize + 5). Es el umbral exacto que compara `defectos-pantalla.mjs`.
  assert.equal(altoDeRotulos(['Fecha prevista de pago (día)'], [125]), 2 * (FONT_ROTULO + 5))
  assert.equal(lineasQueOcupa('Fecha prevista de pago (día)', 125), 2)
  assert.equal(lineasQueOcupa('Proveedor', 330), 1)
  // Una columna sin ancho conocido no puede exigir alto: nunca devuelve 0 ni Infinity.
  assert.equal(lineasQueOcupa('lo que sea', 0), 1)
})

test('un rótulo que necesita tres líneas se GRITA: hay que acortarlo, no estirar la fila', () => {
  const textos = ['Proveedor', 'Un rótulo interminable que nadie debería escribir en una tabla']
  const flojos = rotulosQueNoEntran(textos, [330, 60])
  assert.equal(flojos.length, 1)
  assert.equal(flojos[0].col, 1)
  assert.ok(flojos[0].lineas > 2)
  assert.deepEqual(rotulosQueNoEntran(['Proveedor', 'CUIT (OS)'], ANCHOS_PROVEEDORES), [])
})

test('los requests declaran TEXTO, WRAP y el alto — y ninguno toca el cuerpo', () => {
  const textos = ['Proveedor', 'CUIT (OS)', 'Comprado 2026', 'Comprobantes']
  const reqs = requestsDeRotulos({ sheetId: 7, fila: 69, textos, anchos: ANCHOS_PROVEEDORES, derecha: [2, 3] })
  for (const r of reqs.filter((x) => x.repeatCell).map((x) => x.repeatCell.range)) {
    assert.equal(r.startRowIndex, 68, 'base 1 → base 0')
    assert.equal(r.endRowIndex, 69, 'una sola fila: el cuerpo es de otro')
  }
  const dim = reqs.at(-1).updateDimensionProperties.range
  assert.deepEqual([dim.dimension, dim.startIndex, dim.endIndex], ['ROWS', 68, 69],
    'el alto es de la fila de rótulos y de ninguna más')
  const base = reqs[0].repeatCell.cell.userEnteredFormat
  assert.equal(base.numberFormat.type, 'TEXT')
  assert.equal(base.wrapStrategy, 'WRAP')
  assert.equal(base.textFormat.bold, true)
  assert.equal(reqs.at(-1).updateDimensionProperties.properties.pixelSize, altoDeRotulos(textos, ANCHOS_PROVEEDORES))
  // Las dos columnas de números llevan su rótulo a la derecha, sobre sus cifras.
  assert.deepEqual(reqs.slice(1, 3).map((r) => r.repeatCell.range.startColumnIndex), [2, 3])
})

test('sin sheetId o con una fila en base 0 no emite nada: escribir en la fila equivocada mata una dinámica', () => {
  assert.throws(() => requestsDeRotulos({ fila: 3, textos: ['a'] }), /sheetId/)
  assert.throws(() => requestsDeRotulos({ sheetId: 1, fila: 0, textos: ['a'] }), /base 1/)
  assert.deepEqual(requestsDeRotulos({ sheetId: 1, fila: 3, textos: [] }), [])
})
