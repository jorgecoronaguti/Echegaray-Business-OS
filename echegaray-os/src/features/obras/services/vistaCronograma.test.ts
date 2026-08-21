// LO QUE ATRAPAN: una vista que esconde trabajo, y un camino crítico inventado sobre una obra que
// no tiene ni una dependencia cargada.

import test from 'node:test'
import assert from 'node:assert/strict'
import { filasDeVista, esVista, hrefCronograma } from './vistaCronograma.ts'
import type { Cronograma, FilaCronograma } from './cronogramaMotor.ts'

const fila = (p: Partial<FilaCronograma>): FilaCronograma => ({
  actividad_id: 'x', nombre: 'x', tipo: 'tarea', actividad_padre_id: null, orden: 1,
  rubro: null, seccion: null, hh_plan: null, hh_real: null, avance_pct: null, dias_plan: null,
  inicio_plan: null, fin_plan: null, inicio_base: null, fin_base: null, inicio_real: null,
  fin_real: null, estado: null, cuadrilla_id: null, cuadrilla_prevista: null,
  cantidad_objetivo: null, unidad: null, dotacion_prevista: null, tope_frente: null,
  impedimentos_abiertos: null, duracion: null, inicio_calculado: null, fin_calculado: null,
  holgura: null, critica: false, sin_plan: false, hh_restantes: null,
  base_de_la_proyeccion: 'sin base', ...p,
})

const crono = (actividades: FilaCronograma[], criticas: string[] = [], sinSecuencia = true): Cronograma => ({
  obraId: 'o', vista: 'plan', origen: '2026-07-06', jornada: 8, sinSecuencia,
  finObra: null, finObraSiTodoEnParalelo: '2026-07-10', actividades, criticas,
  sinPlan: [], conflictos: [],
})

test('la vista de actividades no esconde ninguna fila', () => {
  const c = crono([fila({ actividad_id: 'a' }), fila({ actividad_id: 'b' })])
  assert.equal(filasDeVista(c, 'actividades').length, 2)
})

test('por frente arma una cabecera por grupo y deriva su ventana de las hijas', () => {
  const c = crono([
    fila({ actividad_id: 'a', seccion: 'Piso', inicio_calculado: '2026-07-08', fin_calculado: '2026-07-09', avance_pct: 100 }),
    fila({ actividad_id: 'b', seccion: 'Piso', inicio_calculado: '2026-07-06', fin_calculado: '2026-07-15', avance_pct: 0 }),
  ])
  const filas = filasDeVista(c, 'frente')
  assert.equal(filas.length, 3)
  const cab = filas[0]
  assert.equal(cab.nivel, 0)
  assert.equal(cab.nombre, 'Piso')
  assert.equal(cab.actividadId, null, 'un frente no se arrastra: no es una actividad')
  assert.equal(cab.inicio, '2026-07-06')
  assert.equal(cab.fin, '2026-07-15')
  assert.equal(cab.avancePct, 50)
})

test('SIN SECUENCIA la vista de camino crítico queda VACÍA — no se pinta la más larga', () => {
  const c = crono([fila({ actividad_id: 'a', duracion: 20 }), fila({ actividad_id: 'b', duracion: 2 })], [])
  assert.deepEqual(filasDeVista(c, 'critico'), [])
})

test('con secuencia, la vista crítica trae exactamente las que el motor marcó', () => {
  const c = crono(
    [fila({ actividad_id: 'a', critica: true }), fila({ actividad_id: 'b' })],
    ['a'], false,
  )
  const filas = filasDeVista(c, 'critico')
  assert.deepEqual(filas.map((f) => f.actividadId), ['a'])
})

test('la cabecera de frente sólo queda «sin plan» si TODAS sus hijas lo están', () => {
  const c = crono([
    fila({ actividad_id: 'a', seccion: 'P', sin_plan: true }),
    fila({ actividad_id: 'b', seccion: 'P', sin_plan: false, inicio_calculado: '2026-07-06' }),
  ])
  assert.equal(filasDeVista(c, 'frente')[0].sinPlan, false)
})

test('el impedimento de una hija sube al frente: es lo que hay que ver de un vistazo', () => {
  const c = crono([fila({ actividad_id: 'a', seccion: 'P', impedimentos_abiertos: 2 })])
  assert.equal(filasDeVista(c, 'frente')[0].tieneImpedimento, true)
})

test('esVista rechaza cualquier cosa que venga en la URL', () => {
  assert.equal(esVista('frente'), true)
  assert.equal(esVista('drop table'), false)
  assert.equal(esVista(undefined), false)
})

test('la URL no arrastra los valores por defecto: el link se puede compartir limpio', () => {
  const base = { vista: 'actividades', escala: 'semana', sel: null, mover: null, proyeccion: false } as const
  assert.equal(hrefCronograma('messina', base), '/obras/messina/cronograma')
  assert.equal(hrefCronograma('messina', base, { vista: 'critico' }), '/obras/messina/cronograma?vista=critico')
  assert.equal(
    hrefCronograma('messina', base, { sel: 'abc', mover: 3, escala: 'dia', proyeccion: true }),
    '/obras/messina/cronograma?escala=dia&sel=abc&mover=3&proyeccion=1',
  )
})

test('cancelar el arrastre saca sólo el movimiento y conserva la selección', () => {
  const base = { vista: 'frente', escala: 'mes', sel: 'abc', mover: 3, proyeccion: false } as const
  assert.equal(hrefCronograma('m', base, { mover: null }), '/obras/m/cronograma?vista=frente&escala=mes&sel=abc')
})
