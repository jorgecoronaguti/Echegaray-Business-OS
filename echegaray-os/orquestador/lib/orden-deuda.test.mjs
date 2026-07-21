import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formulaOrden, formulaOrdenSinFecha, celdaDeuda } from './orden-deuda.mjs'

test('el orden sólo numera las facturas impagas con fecha', () => {
  const f = formulaOrden(4, 'Pendiente')
  assert.match(f, /^=IF\(AND\(\$X4="Pendiente";ISNUMBER\(\$AD4\);ISNUMBER\(\$O4\)\)/)
  // Vacío para las demás: si devolviera 0, el MATCH de la tabla las traería.
  assert.match(f, /;""\)$/)
})

test('el desempate usa un rango creciente, no RANK', () => {
  // POR QUÉ: varias facturas vencen el mismo día. RANK le da a las dos el mismo puesto y saltea el
  // siguiente, así que la tabla mostraría dos veces la misma factura y otra no aparecería nunca.
  const f = formulaOrden(10, 'Pendiente')
  assert.match(f, /COUNTIFS\(\$AD\$4:\$AD10;\$AD10/)   // rango que crece con la fila
  assert.match(f, /COUNTIFS\(\$AD\$4:\$AD;"<"&\$AD10/) // rango completo para las anteriores
  assert.doesNotMatch(f, /RANK/)
})

test('las que no tienen fecha se ordenan por monto, de mayor a menor', () => {
  const f = formulaOrdenSinFecha(4, 'Pendiente')
  assert.match(f, /NOT\(ISNUMBER\(\$AD4\)\)/)
  assert.match(f, /\$O\$4:\$O;">"&\$O4/)
})

test('cada celda de la tabla trae su dato con su propia fórmula', () => {
  // Es el punto de todo esto: el dueño abre la celda y ve una fórmula, no un número.
  const c = celdaDeuda('$O', 8, 8)
  assert.match(c, /^=IFERROR\(INDEX\(Compras!\$O\$4:\$O;MATCH\(ROW\(\)-7;Compras!\$AF\$4:\$AF;0\)\);""\)$/)
  // La fila 9 pide el puesto 2 sin que haya que escribirlo: ROW() lo resuelve solo.
  assert.equal(celdaDeuda('$E', 9, 8), celdaDeuda('$E', 8, 8).replace('$O', '$E'))
})
