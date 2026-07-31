// CREAR UNA TAREA: el día correcto (la trampa del UTC), sin duplicar, y sin prometer una
// hora que Google no guarda. Cliente falso: nada sale a Google Tasks.

import test from 'node:test'
import assert from 'node:assert/strict'
import { capacidad } from './tasks-tarea.mjs'
import { CUENTA } from '../google-cliente.mjs'
import { ERROR } from '../contratos.mjs'

function googleFalso({ tareas = [], listas = [], falla = null, creada } = {}) {
  const creadas = []
  return {
    creadas,
    [CUENTA]: { email: 'jorge@ecsas.com.ar', propia: true },
    async tasksLists() { return listas },
    async tasksList() { return tareas },
    async taskCreate(t) {
      if (falla) throw falla
      creadas.push(t)
      if (creada !== undefined) return creada
      return { id: 't1', title: t.title, due: t.due ? `${t.due}T00:00:00.000Z` : null, status: 'needsAction' }
    },
  }
}

const ctxCon = (google) => ({
  google,
  identidad: { plataformaUserId: 'u1', nombreVisible: 'Jorge', email: 'jorge@ecsas.com.ar' },
  ahora: () => new Date('2026-07-30T10:00:00-03:00'),
})

test('la tarea se crea con evidencia y en la lista por defecto', async () => {
  const g = googleFalso()
  const r = await capacidad.ejecutar({ titulo: 'Llamar al contador', vence: '2026-07-31T08:00:00-03:00' }, ctxCon(g))
  assert.equal(r.ok, true)
  assert.equal(r.evidencia.tarea.id, 't1')
  assert.equal(g.creadas[0].tasklist, '@default')
  assert.match(r.texto, /Listo\. Anoté "Llamar al contador" para el viernes 31 de julio\./)
})

test('la trampa del UTC: "el viernes a las 21" vence el VIERNES, no el sábado', async () => {
  const g = googleFalso()
  const r = await capacidad.ejecutar({ titulo: 'Mandar el certificado', vence: '2026-07-31T21:00:00-03:00' }, ctxCon(g))
  assert.equal(g.creadas[0].due, '2026-07-31')
  // Y como Tasks tira la hora, se avisa en vez de prometerla.
  assert.match(r.texto, /guarda sólo el día/)
})

test('sin hora explícita no se aclara nada sobre la hora', async () => {
  const g = googleFalso()
  const r = await capacidad.ejecutar({ titulo: 'Revisar IVA', vence: '2026-08-03T00:00:00-03:00' }, ctxCon(g))
  assert.ok(!/guarda sólo el día/.test(r.texto), r.texto)
})

test('sin vencimiento la tarea igual se crea', async () => {
  const g = googleFalso()
  const r = await capacidad.ejecutar({ titulo: 'Pedir presupuesto de hormigón' }, ctxCon(g))
  assert.equal(r.ok, true)
  assert.equal(g.creadas[0].due, undefined)
  assert.match(r.texto, /en tus tareas/)
})

test('mismo título y mismo día: se devuelve la que ya está', async () => {
  const g = googleFalso({ tareas: [{ id: 'vieja', title: 'Llamar al contador', due: '2026-07-31T00:00:00.000Z', status: 'needsAction' }] })
  const r = await capacidad.ejecutar({ titulo: 'llamar al Contador', vence: '2026-07-31T09:00:00-03:00' }, ctxCon(g))
  assert.equal(r.ok, true)
  assert.equal(r.evidencia.duplicado, true)
  assert.equal(r.evidencia.tarea.id, 'vieja')
  assert.equal(g.creadas.length, 0)
})

test('mismo título con otro vencimiento NO es duplicado', async () => {
  const g = googleFalso({ tareas: [{ id: 'vieja', title: 'Llamar al contador', due: '2026-08-15T00:00:00.000Z' }] })
  const r = await capacidad.ejecutar({ titulo: 'Llamar al contador', vence: '2026-07-31T09:00:00-03:00' }, ctxCon(g))
  assert.equal(r.evidencia.duplicado, false)
  assert.equal(g.creadas.length, 1)
})

test('una lista que existe se resuelve por nombre; una que no existe se dice', async () => {
  const g = googleFalso({ listas: [{ id: 'L7', title: 'Obra Messina' }] })
  const ok = await capacidad.ejecutar({ titulo: 'Pedir el acta', lista: 'obra messina' }, ctxCon(g))
  assert.equal(g.creadas[0].tasklist, 'L7')
  assert.equal(ok.ok, true)
  const mal = await capacidad.ejecutar({ titulo: 'Pedir el acta', lista: 'Obra Inexistente' }, ctxCon(g))
  assert.equal(mal.error.codigo, ERROR.NO_ENCONTRADO)
  assert.match(mal.texto, /Obra Messina/)
})

test('sin id de Google no se dice "listo"', async () => {
  const g = googleFalso({ creada: { title: 'x' } })
  const r = await capacidad.ejecutar({ titulo: 'Algo' }, ctxCon(g))
  assert.equal(r.ok, false)
  assert.equal(r.error.codigo, ERROR.DEFINITIVO)
  assert.equal(r.evidencia, null)
})

test('OAuth vencido → google_sin_acceso; 429 → temporal', async () => {
  const sinAcceso = googleFalso({ falla: Object.assign(new Error('google api 403: insufficient scope'), { status: 403 }) })
  const a = await capacidad.ejecutar({ titulo: 'Algo' }, ctxCon(sinAcceso))
  assert.equal(a.error.codigo, ERROR.GOOGLE_SIN_ACCESO)
  assert.match(a.texto, /Conectar con Google/)
  const saturado = googleFalso({ falla: Object.assign(new Error('google api 429'), { status: 429 }) })
  const b = await capacidad.ejecutar({ titulo: 'Algo' }, ctxCon(saturado))
  assert.equal(b.error.codigo, ERROR.TEMPORAL)
  assert.equal(b.error.reintentable, true)
})

test('no se anota en las tareas de otro, y sin cuenta no se ofrece', async () => {
  const ajeno = googleFalso()
  ajeno[CUENTA] = { email: 'jorge@ecsas.com.ar', propia: false }
  const r = await capacidad.ejecutar({ titulo: 'Algo' }, ctxCon(ajeno))
  assert.equal(r.error.codigo, ERROR.GOOGLE_SIN_ACCESO)
  assert.equal(ajeno.creadas.length, 0)
  const off = await capacidad.habilitada({ identidad: { email: 'x@y.com' }, googleDeps: { tieneToken: async () => false } })
  assert.equal(off, false)
})
