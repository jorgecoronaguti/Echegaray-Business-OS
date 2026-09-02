// El arranque conversacional detecta el presupuesto creado — y NUNCA navega sin uno.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { destinoDeRespuesta, numeroDeRespuesta } from './arranque.ts'

test('una respuesta con cotizacion_id navega al entorno de ese presupuesto', () => {
  assert.equal(
    destinoDeRespuesta({ ok: true, datos: { cotizacion_id: 'abc-123', numero: 'COT-XSAS-QTP-1' } }),
    '/presupuestos/abc-123',
  )
  assert.equal(numeroDeRespuesta({ datos: { numero: 'COT-XSAS-QTP-1' } }), 'COT-XSAS-QTP-1')
})

test('sin presupuesto creado no hay navegación: la conversación sigue donde está', () => {
  assert.equal(destinoDeRespuesta({ ok: true, respuesta: 'hola', datos: { total: 3 } }), null)
  assert.equal(destinoDeRespuesta({ ok: false, error: { mensaje: 'falta_dato' } }), null)
  assert.equal(destinoDeRespuesta({ datos: { cotizacion_id: 42 } }), null)  // un id que no es texto no navega
  assert.equal(destinoDeRespuesta({ datos: { cotizacion_id: '  ' } }), null)
  assert.equal(destinoDeRespuesta(null), null)
  assert.equal(destinoDeRespuesta('texto'), null)
  assert.equal(numeroDeRespuesta({ datos: {} }), null)
})
