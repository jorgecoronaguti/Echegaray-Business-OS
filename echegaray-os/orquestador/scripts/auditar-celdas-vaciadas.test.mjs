// El núcleo del auditor: decidir si una celda ya marcada como vaciada por el dueño está PROTEGIDA o
// EN RIESGO. Sin esto, el auditor sería una lista de celdas sin veredicto — que es exactamente el
// estado del que se venía: había marcas en la base y nadie sabía cuáles se iban a respetar.
import test from 'node:test'
import assert from 'node:assert/strict'
import { veredictoDeMarcas } from './auditar-celdas-vaciadas.mjs'

const marca = (forma) => ({ fila: 17, col: 0, forma })

test('con el mapa alineado, la marca la defiende su coordenada', () => {
  const [v] = veredictoDeMarcas([marca('total facturado del período')], true, new Set())
  assert.equal(v.estado, 'PROTEGIDA')
  assert.match(v.por, /coordenada/)
})

test('sin mapa, la defiende su forma: si no está en ninguna parte, no vuelve', () => {
  const [v] = veredictoDeMarcas([marca('total facturado del período')], false, new Set(['otra cosa']))
  assert.equal(v.estado, 'PROTEGIDA')
  assert.match(v.por, /forma ausente/)
})

test('sin mapa y con la forma de vuelta en la pestaña, la marca ya no alcanza: EN RIESGO', () => {
  // El caso que el auditor existe para encontrar: el borrado no se puede volver a probar y la
  // próxima corrida lo repone. Que salga en la lista es lo que permite mirarlo ANTES.
  const [v] = veredictoDeMarcas([marca('total facturado del período')], false, new Set(['total facturado del período']))
  assert.equal(v.estado, 'EN RIESGO')
})

test('la comparación de forma normaliza los dos lados (apóstrofos de Google incluidos)', () => {
  const [v] = veredictoDeMarcas([marca("=sumproduct('_movimientos'!$a$#:$a)")], false, new Set(['=sumproduct(_movimientos!$a$#:$a)']))
  assert.equal(v.estado, 'EN RIESGO', 'la misma fórmula con y sin apóstrofo es la misma forma')
})
