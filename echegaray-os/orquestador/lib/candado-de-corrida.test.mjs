// EL CANDADO TIENE QUE SOLTARSE SOLO. Un candado que no se suelta es peor que el problema que
// arregla: una corrida muerta de un `kill -9` dejaría la máquina trabada para siempre, y nadie
// sabría por qué `npm run orq:test` se quedó esperando.
import test from 'node:test'
import assert from 'node:assert/strict'
import { EDAD_MAXIMA_MS, avisoDeEspera, contenidoDelCandado, estadoDelCandado } from './candado-de-corrida.mjs'

const vivo = () => true
const muerto = () => false

test('sin candado se arranca', () => {
  assert.equal(estadoDelCandado(null, { vivo }).estado, 'libre')
  assert.equal(estadoDelCandado('', { vivo }).estado, 'libre')
  assert.equal(estadoDelCandado('   ', { vivo }).estado, 'libre')
})

test('un candado de un proceso vivo se respeta, y dice quién lo tiene', () => {
  const c = contenidoDelCandado({ pid: 4242, ahora: 1000 })
  const r = estadoDelCandado(c, { vivo, ahora: 2000 })
  assert.equal(r.estado, 'tomado')
  assert.equal(r.pid, 4242)
  assert.match(r.porQue, /4242/, 'el motivo tiene que nombrar al proceso, no decir "está tomado"')
})

// ═══ LO QUE HACE QUE ESTO SEA SEGURO ═══
test('un candado de un proceso muerto NO traba la máquina', () => {
  const c = contenidoDelCandado({ pid: 4242, ahora: 1000 })
  const r = estadoDelCandado(c, { vivo: muerto, ahora: 2000 })
  assert.equal(r.estado, 'huerfano')
  assert.match(r.porQue, /ya no existe/)
})

test('un candado más viejo que el máximo se suelta aunque el PID viva', () => {
  // Un PID se reusa: el 4242 de hace tres horas puede ser otro proceso hoy. La edad es la segunda
  // red, y sin ella un PID reciclado trabaría la máquina para siempre sin que nada lo delate.
  const c = contenidoDelCandado({ pid: 4242, ahora: 0 })
  assert.equal(estadoDelCandado(c, { vivo, ahora: EDAD_MAXIMA_MS + 1 }).estado, 'huerfano')
  assert.equal(estadoDelCandado(c, { vivo, ahora: EDAD_MAXIMA_MS - 1 }).estado, 'tomado')
})

test('un candado ilegible es basura, no una afirmación: no se respeta', () => {
  for (const basura of ['{no es json', '{}', '{"pid":0}', '{"pid":-3}', '{"pid":"cuatro"}', 'hola']) {
    assert.equal(estadoDelCandado(basura, { vivo }).estado, 'huerfano', `«${basura}» no dice quién lo tiene`)
  }
})

test('el aviso de espera nombra al proceso y cuánto lleva — una espera muda se lee como un cuelgue', () => {
  const t = avisoDeEspera({ pid: 99, desde: 0, ahora: 30_000 })
  assert.match(t, /99/)
  assert.match(t, /30 s/)
})

// ═══ EL TEST NEGATIVO: ESTE CONTROL PUEDE DAR ROJO ═══
//
// Si `estadoDelCandado` devolviera siempre 'libre', todo lo de arriba menos un caso seguiría pasando
// y el candado no serviría para nada. Y si devolviera siempre 'tomado', trabaría la máquina.
test('un candado que siempre dice lo mismo no es un candado', () => {
  const c = contenidoDelCandado({ pid: 4242, ahora: 1000 })
  const conVida = estadoDelCandado(c, { vivo, ahora: 2000 }).estado
  const sinVida = estadoDelCandado(c, { vivo: muerto, ahora: 2000 }).estado
  const sinNada = estadoDelCandado(null, { vivo }).estado
  assert.notEqual(conVida, sinVida, 'tiene que distinguir un proceso vivo de uno muerto')
  assert.notEqual(conVida, sinNada, 'tiene que distinguir un candado puesto de ninguno')
  assert.equal(new Set([conVida, sinVida, sinNada]).size, 3, 'los tres estados tienen que ser distintos')
})

test('un candado sin PID no se puede soltar, así que no se escribe', () => {
  for (const malo of [undefined, null, 0, -1, 1.5, 'x']) {
    assert.throws(() => contenidoDelCandado({ pid: malo }), TypeError)
  }
})

test('estadoDelCandado exige saber si un PID vive: sin eso no puede decidir nada', () => {
  assert.throws(() => estadoDelCandado('{"pid":1}', {}), TypeError)
})
