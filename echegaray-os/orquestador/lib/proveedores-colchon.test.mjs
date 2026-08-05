import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'
import {
  COLCHON_FINAL, filaDelSiguienteTitulo, filaDelTitulo, filasNoVacias, sobranteDeColchon, ultimaConDato,
} from './proveedores-colchon.mjs'

/** La pestaña como estaba el 04/08: el bloque termina en la 49 y el título de abajo está en la 68. */
const pestana = ({ aire = 18, resto = null } = {}) => {
  const f = []
  f[0] = ['1 · QUÉ SE DEBE Y CUÁNDO']
  for (let i = 1; i <= 35; i++) f[i] = [`Proveedor ${i}`, 1000, 1]
  const ultima = f.length - 1 // base 0
  for (let i = 0; i < aire; i++) f[ultima + 1 + i] = ['', '', '']
  if (resto) f[ultima + resto.enFila] = resto.fila
  f[ultima + 1 + aire] = ['2 · CUENTA CORRIENTE POR PROVEEDOR']
  return f
}

describe('filaDelTitulo', () => {
  it('encuentra el título de la sección 2 por su texto, no por su número de fila', () => {
    const f = pestana()
    assert.equal(filaDelTitulo(f, /^2\s*[·.\-]/), f.length)
  })

  it('devuelve 0 cuando el título no está — sin ancla no se borra nada', () => {
    assert.equal(filaDelTitulo(pestana(), /^9\s*[·.\-]/), 0)
  })
})

describe('filaDelSiguienteTitulo', () => {
  // La pestaña real del 04/08 quedó numerada 1, 2, 7, 5: el generador del bloque de texto renumeró
  // y el "3 ·" al que este generador estaba anclado dejó de existir.
  const renumerada = () => [
    ['1 · QUÉ SE DEBE Y CUÁNDO'], ['Proveedor', 'Se le debe'], ['Alumetal', 100],
    ['2 · CUENTA CORRIENTE POR PROVEEDOR'], ['Proveedor', 'CUIT'], ['Alumetal', '30-1'],
    [''], [''],
    ['7 · FACTURAS EMITIDAS — control cruzado'], ['x'],
    ['5 · LO QUE HAY QUE CORREGIR EN COMPRAS'],
  ]

  it('EL DEFECTO: el límite no puede depender de que la sección de abajo se llame "3"', () => {
    assert.equal(filaDelSiguienteTitulo(renumerada(), 4), 9, 'el límite de la sección 2 es el "7 ·"')
    assert.equal(filaDelSiguienteTitulo(renumerada(), 1), 4, 'el límite de la sección 1 es el "2 ·"')
  })

  it('no confunde un dato que arranca con un número con un título', () => {
    const f = [['1 · SECCIÓN'], ['0004-00003637', 6113], ['2026 - saldo', 1], ['2 · OTRA']]
    assert.equal(filaDelSiguienteTitulo(f, 1), 4)
  })

  it('sin sección de abajo devuelve 0, y sin límite no se borra nada', () => {
    assert.equal(filaDelSiguienteTitulo([['1 · SOLA'], ['dato']], 1), 0)
  })
})

describe('ultimaConDato', () => {
  it('EL DEFECTO: mide desde abajo, así una fila de separación con un resto no corre el conteo', () => {
    // Una fila EN EL MEDIO del aire con basura en la tercera columna: lo que hacía que el conteo
    // desde arriba diera 31 donde había 11.
    const f = pestana({ resto: { enFila: 5, fila: ['', '', 'resto viejo'] } })
    const titulo = f.length
    // La última con dato es la basura, no la 36: se borra de MENOS, que es el lado seguro.
    assert.equal(ultimaConDato(f, { desde: 2, hasta: titulo }), 41)
  })

  it('sin basura, la última con dato es el fin real del bloque', () => {
    const f = pestana()
    assert.equal(ultimaConDato(f, { desde: 2, hasta: f.length }), 36)
  })
})

describe('sobranteDeColchon', () => {
  it('EL DEFECTO: 18 filas de aire se devuelven hasta dejar el colchón chico', () => {
    const f = pestana({ aire: 18 })
    const s = sobranteDeColchon({ filas: f, desde: 2, hasta: f.length })
    assert.equal(s.blancas, 18)
    assert.equal(s.sobrante, 18 - COLCHON_FINAL)
    assert.equal(s.desdeBorrar, 36 + COLCHON_FINAL + 1)
    assert.equal(s.hastaBorrar, f.length)
  })

  it('deja EXACTAMENTE el colchón: la cuenta se cierra con el título de abajo', () => {
    const f = pestana({ aire: 18 })
    const s = sobranteDeColchon({ filas: f, desde: 2, hasta: f.length })
    const tituloDespues = f.length - s.sobrante
    assert.equal(tituloDespues - 1 - s.ultima, COLCHON_FINAL)
  })

  it('con el colchón justo no borra nada — el generador no puede oscilar', () => {
    const f = pestana({ aire: COLCHON_FINAL })
    assert.equal(sobranteDeColchon({ filas: f, desde: 2, hasta: f.length }).sobrante, 0)
  })

  it('con menos aire del colchón tampoco borra: el sobrante nunca es negativo', () => {
    const f = pestana({ aire: 1 })
    assert.equal(sobranteDeColchon({ filas: f, desde: 2, hasta: f.length }).sobrante, 0)
  })

  it('sin título de abajo no se borra nada: sin ancla no hay plan', () => {
    const f = pestana()
    assert.equal(sobranteDeColchon({ filas: f, desde: 2, hasta: 0 }).sobrante, 0)
  })

  it('un bloque entero vacío no se borra a ciegas', () => {
    const f = [['1 · QUÉ SE DEBE'], [], [], [], [], ['2 · CUENTA CORRIENTE']]
    assert.equal(sobranteDeColchon({ filas: f, desde: 2, hasta: 6 }).sobrante, 0)
  })

  it('una fila con dato SÓLO en una columna lejana cuenta como llena', () => {
    const f = pestana({ aire: 18 })
    f[40] = ['', '', '', '', '', '', '', '', '', '', '', '', 'nota del dueño en la M']
    const s = sobranteDeColchon({ filas: f, desde: 2, hasta: f.length })
    assert.equal(s.ultima, 41, 'una columna lejana con dato tiene que frenar el borrado')
  })
})

describe('filasNoVacias', () => {
  it('EL CINTURÓN: lo que se propone borrar está vacío en todo el ancho', () => {
    const f = pestana({ aire: 18 })
    const s = sobranteDeColchon({ filas: f, desde: 2, hasta: f.length })
    assert.deepEqual(filasNoVacias(f, s), [])
  })

  it('delata una fila con datos si el cálculo alguna vez se equivoca', () => {
    const f = pestana({ aire: 18 })
    assert.deepEqual(filasNoVacias(f, { desdeBorrar: 30, hastaBorrar: 33 }), [30, 31, 32])
  })
})
