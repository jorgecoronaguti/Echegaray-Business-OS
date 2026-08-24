import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clasificar, dm, esDeHoy, lecturaDeEstado, lecturaDeFecha, ordenar, restante } from './tareas.ts'
import type { MiTarea } from '../types/index.ts'

const HOY = '2026-08-20'
const t = (p: Partial<MiTarea>): MiTarea => ({
  id: p.id ?? 'x', obra_id: 'o', obra: 'Obra', codigo: null, nombre: 'Tarea', seccion: null,
  estado: 'pendiente', pct: null, inicio_plan: null, fin_plan: null, unidad: null,
  cantidad_objetivo: null, metodo_avance: null, comentario: null, impedimentos: 0, ...p,
})

test('SIN PLAN NO ES DE HOY — es lo que llena la pantalla de basura', () => {
  // El defecto que atrapa: 212 de 349 actividades no tienen fecha. Si «sin fecha» cayera en Hoy, el
  // lunes a la mañana la pantalla mostraría doscientas tareas y ninguna sería la del muro sur.
  const sinPlan = t({ id: 'a' })
  assert.equal(esDeHoy(sinPlan, HOY), false)
  assert.equal(clasificar([sinPlan], HOY).proximas.length, 1)
  assert.equal(lecturaDeFecha(sinPlan, HOY).texto, 'sin plan')
})

test('en curso es de hoy aunque no tenga fecha; y una vencida abierta también', () => {
  assert.equal(esDeHoy(t({ estado: 'en_curso' }), HOY), true)
  assert.equal(esDeHoy(t({ inicio_plan: '2026-08-01', fin_plan: '2026-08-15' }), HOY), true)
  assert.equal(esDeHoy(t({ inicio_plan: '2026-09-01' }), HOY), false)
})

test('el estado manda sobre el porcentaje', () => {
  // Una actividad marcada `hecha` al 90% la cerró alguien a propósito; una al 100% que nadie cerró
  // sigue abierta. Derivar el estado del pct pisaría las dos decisiones.
  assert.equal(lecturaDeEstado(t({ estado: 'hecha', pct: 90 })).texto, 'Completada')
  assert.equal(lecturaDeEstado(t({ estado: 'en_curso', pct: 100 })).texto, 'En curso')
})

test('lo bloqueado va primero: es lo único que alguien puede destrabar', () => {
  const orden = ordenar([
    t({ id: 'sin-fecha' }),
    t({ id: 'vence-lejos', fin_plan: '2026-12-01' }),
    t({ id: 'bloqueada', fin_plan: '2026-12-31', impedimentos: 1 }),
    t({ id: 'vence-pronto', fin_plan: '2026-08-21' }),
  ]).map((x) => x.id)
  assert.deepEqual(orden, ['bloqueada', 'vence-pronto', 'vence-lejos', 'sin-fecha'])
})

test('vencida, vence hoy y vence después se dicen distinto', () => {
  assert.equal(lecturaDeFecha(t({ fin_plan: '2026-08-19' }), HOY).vencida, true)
  assert.equal(lecturaDeFecha(t({ fin_plan: HOY }), HOY).texto, 'vence hoy')
  assert.equal(lecturaDeFecha(t({ fin_plan: '2026-08-25' }), HOY).texto, 'vence 25/08')
})

test('el año sólo aparece cuando no es el corriente', () => {
  assert.equal(dm('2026-08-25', HOY), '25/08')
  assert.equal(dm('2025-08-25', HOY), '25/08/2025')
})

test('SIN MEDICIÓN NO SE ESCRIBE UN RESTANTE — ni 0 ni el objetivo entero', () => {
  // El defecto que atrapa: calcular el restante con una sola punta produce un número creíble y
  // falso. Sin objetivo daría «0,00 restantes» (la tarea parecería terminada) y sin porcentaje
  // daría el objetivo completo (parecería no arrancada). Las dos se leen como un dato medido.
  assert.equal(restante({ pct: 74, cantidad_objetivo: null, unidad: 'm²' }), null)
  assert.equal(restante({ pct: null, cantidad_objetivo: 96, unidad: 'm²' }), null)
  assert.equal(restante({ pct: null, cantidad_objetivo: null, unidad: null }), null)
})

test('con las dos puntas el restante sale en la unidad de la tarea, y el 0 sí es un dato', () => {
  assert.equal(restante({ pct: 74, cantidad_objetivo: 96, unidad: 'm²' }), '24,96 m² restantes')
  assert.equal(restante({ pct: 100, cantidad_objetivo: 96, unidad: 'm²' }), '0,00 m² restantes')
  assert.equal(restante({ pct: 40, cantidad_objetivo: 1.083, unidad: 'm³' }), '0,65 m³ restantes')
  assert.equal(restante({ pct: 50, cantidad_objetivo: 10, unidad: null }), '5,00 restantes')
})
