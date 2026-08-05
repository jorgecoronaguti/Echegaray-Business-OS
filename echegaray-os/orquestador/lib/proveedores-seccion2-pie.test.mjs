import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'
import { esRangoAbierto } from './proveedores-deuda-viva.mjs'
import {
  columnasDeCompras, ENCABEZADOS, filasDelPie, letraDeColumna, referencias,
} from './proveedores-seccion2-pie.mjs'

/** La fila 3 real de Compras, con los encabezados repetidos incluidos. */
const cabecera = () => {
  const h = []
  h[4] = 'Proveedor'
  h[14] = 'Total'
  h[27] = 'Rubro de caja'
  h[28] = 'Rubro de caja'
  h[35] = '¿Proveedor comercial? (OS)'
  h[38] = 'CUIT (OS)'
  return h
}

describe('letraDeColumna', () => {
  it('pasa de una letra a dos donde de verdad pasa', () => {
    assert.equal(letraDeColumna(0), 'A')
    assert.equal(letraDeColumna(14), 'O')
    assert.equal(letraDeColumna(25), 'Z')
    assert.equal(letraDeColumna(26), 'AA')
    assert.equal(letraDeColumna(35), 'AJ')
    assert.equal(letraDeColumna(38), 'AM')
  })
})

describe('columnasDeCompras', () => {
  it('ubica por encabezado, no por posición', () => {
    assert.deepEqual(columnasDeCompras(cabecera()), { proveedor: 4, total: 14, comercial: 35, cuit: 38 })
  })

  it('EL DEFECTO: si el dueño corre una columna, las fórmulas la siguen', () => {
    const h = cabecera()
    h.splice(2, 0, 'Columna nueva del dueño')
    assert.deepEqual(columnasDeCompras(h), { proveedor: 5, total: 15, comercial: 36, cuit: 39 })
  })

  it('sin el encabezado no escribe a ciegas', () => {
    const h = cabecera()
    h[35] = 'otra cosa'
    assert.throws(() => columnasDeCompras(h), /Proveedor comercial/)
  })
})

describe('referencias', () => {
  it('todas ABIERTAS: un rango con fila final deja de ver lo que se carga mañana', () => {
    const R = referencias(columnasDeCompras(cabecera()))
    for (const [k, v] of Object.entries(R)) assert.ok(esRangoAbierto(v), `${k} quedó acotado: ${v}`)
    assert.equal(R.total, 'Compras!$O$4:$O')
    assert.equal(R.comercial, 'Compras!$AJ$4:$AJ')
  })
})

describe('filasDelPie', () => {
  const R = referencias(columnasDeCompras(cabecera()))
  const pie = () => filasDelPie({ R, p0: 70, p1: 116, fResto: 117, fTotal: 118 })

  it('EL DEFECTO: el resto sale del total, así el corte no puede perder plata', () => {
    assert.equal(pie().resto[2], '=$C$118-SUM($C$70:$C$116)')
    assert.equal(pie().resto[3], '=$D$118-SUM($D$70:$D$116)')
  })

  it('el TOTAL es un camino INDEPENDIENTE de la dinámica', () => {
    assert.equal(pie().total[2], '=SUMIFS(Compras!$O$4:$O;Compras!$AJ$4:$AJ;1)')
    assert.ok(!pie().total[2].includes('SUM($C$'), 'el total no puede depender de lo que la dinámica emitió')
  })

  it('locale es_AR: los argumentos van con ";" y jamás con ","', () => {
    for (const f of [...pie().resto, ...pie().total]) {
      if (typeof f !== 'string' || !f.startsWith('=')) continue
      const sinTextos = f.replace(/"[^"]*"/g, '""')
      assert.ok(!sinTextos.includes(','), `separador con coma: ${f}`)
    }
    // Las que sí llevan más de un argumento tienen que llevar el separador del archivo.
    for (const f of [pie().resto[0], pie().total[2], pie().total[3]]) {
      assert.ok(f.replace(/"[^"]*"/g, '""').includes(';'), `sin separador es_AR: ${f}`)
    }
  })

  it('la cantidad del rótulo es fórmula, no un número pegado, y falla abierta', () => {
    const a = pie().resto[0]
    assert.ok(a.startsWith('=IFERROR('), 'un #ERROR! en el medio del cuadro no es aceptable')
    assert.ok(a.includes('COUNTUNIQUE'), 'la cantidad tiene que contarse sola')
    assert.ok(!/\(\d+\)/.test(a), `hay un conteo pegado en el rótulo: ${a}`)
  })

  it('la columna del CUIT queda vacía a propósito, no con basura', () => {
    assert.equal(pie().resto[1], null)
    assert.equal(pie().total[1], null)
  })

  it('el pie NO se escribe despegado del último listado', () => {
    assert.throws(() => filasDelPie({ R, p0: 70, p1: 116, fResto: 130, fTotal: 131 }), /pegado/)
    assert.throws(() => filasDelPie({ R, p0: 70, p1: 60, fResto: 61, fTotal: 62 }), /pegado/)
  })

  it('los encabezados que exige son los cuatro del contrato', () => {
    assert.deepEqual(Object.keys(ENCABEZADOS), ['proveedor', 'total', 'comercial', 'cuit'])
  })
})
