import { test } from 'node:test'
import assert from 'node:assert/strict'
import { capacidad } from './ayuda.mjs'
import { CAPACIDAD, zCapacidad } from '../contratos.mjs'
import { capacidades, capacidadesHabilitadas, renderAyuda } from '../registro.mjs'
import { capacidadFalsa, registroFalso } from '../dobles-de-prueba.mjs'
import { MOTIVO_IDENTIDAD } from '../identidades.mjs'

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

test('responde con lo HABILITADO en ese momento, y lo trabado lo dice aparte con su motivo', async () => {
  // LO QUE CAMBIÓ Y POR QUÉ. Antes lo no habilitado se callaba, y eso parecía prudente: no prometer
  // lo que va a fallar. En producción resultó ser una mentira por omisión — a alguien cuya identidad
  // el OS no resolvía le mostraba un bot que no sabe agendar, cuando la verdad era que sabía y no lo
  // reconocía a él. Se sigue sin PROMETER (no entra en "Puedo:") y se pasa a DECLARAR, con el porqué.
  const registro = registroFalso([
    capacidad,
    capacidadFalsa({ id: 'drive.buscar', descripcion: 'buscarte un archivo en Drive' }),
    capacidadFalsa({ id: 'calendar.evento.crear', descripcion: 'agendarte un evento', habilitada: async () => false }),
  ])
  const r = await capacidad.ejecutar({}, { registro })
  assert.equal(r.ok, true)
  const [puedo, noPuedo] = r.texto.split('\n\n')
  assert.ok(puedo.includes('buscarte un archivo en Drive'))
  assert.equal(puedo.includes('agendarte un evento'), false, 'no se promete lo que no está habilitado')
  assert.match(noPuedo, /agendarte un evento —/, 'pero se nombra, con el motivo al lado')
  assert.deepEqual(r.evidencia.capacidades, [CAPACIDAD.AYUDA, 'drive.buscar'])
  // El contexto de este test no trae identidad, y el motivo lo dice tal cual: cuando el OS no
  // sabe quién pregunta, eso ES la razón, y decir "no está disponible" sería tapar el defecto.
  assert.deepEqual(r.evidencia.noDisponibles, [{ id: 'calendar.evento.crear', motivo: MOTIVO_IDENTIDAD.SIN_ACTOR }])
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
