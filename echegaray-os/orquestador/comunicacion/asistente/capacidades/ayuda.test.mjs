import { test } from 'node:test'
import assert from 'node:assert/strict'
import { capacidad } from './ayuda.mjs'
import { CAPACIDAD, zCapacidad } from '../contratos.mjs'
import { capacidades, capacidadesHabilitadas, renderAyuda } from '../registro.mjs'
import { capacidadFalsa, registroFalso } from '../dobles-de-prueba.mjs'

test('la ayuda cumple la forma que exige el registro', async () => {
  const r = zCapacidad.safeParse(capacidad)
  assert.equal(r.success, true, JSON.stringify(r.error?.issues ?? []))
  assert.equal(capacidad.id, CAPACIDAD.AYUDA)
  assert.equal(capacidad.efectoExterno, false, 'contar qué sé hacer no toca nada de afuera')
})

test('el registro la descubre del directorio, sin lista escrita a mano', async () => {
  const todas = await capacidades({ recargar: true })
  assert.ok(todas.some((c) => c.id === CAPACIDAD.AYUDA))
  const habilitadas = await capacidadesHabilitadas({})
  assert.ok(habilitadas.some((c) => c.id === CAPACIDAD.AYUDA), 'la ayuda siempre está')
})

test('responde con lo HABILITADO en ese momento, no con una lista fija', async () => {
  const registro = registroFalso([
    capacidad,
    capacidadFalsa({ id: 'drive.buscar', descripcion: 'buscarte un archivo en Drive' }),
    capacidadFalsa({ id: 'calendar.evento.crear', descripcion: 'agendarte un evento', habilitada: async () => false }),
  ])
  const r = await capacidad.ejecutar({}, { registro })
  assert.equal(r.ok, true)
  assert.ok(r.texto.includes('buscarte un archivo en Drive'))
  assert.equal(r.texto.includes('agendarte un evento'), false, 'no promete lo que no está habilitado')
  assert.deepEqual(r.evidencia.capacidades, [CAPACIDAD.AYUDA, 'drive.buscar'])
})

test('sin nada habilitado lo dice, no inventa una promesa', async () => {
  const r = await capacidad.ejecutar({}, { registro: registroFalso([]) })
  assert.equal(r.ok, true)
  assert.ok(/no tengo ninguna capacidad/i.test(r.texto))
})

test('el texto lo arma renderAyuda: si mañana cambia el formato, cambia en un solo lugar', async () => {
  const registro = registroFalso([capacidad])
  const r = await capacidad.ejecutar({}, { registro })
  assert.equal(r.texto, renderAyuda([capacidad]))
})
