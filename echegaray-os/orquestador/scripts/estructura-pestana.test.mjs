// `ESTRUCTURA_TOTAL_MESES` APUNTABA A LA FILA 3, QUE ES UNA FILA EN BLANCO.
//
// Es el tercero de los tres rangos ciegos de la auditoría del 03/08, y el de causa más simple: este
// generador NO publicaba ningún rango con nombre. El nombre venía de un layout anterior —cuando el
// cuadro arrancaba arriba de todo, sin subtítulo ni títulos de sección— y como nadie lo republicaba,
// se quedó donde estaba mientras el cuadro bajaba. Anclado a la posición.
//
// Lo que se prueba: que el nombre caiga SOBRE la fila de totales que este generador acaba de armar,
// y que esa fila tenga contenido. El oráculo es la grilla, no un número de fila escrito acá.
import test from 'node:test'
import assert from 'node:assert/strict'
import { grilla, rangosDeEstructura, ROTULO_TOTAL } from './estructura-pestana.mjs'
import { verificarRangos, explicarProblemas, fila } from '../lib/rangos-con-nombre.mjs'

const g = grilla()

test('ESTRUCTURA_TOTAL_MESES cae sobre la fila de totales, con los doce meses adentro', () => {
  const problemas = verificarRangos(g.filas, rangosDeEstructura(g))
  assert.deepEqual(problemas, [], explicarProblemas(problemas))
  const [d] = rangosDeEstructura(g)
  assert.equal(d.r0, g.fTot, 'el rango tiene que salir de la fila que el generador acaba de calcular')
  assert.equal(d.c1 - d.c0 + 1, 12, 'son los doce meses del año, no el total anual')
})

test('LA FILA 3 —donde estaba— es justamente una fila en blanco', () => {
  // El defecto medido en el archivo real: cero celdas con dato, y por lo tanto cualquier fórmula que
  // lo leyera valía 0 sin dar error. Si algún día la fila 3 dejara de estar en blanco, esto avisa que
  // el "antes" de este arreglo ya no es el que se documentó.
  assert.equal(String(g.filas[2]?.[1] ?? ''), '')
  const viejo = fila('ESTRUCTURA_TOTAL_MESES', { fila: 3, c0: 1, c1: 12, rotulo: ROTULO_TOTAL })
  assert.equal(verificarRangos(g.filas, [viejo])[0].problema, 'desanclado')
})

test('la fila de totales conserva su rótulo: es el ancla del rango', () => {
  assert.equal(g.filas[g.fTot - 1][0], ROTULO_TOTAL)
})
