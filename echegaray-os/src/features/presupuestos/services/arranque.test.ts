// El arranque conversacional detecta el presupuesto creado — y NUNCA navega sin uno.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { destinoDeRespuesta, numeroDeRespuesta, pasosDeRespuesta } from './arranque.ts'

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

test('el paso a paso del razonamiento se parte en bloques dibujables, sin inventar estados', () => {
  const texto = '**RAZONAMIENTO DEL COTIZADOR — QTP** (todo con cita)\n\n**1 · Superficies** — cubierta declarada: 258.77 m²\n**2 · Bases** — B0=? (cantidad incompleta)\n\n**3 · Vigas** — VF: ninguna detectada'
  const pasos = pasosDeRespuesta({ datos: { razonamiento_texto: texto } })
  assert.equal(pasos.length, 3)
  assert.equal(pasos[0].titulo, '1 · Superficies')
  assert.match(pasos[1].cuerpo, /cantidad incompleta/)   // el faltante viaja NOMBRADO en el cuerpo
  assert.equal(pasosDeRespuesta({ datos: {} }).length, 0)
  assert.equal(pasosDeRespuesta(null).length, 0)
})
