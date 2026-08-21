// LO QUE ESTAS PRUEBAS ATRAPAN es que la pantalla dibuje una barra que miente.
//
// El motor de camino crítico ya tiene sus 18 pruebas. Acá se prueba el PUENTE WEB: que sin
// dependencias no se publique un fin de obra, que una actividad sin insumos no reciba una duración
// inventada, y que la proyección diga con qué base se calculó.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  armarCronograma, duracionDe, hhRestantes, origenDelCronograma, simularArrastre,
  type ActividadCruda, type InsumosCronograma,
} from './cronogramaMotor.ts'
import { CalendarioObra } from '../../../../orquestador/lib/calendario-obra.mjs'

const act = (p: Partial<ActividadCruda>): ActividadCruda => ({
  actividad_id: 'x', nombre: 'x', tipo: 'tarea', actividad_padre_id: null, orden: 1,
  rubro: null, seccion: null, hh_plan: null, hh_real: null, avance_pct: null, dias_plan: null,
  inicio_plan: null, fin_plan: null, inicio_base: null, fin_base: null, inicio_real: null,
  fin_real: null, estado: null, cuadrilla_id: null, cuadrilla_prevista: null,
  cantidad_objetivo: null, unidad: null, dotacion_prevista: null, tope_frente: null,
  impedimentos_abiertos: null, ...p,
})

const insumos = (actividades: ActividadCruda[], dependencias: InsumosCronograma['dependencias'] = []): InsumosCronograma => ({
  obra: { id: 'o', jornada_horas: 8, dias_habiles: [1, 2, 3, 4, 5], fecha_inicio_plan: '2026-07-06' },
  actividades, dependencias, noLaborables: [],
})

test('sin HH y sin días no hay duración: null, nunca 1 para que el grafo cierre', () => {
  assert.equal(duracionDe(act({})), null)
  assert.equal(duracionDe(act({ hh_plan: 40 })), null, 'HH sin nadie asignado tampoco alcanza')
  assert.equal(duracionDe(act({ hh_plan: 40, dotacion_prevista: 0 })), null, 'cero personas no es una capacidad')
})

test('la capacidad PONDERADA le gana a la cantidad de gente', () => {
  // 4 personas (2 of + 2 ay) son 3,2 de capacidad: 40 HH salen en 2 días, no en 2 con holgura.
  assert.equal(duracionDe(act({ hh_plan: 40, dotacion_prevista: 4, capacidad_ponderada: 3.2 })), 2)
  assert.equal(duracionDe(act({ hh_plan: 40, dotacion_prevista: 4 })), 2)
  assert.equal(duracionDe(act({ hh_plan: 60, dotacion_prevista: 4, capacidad_ponderada: 3.2 })), 3,
    'con 4 cabezas darían 2 días; con capacidad real, 3')
})

test('los días declarados mandan sobre el cálculo por HH', () => {
  assert.equal(duracionDe(act({ dias_plan: 5, hh_plan: 400, dotacion_prevista: 1 })), 5)
})

test('HH restantes: con avance registrado se usa el rendimiento OBSERVADO, y se dice', () => {
  // 40 % de avance con 60 HH consumidas: va a costar 150 enteras, faltan 90. El plan decía 100.
  const r = hhRestantes(act({ hh_plan: 100, hh_real: 60, avance_pct: 40 }))
  assert.equal(r.base, 'rendimiento observado')
  assert.equal(Math.round(r.hh!), 90)
})

test('HH restantes: sin HH cargadas es null, NUNCA 0 — «no sabemos» no es «no falta nada»', () => {
  const r = hhRestantes(act({ avance_pct: 30 }))
  assert.equal(r.hh, null)
  const s = hhRestantes(act({}))
  assert.equal(s.hh, null)
})

test('HH restantes: terminada es 0 de verdad, y lo dice con su propia base', () => {
  const r = hhRestantes(act({ hh_plan: 100, hh_real: 130, avance_pct: 100 }))
  assert.deepEqual(r, { hh: 0, base: 'terminada' })
})

test('el origen sale de la fecha más temprana de la obra, no de hoy', () => {
  const cal = new CalendarioObra([1, 2, 3, 4, 5], [])
  const o = origenDelCronograma(
    { id: 'o', jornada_horas: 8, dias_habiles: [1, 2, 3, 4, 5], fecha_inicio_plan: null },
    [act({ inicio_plan: '2026-07-08' }), act({ inicio_plan: '2026-07-06' })],
    cal, '2026-08-21',
  )
  assert.equal(o, '2026-07-06')
})

test('SIN UNA SOLA DEPENDENCIA NO HAY FIN DE OBRA — es una lista, no un cronograma', () => {
  const c = armarCronograma(insumos([
    act({ actividad_id: 'a', dias_plan: 3 }),
    act({ actividad_id: 'b', dias_plan: 5 }),
  ]))
  assert.equal(c.sinSecuencia, true)
  assert.equal(c.finObra, null, 'publicar un fin que nadie planificó es la barra que miente')
  assert.deepEqual(c.criticas, [], 'sin secuencia, «crítica» sólo querría decir «la más larga»')
  assert.equal(c.finObraSiTodoEnParalelo, '2026-07-10',
    'el dato existe y se puede mostrar, pero rotulado como lo que es')
})

test('con dependencias sí hay fin de obra, camino crítico y fin de semana respetado', () => {
  const c = armarCronograma(insumos(
    [act({ actividad_id: 'a', nombre: 'A', dias_plan: 3 }), act({ actividad_id: 'b', nombre: 'B', dias_plan: 5 })],
    [{ origen_id: 'a', destino_id: 'b', tipo: 'FS', lag_dias: 0 }],
  ))
  assert.equal(c.sinSecuencia, false)
  // A: lun 06 → mié 08. B: jue 09 + 5 hábiles → mié 15/07, saltando sábado y domingo.
  const b = c.actividades.find((x) => x.actividad_id === 'b')!
  assert.equal(b.inicio_calculado, '2026-07-09')
  assert.equal(b.fin_calculado, '2026-07-15')
  assert.equal(c.finObra, '2026-07-15')
  assert.deepEqual(c.criticas.sort(), ['a', 'b'])
})

test('una actividad sin insumos queda «sin plan» y no arrastra al resto a una fecha inventada', () => {
  const c = armarCronograma(insumos(
    [act({ actividad_id: 'a', dias_plan: 3 }), act({ actividad_id: 'b' })],
    [{ origen_id: 'a', destino_id: 'b', tipo: 'FS', lag_dias: 0 }],
  ))
  const b = c.actividades.find((x) => x.actividad_id === 'b')!
  assert.equal(b.sin_plan, true)
  assert.equal(b.inicio_calculado, null)
  assert.equal(b.fin_calculado, null)
  assert.ok(c.sinPlan.includes('b'))
})

test('las filas de resumen no entran al motor: agregan, no se planifican', () => {
  const c = armarCronograma(insumos([
    act({ actividad_id: 'r', tipo: 'resumen', dias_plan: 99 }),
    act({ actividad_id: 'a', dias_plan: 2 }),
  ]))
  assert.equal(c.actividades.length, 1)
  assert.equal(c.actividades[0].actividad_id, 'a')
})

test('la proyección acorta lo que ya se ejecutó, y el plan no se toca', () => {
  const filas = [act({ actividad_id: 'a', hh_plan: 80, dotacion_prevista: 1, avance_pct: 100, hh_real: 80 })]
  const plan = armarCronograma(insumos(filas), 'plan')
  const proy = armarCronograma(insumos(filas), 'proyeccion')
  assert.equal(plan.actividades[0].duracion, 10)
  // El motor no deja que nada mida menos de un día —un hito ocupa su día— así que lo terminado
  // colapsa a 1, no a 0. Lo que importa es que la proyección se DESPEGA del plan: 10 → 1.
  assert.equal(proy.actividades[0].duracion, 1, 'lo terminado deja de consumir calendario')
  assert.equal(proy.actividades[0].base_de_la_proyeccion, 'terminada')
})

test('sin HH la proyección declara «sin base» en vez de mostrar un número sin origen', () => {
  const c = armarCronograma(insumos([act({ actividad_id: 'a', dias_plan: 2 })]), 'proyeccion')
  assert.equal(c.actividades[0].base_de_la_proyeccion, 'sin base')
  assert.equal(c.actividades[0].hh_restantes, null)
})

test('mover una actividad dice QUÉ arrastra y cuánto corre el fin de obra', () => {
  const r = simularArrastre(insumos(
    [
      act({ actividad_id: 'a', nombre: 'A', dias_plan: 3 }),
      act({ actividad_id: 'b', nombre: 'B', dias_plan: 2 }),
      act({ actividad_id: 'c', nombre: 'C', dias_plan: 2 }),
    ],
    [
      { origen_id: 'a', destino_id: 'b', tipo: 'FS', lag_dias: 0 },
      { origen_id: 'b', destino_id: 'c', tipo: 'FS', lag_dias: 0 },
    ],
  ), 'a', 2)
  assert.equal(r.sinPlan, false)
  assert.deepEqual(r.arrastradas.map((x) => [x.nombre, x.dias]).sort(), [['B', 2], ['C', 2]])
  assert.equal(r.corrimientoFinObra, 2)
  assert.equal(r.finObraAntes, '2026-07-14')
  assert.equal(r.finObraDespues, '2026-07-16')
})

test('mover una actividad sin plan no inventa un arrastre', () => {
  const r = simularArrastre(insumos([act({ actividad_id: 'a' })]), 'a', 2)
  assert.equal(r.sinPlan, true)
  assert.deepEqual(r.arrastradas, [])
})

test('SIN SECUENCIA ninguna fila queda marcada como crítica', () => {
  // El KPI decía «sin secuencia» y dos filas llevaban la insignia «crítica» a dos centímetros:
  // el motor marca crítica a la que no tiene holgura, y sin dependencias ésa es la más larga.
  const c = armarCronograma(insumos([
    act({ actividad_id: 'larga', dias_plan: 20 }),
    act({ actividad_id: 'corta', dias_plan: 1 }),
  ]))
  assert.equal(c.actividades.every((a) => !a.critica), true)
})

test('con secuencia la insignia vuelve, y sólo en las que el motor marcó', () => {
  const c = armarCronograma(insumos(
    [
      act({ actividad_id: 'a', dias_plan: 3 }),
      act({ actividad_id: 'b', dias_plan: 5 }),
      act({ actividad_id: 'suelta', dias_plan: 1 }),
    ],
    [{ origen_id: 'a', destino_id: 'b', tipo: 'FS', lag_dias: 0 }],
  ))
  assert.deepEqual(
    c.actividades.filter((a) => a.critica).map((a) => a.actividad_id).sort(),
    ['a', 'b'],
  )
})
