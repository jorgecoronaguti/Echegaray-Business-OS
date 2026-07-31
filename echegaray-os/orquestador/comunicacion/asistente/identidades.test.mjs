import { test } from 'node:test'
import assert from 'node:assert/strict'
import { identidadDe, listarIdentidades, registrarIdentidad, resolverPersona, emailDe, nombreCorto, normalizar } from './identidades.mjs'
import { baseFalsa, filaIdentidad } from './dobles-de-prueba.mjs'

const EQUIPO = [
  filaIdentidad({ id: 'u-jorge', username: 'jorge', nombre: 'Jorge Corona', email: 'jorge@ecsas.com.ar', alias: ['jorgito'] }),
  filaIdentidad({ id: 'u-rodrigo', username: 'rodrigo', nombre: 'Rodrigo Bronia', email: 'rodrigo@ecsas.com.ar' }),
  filaIdentidad({ id: 'u-rodrigo2', username: 'rperez', nombre: 'Rodrigo Pérez', email: 'rperez@ecsas.com.ar' }),
  filaIdentidad({ id: 'u-jp', username: 'jpablo', nombre: 'Juan Pablo Gómez', email: null }),
  filaIdentidad({ id: 'u-baja', username: 'exempleado', nombre: 'Carlos Retirado', activo: false }),
]

const port = () => baseFalsa({ identidades: EQUIPO })

test('la identidad de quien escribe sale de la tabla, no del texto del mensaje', async () => {
  const i = await identidadDe(port(), 'u-rodrigo')
  assert.equal(i.nombreVisible, 'Rodrigo Bronia')
  assert.equal(emailDe(i), 'rodrigo@ecsas.com.ar')
  assert.equal(await identidadDe(port(), 'u-que-no-existe'), null)
})

test('quien está dado de baja no participa de ninguna resolución', async () => {
  assert.equal(await identidadDe(port(), 'u-baja'), null)
  assert.deepEqual(await resolverPersona(port(), 'Carlos'), { ninguna: true })
  assert.equal((await listarIdentidades(port())).length, 4)
})

test('el username exacto gana, aunque haya homónimos en el nombre visible', async () => {
  const r = await resolverPersona(port(), 'rodrigo')
  assert.equal(r.unica.plataformaUserId, 'u-rodrigo')
  assert.equal((await resolverPersona(port(), '@rodrigo')).unica.plataformaUserId, 'u-rodrigo')
})

test('dos personas con el mismo primer nombre son AMBIGUAS, no la primera que aparece', async () => {
  const sinUsername = [
    filaIdentidad({ id: 'a', username: 'rbronia', nombre: 'Rodrigo Bronia' }),
    filaIdentidad({ id: 'b', username: 'rperez', nombre: 'Rodrigo Pérez' }),
  ]
  const r = await resolverPersona(baseFalsa({ identidades: sinUsername }), 'Rodrigo')
  assert.equal(r.unica, undefined)
  assert.equal(r.ambiguas.length, 2)
})

test('un nombre compuesto y con acentos resuelve igual (se compara normalizado)', async () => {
  assert.equal((await resolverPersona(port(), 'Juan Pablo')).unica.plataformaUserId, 'u-jp')
  assert.equal((await resolverPersona(port(), 'juan pablo gomez')).unica.plataformaUserId, 'u-jp')
  assert.equal((await resolverPersona(port(), 'Gómez')).unica.plataformaUserId, 'u-jp', 'el apellido suelto')
  assert.equal((await resolverPersona(port(), 'jorgito')).unica.plataformaUserId, 'u-jorge', 'el alias cargado a mano')
})

test('quien no está en la tabla NO se rellena con el más parecido', async () => {
  assert.deepEqual(await resolverPersona(port(), 'Rodrigofo'), { ninguna: true })
  assert.deepEqual(await resolverPersona(port(), 'el nuevo'), { ninguna: true })
  assert.deepEqual(await resolverPersona(port(), ''), { ninguna: true })
})

test('registrar es idempotente: dos corridas no duplican a nadie', async () => {
  const db = baseFalsa({ identidades: [] })
  const datos = { plataformaUserId: 'u-nuevo', plataformaUsername: 'nuevo', nombreVisible: 'Persona Nueva', email: 'n@ecsas.com.ar' }
  const a = await registrarIdentidad(db, datos)
  const b = await registrarIdentidad(db, { ...datos, nombreVisible: 'Persona Nueva Apellido' })
  assert.equal(a.insertada, true)
  assert.equal(b.insertada, false, 'la segunda actualiza, no inserta')
  assert.equal(db.identidades.length, 1)
  assert.equal(b.identidad.nombreVisible, 'Persona Nueva Apellido')
})

test('sin email no hay Google: se dice, no se inventa una casilla', () => {
  assert.equal(emailDe({ email: null }), null)
  assert.equal(emailDe({ email: '  ' }), null)
  assert.equal(nombreCorto(null), 'esa persona')
})

test('normalizar es lo que hace comparables "@Rodrigo Broniá," y "rodrigo bronia"', () => {
  assert.equal(normalizar('  @Rodrigo Broniá, '), 'rodrigo bronia')
})
