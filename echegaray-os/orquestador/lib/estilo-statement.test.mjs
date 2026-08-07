import test from 'node:test'
import assert from 'node:assert/strict'
import { skinRequests, ES_TOTAL, ES_SECCION, ES_ENCABEZADO, ES_SUBSECCION, ES_BLOQUE_HERO } from './estilo-statement.mjs'

/** El textFormat que termina aplicándose a una fila: gana el ÚLTIMO pedido que la cubre. */
const tipografiaDe = (reqs, fila) => {
  let t = null
  for (const r of reqs) {
    const g = r.repeatCell
    if (!g || fila < g.range.startRowIndex || fila >= g.range.endRowIndex) continue
    if (g.cell?.userEnteredFormat?.textFormat) t = g.cell.userEnteredFormat.textFormat
  }
  return t
}
const tieneReglaArriba = (reqs, fila) => reqs.some((r) => r.updateBorders?.top?.style === 'SOLID'
  && r.updateBorders.range.startRowIndex === fila)

test('detecta secciones, encabezados y totales por el contenido de la columna A', () => {
  assert.ok(ES_SECCION.test('1. IVA REAL DE ARCA'))
  assert.ok(ES_SECCION.test('2. INGRESOS BRUTOS (San Juan) — de las DDJJ reales de Rentas'))
  assert.ok(ES_ENCABEZADO.test('Período'))
  assert.ok(ES_ENCABEZADO.test('Concepto'))
  assert.ok(ES_ENCABEZADO.test('Proveedor'))
  assert.ok(ES_TOTAL.test('TOTAL 2026'))
  assert.ok(ES_TOTAL.test('⇒ Control contra Compras'))
  // Un total no se confunde con una sección aunque esté en mayúsculas.
  assert.ok(ES_TOTAL.test('TOTAL PLANES') && ES_TOTAL.test('TOTAL PLANES'))
  // Una fila de dato normal no es ninguna de las tres.
  assert.ok(!ES_SECCION.test('Combustibles Barcelo') && !ES_ENCABEZADO.test('Combustibles Barcelo') && !ES_TOTAL.test('Combustibles Barcelo'))
})

test('LA JERARQUÍA: sección, sub-sección y bloque del hero se dibujan DISTINTO', () => {
  // ═══ EL DEFECTO (06/08) ═══
  //
  // Ni la sub-sección ni el título del hero matcheaban nada, así que las dos se dibujaban con el mismo
  // cuerpo que una fila de datos. En Jornales eso son cuatro títulos —el hero y 1.1, 1.2, 1.3— sin un
  // solo marcador: la pestaña quedaba en un tono único y no se podía seguir con el ojo. Nunca dio un
  // error ni se ve leyendo celdas; se ve mirando la pestaña.
  assert.ok(ES_SUBSECCION('1.1 · EL PLANTEL BASE — LA ÚLTIMA QUINCENA CERRADA'))
  assert.ok(!ES_SUBSECCION('1 · OBRA — LO QUE FALTA PAGAR'), 'una sección no es una sub-sección')
  assert.ok(!ES_SECCION.test('1.1 · EL PLANTEL BASE'), 'y una sub-sección no se cuela como sección')
  assert.ok(ES_BLOQUE_HERO.test('JORNALES Y SUELDOS — la posición'))

  const filas = [
    ['Jornales por quincena'], ['fuente: …'], [],
    ['JORNALES Y SUELDOS — la posición'],
    ['1 · OBRA — LO QUE FALTA PAGAR'],
    ['1.1 · EL PLANTEL BASE'],
    ['Categoría', 'Personas'],
    ['OF', 4],
  ]
  const reqs = skinRequests({ sheetId: 7, filas, cols: 2 })
  // El bloque del hero abre como una sección: negrita, cuerpo 11 y su regla.
  assert.equal(tipografiaDe(reqs, 3).bold, true)
  assert.equal(tipografiaDe(reqs, 3).fontSize, 11)
  assert.ok(tieneReglaArriba(reqs, 3), 'el hero abre el cuadro y necesita su regla')
  // La sección, igual.
  assert.equal(tipografiaDe(reqs, 4).fontSize, 11)
  assert.ok(tieneReglaArriba(reqs, 4))
  // La SUB-sección pesa menos y NO lleva regla: no abre un bloque, cuelga del que ya está abierto.
  assert.equal(tipografiaDe(reqs, 5).bold, true, 'una sub-sección sigue siendo un título')
  assert.equal(tipografiaDe(reqs, 5).fontSize, 10, 'pero no pesa lo mismo que su sección')
  assert.ok(!tieneReglaArriba(reqs, 5), 'una regla de más parte el bloque en dos')
  // Y "Categoría" es un encabezado de tabla: hasta hoy no estaba en la lista de este módulo.
  assert.ok(ES_ENCABEZADO.test('Categoría'))
  assert.ok(ES_ENCABEZADO.test('Quincena'))
  assert.equal(tipografiaDe(reqs, 6).fontSize, 9)
})

test('skinRequests apaga la reja y pinta todo de blanco antes de rular', () => {
  const filas = [['Impuestos y Financieros'], ['1. IVA REAL'], ['Período', 'Base'], ['ene-26', 100], ['TOTAL', 100]]
  const reqs = skinRequests({ sheetId: 7, filas, cols: 2, congeladas: 1 })
  const props = reqs.find((r) => r.updateSheetProperties)
  assert.equal(props.updateSheetProperties.properties.gridProperties.hideGridlines, true)
  assert.equal(props.updateSheetProperties.properties.gridProperties.frozenRowCount, 1)
  // La primera es apagar reja, la segunda pintar de blanco toda la grilla.
  assert.ok(reqs[1].repeatCell.cell.userEnteredFormat.backgroundColor.red === 1)
  // Hay al menos un borde (hairline) para el total y para la sección.
  assert.ok(reqs.some((r) => r.updateBorders?.top) )
})

test('un rótulo en versalita con importes al lado es un dato, no un título de sección', () => {
  const filas = [['Cargas sociales'], ['de dónde sale'], ['1 · DECLARADO'], ['Concepto', 'ene'],
    ['L.R.T. — ART', 1141733], ['⇒ Total declarado', 4582692]]
  const reqs = skinRequests({ sheetId: 1, filas, cols: 2 })
  // La fila del concepto no lleva regla propia: sólo la llevan el encabezado y el total.
  const reglas = reqs.filter((r) => r.updateBorders && r.updateBorders.range.startRowIndex === 4)
  assert.equal(reglas.length, 0)
})

test('una regla se dibuja del ancho del bloque, no de la hoja', () => {
  const filas = [['T'], ['n'], ['1 · X'], ['Concepto', 'a', 'b'], ['dato', 1, 2], ['⇒ Total', 3, 4]]
  const reqs = skinRequests({ sheetId: 1, filas, cols: 12 })
  const regla = reqs.find((r) => r.updateBorders && r.updateBorders.range.startRowIndex === 5)
  assert.equal(regla.updateBorders.range.endColumnIndex, 3, 'llega hasta donde hay contenido, no hasta la columna 12')
})

test('el cuerpo se resetea: una itálica del layout anterior no sobrevive', () => {
  const reqs = skinRequests({ sheetId: 1, filas: [['T'], ['n'], ['dato', 1]], cols: 2 })
  const reset = reqs.find((r) => r.repeatCell && r.repeatCell.fields === 'userEnteredFormat.textFormat'
    && r.repeatCell.range.startRowIndex === 0 && r.repeatCell.range.endRowIndex === 3)
  assert.ok(reset, 'hay un reset tipográfico sobre toda la grilla')
  assert.equal(reset.repeatCell.cell.userEnteredFormat.textFormat.bold, false)
})

test('la limpieza llega hasta el final de la HOJA, no de la grilla', () => {
  // Una pestaña que se acorta deja bordes y altos colgando debajo del contenido: se ven como reglas
  // grises flotando sobre la nada. Es lo que el dueño llamó "se corrompe de la fila 53 en adelante".
  const reqs = skinRequests({ sheetId: 1, filas: [['T'], ['n'], ['x', 1]], cols: 3, filasHoja: 80 })
  const limpieza = reqs.find((r) => r.updateBorders && r.updateBorders.range.endRowIndex === 80)
  assert.ok(limpieza, 'los bordes se borran hasta la fila 80')
  const altos = reqs.find((r) => r.updateDimensionProperties?.properties?.pixelSize === 21)
  assert.equal(altos.updateDimensionProperties.range.endIndex, 80)
})
