import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hayTardanza, rotuloTardanza, sinTardanzasNuevas } from './tardanza.ts'
import { loQueViajaPresencia, planDePresencia, casillasDePresencia } from './presenciaDelDia.ts'

// LOS DEFECTOS QUE ESTOS TESTS ATRAPAN:
//  1. Que una tardanza viaje pegada a un «no vino» (el CHECK de la base la rechazaría entera).
//  2. Que cambiar SÓLO la marca de tardanza no cuente como cambio y no se escriba.
//  3. Que en una quincena cerrada la marca nueva se escriba igual (lo sellado no se toca).
//  4. Que lo guardado con marca se muestre sin ella al reabrir el día.

test('la tardanza viaja sólo con «está»: sobre «no vino» se descarta', () => {
  const marcas = loQueViajaPresencia({
    a: { estado: 'presente', motivo: null, llego_tarde: true },
    b: { estado: 'ausente', motivo: 'lluvia', llego_tarde: true, salio_antes: true },
    c: { estado: 'presente', motivo: null },
  })
  assert.deepEqual(marcas.find((m) => m.persona_id === 'a'), { persona_id: 'a', estado: 'presente', motivo: null, llego_tarde: true })
  assert.deepEqual(marcas.find((m) => m.persona_id === 'b'), { persona_id: 'b', estado: 'ausente', motivo: 'lluvia' })
  assert.equal(hayTardanza(marcas.find((m) => m.persona_id === 'c')), false)
})

test('cambiar sólo la tardanza ES un cambio: se escribe', () => {
  const guardadas = [{ persona_id: 'a', estado: 'presente' as const, motivo: null }]
  const plan = planDePresencia([{ persona_id: 'a', estado: 'presente', motivo: null, salio_antes: true }], guardadas)
  assert.equal(plan.cambios.length, 1)
  const igual = planDePresencia([{ persona_id: 'a', estado: 'presente', motivo: null }], guardadas)
  assert.equal(igual.cambios.length, 0)
  // lo guardado con marca y el envío sin ella: también es un cambio (se quita la marca)
  const quita = planDePresencia([{ persona_id: 'a', estado: 'presente', motivo: null }], [{ ...guardadas[0], llego_tarde: true }])
  assert.equal(quita.cambios.length, 1)
})

test('en una quincena cerrada la marca nueva se descarta y la presencia sigue viajando', () => {
  const r = sinTardanzasNuevas(
    [
      { persona_id: 'a', estado: 'presente', llego_tarde: true, salio_antes: false },
      { persona_id: 'b', estado: 'presente', llego_tarde: false, salio_antes: false },
      { persona_id: 'c', estado: 'ausente', llego_tarde: false, salio_antes: false },
    ],
    [{ persona_id: 'b', estado: 'presente', llego_tarde: true }],
  )
  assert.equal(r.descartadas, 2, 'a quiso marcar, b quiso desmarcar: las dos se descartan')
  assert.deepEqual(r.marcas[0], { persona_id: 'a', estado: 'presente', llego_tarde: false, salio_antes: false })
  assert.deepEqual(r.marcas[1], { persona_id: 'b', estado: 'presente', llego_tarde: true, salio_antes: false })
  assert.equal(r.marcas[2].estado, 'ausente')
})

test('lo guardado con marca se muestra con la marca al reabrir el día', () => {
  const c = casillasDePresencia(['a', 'b'], [{ persona_id: 'a', estado: 'presente', motivo: null, salio_antes: true }])
  assert.deepEqual(c.a, { estado: 'presente', motivo: null, salio_antes: true })
  assert.deepEqual(c.b, { estado: null, motivo: null })
})

test('el rótulo dice qué pasó', () => {
  assert.equal(rotuloTardanza({ llego_tarde: true }), 'llegó tarde')
  assert.equal(rotuloTardanza({ llego_tarde: true, salio_antes: true }), 'llegó tarde y salió antes')
  assert.equal(rotuloTardanza(null), '')
})
