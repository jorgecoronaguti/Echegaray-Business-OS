// CREAR UN EVENTO: que exista de verdad, que no se cree dos veces, y que la duración
// asumida se diga. Ninguna llamada sale a Google: el cliente es un doble que registra.

import test from 'node:test'
import assert from 'node:assert/strict'
import { capacidad, DURACION_DEFECTO_MIN } from './calendar-evento.mjs'
import { CUENTA } from '../google-cliente.mjs'
import { ERROR } from '../contratos.mjs'

const AHORA = new Date('2026-07-30T10:00:00-03:00')
const MANANA_9 = '2026-07-31T09:00:00-03:00'

function googleFalso({ agenda = [], falla = null, creado } = {}) {
  const creados = []
  return {
    creados,
    [CUENTA]: { email: 'jorge@ecsas.com.ar', propia: true },
    async calendarUpcoming() { return agenda },
    async calendarCreateEvent(ev) {
      if (falla) throw falla
      creados.push(ev)
      if (creado !== undefined) return creado
      return { id: 'ev1', summary: ev.summary, start: ev.start, end: ev.end, link: 'https://calendar.google.com/event?eid=ev1' }
    },
  }
}

const ctxCon = (google) => ({
  google,
  identidad: { plataformaUserId: 'u1', nombreVisible: 'Jorge', email: 'jorge@ecsas.com.ar' },
  ahora: () => AHORA,
})

test('sin hora de fin le pone una hora y lo DICE (queda corregible)', async () => {
  const g = googleFalso()
  const r = await capacidad.ejecutar({ titulo: 'Reunión con Rodrigo', inicio: MANANA_9 }, ctxCon(g))
  assert.equal(r.ok, true)
  assert.match(r.texto, /^Listo\. Creé "Reunión con Rodrigo" mañana de 09:00 a 10:00\./)
  assert.match(r.texto, new RegExp(`${DURACION_DEFECTO_MIN} minutos`))
  assert.equal(g.creados[0].end, '2026-07-31T10:00:00-03:00')
  assert.equal(r.evidencia.evento.id, 'ev1')
  assert.equal(r.evidencia.evento.enlace, 'https://calendar.google.com/event?eid=ev1')
})

test('con fin explícito no se asume nada ni se aclara nada', async () => {
  const g = googleFalso()
  const r = await capacidad.ejecutar(
    { titulo: 'Visita de obra', inicio: MANANA_9, fin: '2026-07-31T12:30:00-03:00' }, ctxCon(g))
  assert.equal(r.texto, 'Listo. Creé "Visita de obra" mañana de 09:00 a 12:30.')
  assert.equal(g.creados[0].end, '2026-07-31T12:30:00-03:00')
})

test('la duración dicha por el usuario manda sobre el default', async () => {
  const g = googleFalso()
  await capacidad.ejecutar({ titulo: 'Daily', inicio: MANANA_9, duracionMin: 15 }, ctxCon(g))
  assert.equal(g.creados[0].end, '2026-07-31T09:15:00-03:00')
})

test('si ya está agendado no crea un segundo: devuelve el que existe', async () => {
  const g = googleFalso({ agenda: [{ id: 'viejo', summary: 'Reunión con Rodrigo', start: MANANA_9, end: '2026-07-31T10:00:00-03:00' }] })
  const r = await capacidad.ejecutar({ titulo: 'reunion con rodrigo', inicio: MANANA_9 }, ctxCon(g))
  assert.equal(r.ok, true)
  assert.equal(r.evidencia.duplicado, true)
  assert.equal(r.evidencia.evento.id, 'viejo')
  assert.equal(g.creados.length, 0)
  assert.match(r.texto, /ya estaba agendado/)
})

test('mismo título a otra hora NO es duplicado', async () => {
  const g = googleFalso({ agenda: [{ id: 'viejo', summary: 'Reunión con Rodrigo', start: '2026-07-31T15:00:00-03:00' }] })
  const r = await capacidad.ejecutar({ titulo: 'Reunión con Rodrigo', inicio: MANANA_9 }, ctxCon(g))
  assert.equal(r.evidencia.duplicado, false)
  assert.equal(g.creados.length, 1)
})

test('los invitados viajan como emails y se nombran en la confirmación', async () => {
  const g = googleFalso()
  const r = await capacidad.ejecutar(
    { titulo: 'Cierre de mes', inicio: MANANA_9, participantes: ['rodrigo@ecsas.com.ar'] }, ctxCon(g))
  assert.deepEqual(g.creados[0].attendees, ['rodrigo@ecsas.com.ar'])
  assert.match(r.texto, /invitación a rodrigo@ecsas\.com\.ar/)
})

test('un invitado que no es un mail frena TODO: no se crea el evento a medias', async () => {
  const g = googleFalso()
  const r = await capacidad.ejecutar(
    { titulo: 'Cierre de mes', inicio: MANANA_9, participantes: ['rodrigo@ecsas.com.ar', 'el flaco de compras'] }, ctxCon(g))
  assert.equal(r.ok, false)
  assert.equal(r.error.codigo, ERROR.DATO_FALTANTE)
  assert.equal(g.creados.length, 0)
})

test('sin id de Google no se dice "listo": no hay evidencia, no hay evento', async () => {
  const g = googleFalso({ creado: { summary: 'x' } })
  const r = await capacidad.ejecutar({ titulo: 'Reunión', inicio: MANANA_9 }, ctxCon(g))
  assert.equal(r.ok, false)
  assert.equal(r.error.codigo, ERROR.DEFINITIVO)
  assert.equal(r.evidencia, null)
})

test('OAuth vencido → google_sin_acceso con frase humana', async () => {
  const g = googleFalso({ falla: Object.assign(new Error('google api 401: invalid_grant'), { status: 401 }) })
  const r = await capacidad.ejecutar({ titulo: 'Reunión', inicio: MANANA_9 }, ctxCon(g))
  assert.equal(r.error.codigo, ERROR.GOOGLE_SIN_ACCESO)
  assert.match(r.texto, /Conectar con Google/)
})

test('Google caído (503) es temporal', async () => {
  const g = googleFalso({ falla: Object.assign(new Error('google api 503'), { status: 503 }) })
  const r = await capacidad.ejecutar({ titulo: 'Reunión', inicio: MANANA_9 }, ctxCon(g))
  assert.equal(r.error.codigo, ERROR.TEMPORAL)
  assert.equal(r.error.reintentable, true)
})

test('no se agenda en la cuenta de otro: si no conectó la suya, se le dice', async () => {
  const ajeno = googleFalso()
  ajeno[CUENTA] = { email: 'jorge@ecsas.com.ar', propia: false }
  const r = await capacidad.ejecutar({ titulo: 'Reunión', inicio: MANANA_9 }, ctxCon(ajeno))
  assert.equal(r.error.codigo, ERROR.GOOGLE_SIN_ACCESO)
  assert.equal(ajeno.creados.length, 0)
})

test('sin cuenta conectada, la capacidad no se ofrece ni se ejecuta', async () => {
  const r = await capacidad.ejecutar({ titulo: 'Reunión', inicio: MANANA_9 }, { identidad: { email: 'x@y.com' } })
  assert.equal(r.error.codigo, ERROR.GOOGLE_SIN_ACCESO)
  const off = await capacidad.habilitada({ identidad: { email: 'x@y.com' }, googleDeps: { tieneToken: async () => false } })
  assert.equal(off, false)
  const on = await capacidad.habilitada({ identidad: { email: 'x@y.com' }, googleDeps: { tieneToken: async () => true } })
  assert.equal(on, true)
})

test('una fecha que no es un instante no llega a Google', async () => {
  const g = googleFalso()
  const r = await capacidad.ejecutar({ titulo: 'Reunión', inicio: 'el jueves' }, ctxCon(g))
  assert.equal(r.ok, false)
  assert.equal(r.error.codigo, ERROR.DATO_FALTANTE)
  assert.equal(g.creados.length, 0)
})
