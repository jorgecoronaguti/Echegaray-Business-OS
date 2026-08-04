// LAS DOS TRAMPAS DE UNA DINÁMICA POR API, Y EL HUECO.
//
// Las dos primeras ya costaron una dinámica vacía en el archivo real (04/08/2026): una tabla
// perfectamente formada, con encabezados y "Suma total", y CERO filas entre medio. Ni error, ni
// #REF!, ni aviso. Un test barato evita volver a descubrirlo mirando la pantalla.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  anchoDelPivot, cabeEnElHueco, camposDeFila, COL, filtros, filtrosPorCondicion, fuenteCompras,
  nivelesConSubtotal, pivotSeccion1, reapuntarControl,
} from './proveedores-pivot-seccion1.mjs'

const fuente = fuenteCompras({ sheetId: 7, filas: 900 })

test('TRAMPA 1 · ni un filtro por condición: vaciarían la dinámica en silencio', () => {
  assert.deepEqual(filtrosPorCondicion(pivotSeccion1(fuente)), [])
  for (const f of filtros()) {
    assert.ok(f.filterCriteria.visibleValues, `el filtro de la columna ${f.columnOffsetIndex} no usa visibleValues`)
  }
})

test('TRAMPA 1b · los valores visibles van como TEXTO aunque la columna sea numérica', () => {
  const comercial = filtros().find((f) => f.columnOffsetIndex === COL.comercial)
  assert.deepEqual(comercial.filterCriteria.visibleValues, ['1'])
  assert.equal(typeof comercial.filterCriteria.visibleValues[0], 'string')
})

test('TRAMPA 2 · ningún nivel pide un subtotal que la API no emite', () => {
  assert.deepEqual(nivelesConSubtotal(pivotSeccion1(fuente)), [])
})

test('el source arranca en la fila de rótulos, no en la primera factura', () => {
  // startRowIndex 2 = fila 3. Arrancar en la 4 haría que el pivot tome una factura como encabezado.
  assert.equal(fuente.startRowIndex, 2)
  assert.equal(fuente.endRowIndex, 900, 'un source sin techo recorre la hoja entera en cada recálculo')
})

test('el source se niega si no sabe cuántas filas tiene Compras', () => {
  assert.throws(() => fuenteCompras({ sheetId: 7, filas: 0 }), /no puede tener 0 filas/)
  assert.throws(() => fuenteCompras({ filas: 900 }), /falta el sheetId/)
})

test('los campos de fila van en el orden de la pestaña y el importe es el único valor', () => {
  const p = pivotSeccion1(fuente)
  assert.deepEqual(p.rows.map((r) => r.sourceColumnOffset),
    [COL.proveedor, COL.proximoPago, COL.comprobante, COL.obra, COL.tipoPago, COL.categoria])
  assert.equal(p.values.length, 1)
  assert.equal(p.values[0].sourceColumnOffset, COL.saldo)
  assert.equal(p.values[0].summarizeFunction, 'SUM')
  // 6 campos de fila + 1 valor = 7 columnas: A..G, y la H del dueño queda afuera.
  assert.equal(anchoDelPivot(p), 7)
})

test('el primer nivel ordena por el valor: a quién le debemos más, arriba', () => {
  const [primero] = camposDeFila()
  assert.equal(primero.sortOrder, 'DESCENDING')
  assert.deepEqual(primero.valueBucket, { valuesIndex: 0 })
})

test('EL HUECO · si no entra hasta la sección 2, se dice ANTES de escribir', () => {
  // Encabezado en la 17, sección 2 en la 38 → 21 filas. 13 facturas piden 15 (rótulo + 13 + total).
  const ok = cabeEnElHueco({ facturas: 13, filaAncla: 17, filaLimite: 38 })
  assert.equal(ok.cabe, true)
  assert.equal(ok.alto, 15)
  assert.equal(ok.holgura, 6)

  const no = cabeEnElHueco({ facturas: 40, filaAncla: 17, filaLimite: 38 })
  assert.equal(no.cabe, false)
  assert.match(no.motivo, /necesita 42 filas y hay 21 libres/)
})

test('el límite exacto entra, uno más no', () => {
  assert.equal(cabeEnElHueco({ facturas: 19, filaAncla: 17, filaLimite: 38 }).cabe, true)
  assert.equal(cabeEnElHueco({ facturas: 20, filaAncla: 17, filaLimite: 38 }).cabe, false)
})

test('EL CONTROL se reapunta a la columna del importe, y sólo eso', () => {
  const viejo = '=LET(dif;ROUND((SUMIFS(Compras!$O$4:$O;Compras!$X$4:$X;"Pendiente")-SUM($D$18:$D$37));0);'
    + 'IF(dif=0;"✓ cierra";"⚠ falta "&TEXT(dif;"$#,##0")))'
  const nuevo = reapuntarControl(viejo, 'G', { filaEncabezado: 17, filaLimite: 38 })

  assert.ok(nuevo.includes('SUM($G$18:$G$37)'), 'no reapuntó el SUM del bloque propio')
  assert.ok(!nuevo.includes('SUM($D$18:$D$37)'), 'dejó la columna vieja')
  // Lo de Compras no se toca: reescribir lo que no cambió es cómo se rompe una fórmula sana.
  assert.ok(nuevo.includes('SUMIFS(Compras!$O$4:$O;Compras!$X$4:$X;"Pendiente")'), 'tocó los SUMIFS de Compras')
  assert.ok(nuevo.includes('"⚠ falta "'), 'tocó el texto del mensaje')
})

test('un control que ya apunta bien queda idéntico', () => {
  const ya = '=SUM($G$18:$G$37)'
  assert.equal(reapuntarControl(ya, 'G', { filaEncabezado: 17, filaLimite: 38 }), ya)
})

test('un control vacío no se inventa', () => {
  assert.equal(reapuntarControl('', 'G', { filaEncabezado: 17, filaLimite: 38 }), '')
  assert.equal(reapuntarControl(null, 'G', { filaEncabezado: 17, filaLimite: 38 }), '')
})
