import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'
import {
  cortePorConcentracion, escalones, gastoPorProveedor, nombresVisibles, OFF, UMBRAL,
} from './proveedores-concentracion.mjs'

/** Una fila de Compras con lo mínimo que mira el corte. */
const fila = (proveedor, total, comercial = '1') => {
  const f = []
  f[OFF.proveedor] = proveedor
  f[OFF.total] = total
  f[OFF.comercial] = comercial
  return f
}

/** La forma real del archivo: uno enorme, unos medianos y una cola larga de monedas. */
const archivo = () => [
  fila('Alumetal', 8000), fila('Alumetal', 2000),
  fila('Corralon', 4000),
  fila('DUPEC', 3000),
  fila('Castel', 2000),
  ...Array.from({ length: 40 }, (_, i) => fila(`Chico ${i}`, 25)),
]

describe('gastoPorProveedor', () => {
  it('suma las facturas del mismo proveedor y ordena de mayor a menor', () => {
    const g = gastoPorProveedor(archivo())
    assert.equal(g[0].proveedor, 'Alumetal')
    assert.equal(g[0].total, 10000)
    assert.equal(g[0].comprobantes, 2)
    assert.equal(g[1].proveedor, 'Corralon')
  })

  it('no cuenta lo que no es comercial', () => {
    const g = gastoPorProveedor([fila('Alumetal', 100), fila('Sueldos', 999, '0')])
    assert.equal(g.length, 1)
    assert.equal(g[0].total, 100)
  })

  it('el mismo proveedor con y sin espacio es UNO, y guarda las dos grafías', () => {
    const g = gastoPorProveedor([fila('AGUERO ', 100), fila('AGUERO', 50)])
    assert.equal(g.length, 1, 'el espacio no crea un proveedor nuevo')
    assert.equal(g[0].total, 150)
    assert.deepEqual([...g[0].variantes].sort(), ['AGUERO', 'AGUERO '])
  })
})

describe('nombresVisibles', () => {
  it('EL DEFECTO: el nombre recortado no engancha la fila que tiene el espacio', () => {
    // Medido en el archivo el 05/08: `"AGUERO "` existe así en Compras y el filtro decía "AGUERO",
    // así que la dinámica no lo listaba. El cuadro cerraba igual —el resto es TOTAL menos lo
    // listado, por fórmula— y por eso el control no lo veía: un proveedor del top 47 desaparecido
    // de la vista, engordando una línea muda.
    const c = cortePorConcentracion([fila('AGUERO ', 100), fila('Alumetal', 900)])
    const visibles = nombresVisibles(c)
    assert.ok(visibles.includes('AGUERO '), 'tiene que ir la grafía CRUDA, la que está en la columna')
    for (const v of visibles) assert.equal(typeof v, 'string')
  })

  it('si el proveedor aparece con dos grafías, van las dos al filtro', () => {
    const c = cortePorConcentracion([fila('AGUERO ', 600), fila('AGUERO', 400)])
    assert.deepEqual(nombresVisibles(c).sort(), ['AGUERO', 'AGUERO '])
  })
})

describe('cortePorConcentracion', () => {
  it('EL DEFECTO: la cola larga deja de listarse', () => {
    const c = cortePorConcentracion(archivo(), { umbral: 0.95 })
    assert.ok(c.listados.length < 10, `listó ${c.listados.length}: la cola volvió al cuadro`)
    assert.equal(c.resto.cantidad, 44 - c.listados.length) // 4 grandes + 40 de la cola
  })

  it('EL DEFECTO QUE IMPORTA: el corte no puede perder un peso', () => {
    for (const umbral of [0.5, 0.8, 0.95, 0.99, 1]) {
      const c = cortePorConcentracion(archivo(), { umbral })
      const visible = c.listados.reduce((a, p) => a + p.total, 0)
      assert.equal(visible + c.resto.total, c.total, `umbral ${umbral}: el corte perdió plata`)
    }
  })

  it('lista lo mínimo que alcanza el umbral, no uno más', () => {
    const c = cortePorConcentracion(archivo(), { umbral: 0.95 })
    const sinElUltimo = c.listados.slice(0, -1).reduce((a, p) => a + p.total, 0)
    assert.ok(sinElUltimo / c.total < 0.95, 'sobra un proveedor listado: el corte no es mínimo')
    assert.ok(c.cobertura >= 0.95)
  })

  it('la plata sin nombre de proveedor no desaparece: cae en el resto', () => {
    const c = cortePorConcentracion([...archivo(), fila('', 500000)], { umbral: 0.95 })
    const visible = c.listados.reduce((a, p) => a + p.total, 0)
    assert.equal(visible + c.resto.total, c.total)
    assert.ok(!nombresVisibles(c).includes(''), 'un nombre vacío no se puede filtrar en la dinámica')
    assert.equal(c.sinNombre.total, 500000, 'el grupo sin nombre tiene que quedar reportado')
  })

  it('un archivo vacío no rompe ni inventa', () => {
    const c = cortePorConcentracion([], { umbral: UMBRAL })
    assert.equal(c.total, 0)
    assert.equal(c.listados.length, 0)
    assert.equal(c.resto.cantidad, 0)
  })

  it('los nombres del filtro van como TEXTO — la trampa de la dinámica vacía', () => {
    const c = cortePorConcentracion([fila('Alumetal', 100), fila('Corralon', 1)], { umbral: 0.95 })
    for (const n of nombresVisibles(c)) assert.equal(typeof n, 'string')
  })
})

describe('escalones', () => {
  it('cada umbral más alto lista más proveedores y deja menos resto', () => {
    const e = escalones(archivo())
    for (let i = 1; i < e.length; i++) {
      assert.ok(e[i].listados >= e[i - 1].listados, 'un umbral mayor no puede listar menos')
      assert.ok(e[i].restoTotal <= e[i - 1].restoTotal, 'un umbral mayor no puede dejar más resto')
    }
  })
})
