// LA TOOL DEL CHAT — que el dueño pueda pedir el análisis cuando quiera, y que sepa por qué falta
// el mercado cuando falta.
//
// El defecto que estos tests fijan no era un error: la tool analizaba la caja y contestaba "el
// mercado se releva en la corrida programada". O sea que el dueño no podía pedirlo cuando lo
// necesitaba — que es exactamente cuando sirve.

import test from 'node:test'
import assert from 'node:assert/strict'
import { armarRespuesta } from './tesoreria-tool.mjs'

const POSICION = {
  caja_real: 129000000, caja_comprometida: 11000000, caja_minima: 0,
  caja_restringida: { restricted_cash_amount: null, restricted_cash_status: 'unknown' },
  accionable: false, bloqueos_accionabilidad: ['falta aprobar la reserva mínima'],
}
const EXCEDENTE = { ventanas: [{ titulo: 'T+0', monto_maximo: 0, motivo: 'sin excedente' }], deuda_cancelable: { monto: 0 } }
const base = (extra = {}) => ({ posicion: POSICION, excedente: EXCEDENTE, recomendaciones: [], ...extra })

test('con una corrida en curso NO se pelea por la pestaña: se dice que espere', () => {
  const r = armarRespuesta(base(), { tomado: false, motivo: 'hay una corrida en curso desde las 09:16' })
  assert.match(r.texto, /No se miró el mercado/)
  assert.match(r.texto, /corrida en curso/)
  assert.match(r.texto, /Probá de nuevo/, 'tiene que decir qué hacer, no sólo qué pasó')
})

test('sin sesión de Balanz manda a entrar, no a esperar', () => {
  const r = armarRespuesta(base({ estado: 'session_required' }), { tomado: true })
  assert.match(r.texto, /sesión de Balanz no está iniciada/)
  assert.match(r.texto, /enlace/)
})

test('con el navegador caído NO ofrece iniciar sesión', () => {
  // Mandar al dueño a la pantalla remota con el navegador caído es mandarlo a mirar una pantalla
  // negra. Son problemas distintos y piden cosas distintas.
  const r = armarRespuesta(base({ estado: 'browser_error', motivo: 'el contenedor del navegador no existe' }), { tomado: true })
  assert.match(r.texto, /el contenedor del navegador no existe/)
  assert.ok(!/enlace|iniciá sesión/i.test(r.texto), 'ofreció entrar con el navegador caído')
})

test('si SÍ miró el mercado y no hubo nada apto, lo dice como tal', () => {
  // Es el caso que más se confunde: "no encontré nada" y "no pude mirar" se ven igual en un chat y
  // significan lo opuesto. Uno es una respuesta; el otro es una falla.
  const r = armarRespuesta(base({ estado: 'ok' }), { tomado: true })
  assert.match(r.texto, /Se miró el mercado/)
  assert.ok(!/No se miró/.test(r.texto))
})

test('con recomendaciones no explica nada: devuelve las propuestas', () => {
  const r = armarRespuesta(base({ estado: 'ok', recomendaciones: [] }), { tomado: true })
  assert.ok(r.texto.includes('Techo técnico') || r.texto.includes('Excedente'))
})
