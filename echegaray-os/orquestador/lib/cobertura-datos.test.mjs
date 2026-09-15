// LA COBERTURA DE COMPRAS Y COBRANZAS SE DECLARA POR RÓTULO (14/09/2026, inserción de «Obra»).
import test from 'node:test'
import assert from 'node:assert/strict'
import { comparar, clavesDeColumnas } from './cobertura-datos.mjs'
import { letra } from './compras-columnas.mjs'
import { COMPRAS_2508, COMPRAS_CON_OBRA, COBRANZAS_1409, COBRANZAS_CON_OBRA } from './encabezados-referencia.mjs'

const columnas = (cab, extra = []) => [...cab, ...extra].map((r, i) => ({ col: letra(i), rotulo: r ?? '', filas: 1, monto: 0 }))
const para = (r, rotulo) => r.usadas.find((u) => u.rotulo === rotulo)?.para

test('Compras, antes y después de «Obra»: cada declaración sigue a su rótulo, no a su letra', () => {
  for (const cab of [COMPRAS_2508, COMPRAS_CON_OBRA]) {
    const r = comparar('Compras', columnas(cab))
    assert.match(para(r, 'Concepto'), /QUÉ se compró/)
    assert.match(para(r, 'Total'), /cash flow/)
    assert.match(para(r, 'Monto Pagado'), /CONTROLA/)
    const rubros = r.usadas.filter((u) => u.rotulo === 'Rubro de caja')
    assert.deepEqual(rubros.map((u) => u.col), [letra(cab.lastIndexOf('Rubro de caja'))], 'sólo la 2.ª «Rubro de caja» la escribe el OS')
    assert.deepEqual(r.declaradas_vacias, [])
  }
  const despues = comparar('Compras', columnas(COMPRAS_CON_OBRA))
  assert.ok(despues.huecos.some((h) => h.rotulo === 'Obra' && h.col === 'L'), 'la columna nueva con datos es un hueco hasta que se declare')
})

test('Cobranzas: el bloque del OS se reconoce desde su rótulo ancla, esté en BA o en BB', () => {
  const bloque = ['▲ Control automático', 'Qué dice el banco de este valor · al 2026-09-14', 'Total bruto cargado', '$845.318.776']
  const relleno = Array(23).fill(null)
  for (const cab of [COBRANZAS_1409, COBRANZAS_CON_OBRA]) {
    const r = comparar('Cobranzas', columnas([...cab, ...relleno], bloque))
    for (const b of bloque) assert.equal(para(r, b), 'la escribe el OS', b)
    assert.match(para(r, 'TOTAL a cobrar (neto de retenciones)'), /cash flow/)
    assert.match(para(r, 'ORDEN DE  COMPRA'), /Orden de compra/, 'el rótulo con doble espacio también se reconoce')
    assert.deepEqual(r.declaradas_vacias, [])
  }
})

test('las pestañas que no reciben «Obra» siguen declaradas por letra', () => {
  assert.deepEqual(clavesDeColumnas('Cheques Emitidos', [{ col: 'M', rotulo: 'x' }]), ['M'])
  assert.match(comparar('Cheques Emitidos', [{ col: 'M', rotulo: 'otro rótulo', filas: 3 }]).usadas[0].para, /Estado en el OS/)
})
