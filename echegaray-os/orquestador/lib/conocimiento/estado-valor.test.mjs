// SI ESTOS TESTS SE CAEN, ALGUIEN VOLVIÓ A SUMAR UN `#REF!` COMO CERO.
//
// Cada caso sale de una celda real de `Planilla para Cotizar (2).xlsm` (sha256
// 0353cf88…794a): el `#REF!` es el de `Presupuesto!C57`, el blanco es la cantidad de
// `Presupuesto!E30` —el renglón que la hoja resuelve como «sin datos»— y el cero es la
// cantidad de `Análisis!E41`, la línea de CEMENTO PORTLAND de T1005 que está cotizada en 0.
//
// La prueba que importa es la última: si `sumar()` vuelve a tratar un error como cero, el total
// da igual que antes y sólo `descartados` se pone en rojo. Por eso se afirma el total Y la lista.
import assert from 'node:assert/strict'
import test from 'node:test'
import { errorDeCelda } from './celda.mjs'
import { ESTADO, esNumerico, estadoDe, sumaCompleta, sumar } from './estado-valor.mjs'

test('un #REF! es ERROR y no aporta número', () => {
  const r = estadoDe(errorDeCelda('#REF!'))
  assert.equal(r.estado, ESTADO.ERROR)
  assert.equal(r.numero, null)
  assert.equal(r.texto, '#REF!')
})

test('un #REF! crudo, sin envolver, también es ERROR', () => {
  // El lector no siempre envuelve: si la celda llega como texto, el error sigue siendo un error.
  assert.equal(estadoDe('#REF!').estado, ESTADO.ERROR)
  assert.equal(estadoDe('#DIV/0!').estado, ESTADO.ERROR)
  assert.equal(estadoDe('#N/A').estado, ESTADO.ERROR)
})

test('NULL, BLANK y ZERO son tres cosas distintas', () => {
  assert.equal(estadoDe(null).estado, ESTADO.NULL)
  assert.equal(estadoDe(undefined).estado, ESTADO.NULL)
  assert.equal(estadoDe('').estado, ESTADO.BLANK)
  assert.equal(estadoDe('   ').estado, ESTADO.BLANK)
  assert.equal(estadoDe(0).estado, ESTADO.ZERO)
})

test('el cero SÍ es un dato: aporta número', () => {
  const r = estadoDe(0)
  assert.equal(r.numero, 0)
  assert.equal(esNumerico(0), true)
})

test('NULL y BLANK NO aportan número', () => {
  assert.equal(estadoDe(null).numero, null)
  assert.equal(estadoDe('').numero, null)
  assert.equal(esNumerico(null), false)
  assert.equal(esNumerico(''), false)
})

test('un texto que no es número es UNKNOWN, nunca 0', () => {
  // «MANUFACTURAS QUIMICAS JUAN MESSINAS» daba 0 con `Number('')`. Nunca más.
  const r = estadoDe('MANUFACTURAS QUIMICAS JUAN MESSINAS')
  assert.equal(r.estado, ESTADO.UNKNOWN)
  assert.equal(r.numero, null)
})

test('NOT_APPLICABLE se declara, no se deduce', () => {
  assert.equal(estadoDe(5, { aplica: false }).estado, ESTADO.NOT_APPLICABLE)
  assert.equal(estadoDe(5, { aplica: false }).numero, null)
})

test('sumar() suma sólo los números y denuncia el resto', () => {
  const r = sumar([
    { valor: 315632.12, donde: 'Presupuesto!H10' },
    { valor: errorDeCelda('#REF!'), donde: 'Presupuesto!H57' },
    { valor: 0, donde: 'Presupuesto!H30' },
    { valor: null, donde: 'Presupuesto!H100' },
  ])
  assert.equal(r.total, 315632.12)
  assert.equal(r.sumados, 2)
  assert.equal(r.descartados.length, 2)
  assert.deepEqual(r.descartados.map((d) => d.estado), [ESTADO.ERROR, ESTADO.NULL])
  assert.equal(sumaCompleta(r), false)
})

test('EL DEFECTO: un #REF! NO puede desaparecer dentro del total', () => {
  // Revertir `estadoDe` a devolver 0 para ERROR hace que estas dos afirmaciones se contradigan:
  // el total seguiría siendo 100 pero `descartados` quedaría vacío. Se prueban las dos.
  const conError = sumar([100, errorDeCelda('#REF!')])
  const sinError = sumar([100])
  assert.equal(conError.total, sinError.total, 'el error no se suma')
  assert.notDeepEqual(conError.descartados, sinError.descartados, 'y el error tampoco se olvida')
  assert.equal(sumaCompleta(conError), false)
  assert.equal(sumaCompleta(sinError), true)
})
