import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formulaOrden, formulaOrdenSinFecha, celdaDeuda, formulaComercial, COL } from './orden-deuda.mjs'

test('el orden sólo numera las facturas impagas con fecha', () => {
  const f = formulaOrden(4, 'Pendiente')
  assert.match(f, /^=IF\(AND\(\$X4="Pendiente";ISNUMBER\(\$AD4\);ISNUMBER\(\$O4\);\$AJ4=1\)/)
  // Vacío para las demás: si devolviera 0, el MATCH de la tabla las traería.
  assert.match(f, /;""\)$/)
})

test('el orden NO vive en AF: esa columna es el sub-rubro de estructura', () => {
  // Pisar AF dejó toda la pestaña "Estructura" en cero y el control con $33.223.219 de diferencia.
  // Compras tiene nueve columnas calculadas por el OS: antes de tomar una hay que ver quién la usa.
  assert.doesNotMatch(celdaDeuda('$O', 8, 8), /\$AF/)
  assert.match(celdaDeuda('$O', 8, 8), /\$AH/)
})

test('el desempate usa un rango creciente, no RANK', () => {
  // POR QUÉ: varias facturas vencen el mismo día. RANK le da a las dos el mismo puesto y saltea el
  // siguiente, así que la tabla mostraría dos veces la misma factura y otra no aparecería nunca.
  const f = formulaOrden(10, 'Pendiente')
  assert.match(f, /COUNTIFS\(\$AD\$4:\$AD10;\$AD10/)   // rango que crece con la fila
  assert.match(f, /COUNTIFS\(\$AD\$4:\$AD;"<"&\$AD10/) // rango completo para las anteriores
  assert.doesNotMatch(f, /RANK/)
})

test('ARCA y la nómina no entran: la tabla es de PROVEEDORES', () => {
  // "ARCA no es proveedor, quitar de esa pestaña": las cuotas del plan F931 ya están desglosadas en
  // "Impuestos y Financieros". Listarlas acá sería leer el mismo egreso en dos lugares (regla 4).
  // El filtro va TAMBIÉN en los COUNTIFS: si sólo estuviera en la condición, el ranking saltearía
  // números y la tabla mostraría filas vacías en el medio.
  const f = formulaOrden(4, 'Pendiente')
  // en la condición, en el conteo de las anteriores y en el desempate: las tres partes.
  assert.match(f, /;\$AJ4=1\);/)
  assert.match(f, /\$AJ\$4:\$AJ;1\)/)
  assert.match(f, /\$AJ\$4:\$AJ4;1\)/)
  const c = formulaComercial(['Materiales Civil', 'Estructura'])
  assert.match(c, /^=ARRAYFORMULA\(/)
  assert.match(c, /\(\$AC\$4:\$AC="Materiales Civil"\)\+\(\$AC\$4:\$AC="Estructura"\)/)
})

test('un N° de comprobante que Sheets guardó como fecha se muestra como se escribió', () => {
  // "5-4163" quedó guardado como 826666 (mayo de 4163). Se recupera con el mismo patrón m-yyyy.
  const c = celdaDeuda('$H', 9, 8, COL.orden, 'comprobante')
  assert.match(c, /ISNUMBER/)
  assert.match(c, /TEXT\(.*;"m-yyyy"\)/)
})

test('las que no tienen fecha se ordenan por monto, de mayor a menor', () => {
  const f = formulaOrdenSinFecha(4, 'Pendiente')
  assert.match(f, /NOT\(ISNUMBER\(\$AD4\)\)/)
  assert.match(f, /\$O\$4:\$O;">"&\$O4/)
})

test('cada celda de la tabla trae su dato con su propia fórmula', () => {
  // Es el punto de todo esto: el dueño abre la celda y ve una fórmula, no un número.
  const c = celdaDeuda('$O', 8, 8)
  assert.match(c, /^=IFERROR\(INDEX\(Compras!\$O\$4:\$O;MATCH\(ROW\(\)-7;Compras!\$AH\$4:\$AH;0\)\);""\)$/)
  // La fila 9 pide el puesto 2 sin que haya que escribirlo: ROW() lo resuelve solo.
  assert.equal(celdaDeuda('$E', 9, 8), celdaDeuda('$E', 8, 8).replace('$O', '$E'))
})
