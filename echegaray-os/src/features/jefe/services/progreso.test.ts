import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  avanceEsperado, avancePorFrente, causasDeAtraso, finProyectado, hhDeLaObra,
} from './progreso.ts'
import type { ActividadDelJefe, Impedimento } from './jefeService.ts'

const HOY = '2026-08-24'

function tarea(p: Partial<ActividadDelJefe>): ActividadDelJefe {
  return {
    actividad_id: 'a1', obra_id: 'o1', nombre: 'Tarea', tipo: 'tarea', rubro: null,
    metodo_avance: 'partes', avance_pct: null, origen_avance: null, estado_operativo: 'en_curso',
    impedimentos_abiertos: 0, n_pasos: 0, n_pasos_hechos: 0, cuadrilla_prevista: null,
    hh_plan: null, hh_real: null, inicio_plan: null, fin_plan: null, inicio_real: null,
    fin_real: null, forecast_fin: null, estado_fecha: null, ultimo_parte: null, unidad: null,
    cantidad_objetivo: null, cantidad_ejecutada: null,
    ...p,
  }
}

test('UNA TAREA SIN FECHAS DE PLAN NO ENTRA AL ESPERADO — ni con 0 ni con 100', () => {
  // El defecto que atrapa: contarla con 0 afirma que está atrasada; con 100, que ya debería estar
  // hecha. Las dos son invenciones, y la de 0 hunde el esperado de toda la obra.
  const e = avanceEsperado([
    { avance_pct: 50, hh_plan: 10, inicio_plan: '2026-08-14', fin_plan: '2026-08-24' },
    { avance_pct: null, hh_plan: 10, inicio_plan: null, fin_plan: null },
  ], HOY)
  assert.equal(e.pct, 100)
  assert.equal(e.conPlan, 1)
  assert.equal(e.total, 2)
})

test('SIN NINGUNA TAREA PLANIFICADA EL ESPERADO ES NULL, NUNCA CERO', () => {
  const e = avanceEsperado([{ avance_pct: 30, hh_plan: 8, inicio_plan: null, fin_plan: null }], HOY)
  assert.equal(e.pct, null)
  assert.equal(e.conPlan, 0)
})

test('EL ESPERADO SE QUEDA ENTRE 0 Y 100 — antes de arrancar y después del fin', () => {
  // El defecto que atrapa: la regla de tres sin topes da negativos antes del inicio y más de 100
  // después del fin, y esos dos valores contaminan el promedio de toda la obra.
  const futura = avanceEsperado(
    [{ avance_pct: null, hh_plan: 1, inicio_plan: '2026-09-01', fin_plan: '2026-09-10' }], HOY)
  assert.equal(futura.pct, 0)
  const vencida = avanceEsperado(
    [{ avance_pct: null, hh_plan: 1, inicio_plan: '2026-07-01', fin_plan: '2026-07-10' }], HOY)
  assert.equal(vencida.pct, 100)
})

test('UNA TAREA DE UN SOLO DÍA NO DIVIDE POR CERO', () => {
  // El defecto que atrapa: `(hoy-inicio)/(fin-inicio)` con inicio == fin devuelve NaN, y un NaN
  // ponderado deja el esperado de la obra entera en NaN sin que nada falle.
  const e = avanceEsperado(
    [{ avance_pct: null, hh_plan: 1, inicio_plan: HOY, fin_plan: HOY }], HOY)
  assert.equal(e.pct, 100)
})

test('EL ESPERADO SE PONDERA POR HH PLAN, igual que el avance real', () => {
  // El defecto que atrapa: promediar simple de un lado y ponderar del otro hace que la diferencia
  // entre real y esperado mida el método de cálculo, no la obra.
  const e = avanceEsperado([
    { avance_pct: null, hh_plan: 90, inicio_plan: '2026-09-01', fin_plan: '2026-09-10' },
    { avance_pct: null, hh_plan: 10, inicio_plan: '2026-07-01', fin_plan: '2026-07-10' },
  ], HOY)
  assert.equal(e.pct, 10)
})

test('EL DESVÍO DE HH SE MIDE SOBRE LO TERMINADO, no sobre lo que está a medio hacer', () => {
  // El defecto que atrapa: una tarea en curso siempre lleva menos horas que su plan, y contarla
  // publica un ahorro que no existe — el número más peligroso de la pantalla.
  const hh = hhDeLaObra([
    tarea({ estado_operativo: 'hecha', hh_plan: 100, hh_real: 130 }),
    tarea({ actividad_id: 'a2', estado_operativo: 'en_curso', hh_plan: 200, hh_real: 20 }),
  ])
  assert.equal(hh.desvioCerrado, 30)
  assert.equal(hh.terminadas, 1)
  assert.equal(hh.real, 150)
  assert.equal(hh.plan, 300)
})

test('SIN NINGUNA TAREA CERRADA NO HAY DESVÍO: null, no 0', () => {
  const hh = hhDeLaObra([tarea({ estado_operativo: 'en_curso', hh_plan: 10, hh_real: 3 })])
  assert.equal(hh.desvioCerrado, null)
})

test('EL FIN PROYECTADO MIRA LAS TAREAS ABIERTAS — una terminada no fija el fin de la obra', () => {
  // El defecto que atrapa: tomar el máximo de TODAS deja el fin de obra clavado en la proyección
  // vieja de una tarea que ya se cerró.
  const f = finProyectado([
    tarea({ estado_operativo: 'hecha', forecast_fin: '2026-12-01' }),
    tarea({ actividad_id: 'a2', estado_operativo: 'en_curso', forecast_fin: '2026-09-09' }),
  ], '2026-08-24')
  assert.equal(f.fecha, '2026-09-09')
  assert.equal(f.dias, 16)
})

test('SIN FIN DE PLAN NO SE PUBLICAN DÍAS DE ATRASO', () => {
  const f = finProyectado([tarea({ forecast_fin: '2026-09-09' })], null)
  assert.equal(f.fecha, '2026-09-09')
  assert.equal(f.dias, null)
})

test('EL DELTA DEL FRENTE ES NULL SI FALTA UNA DE LAS DOS PUNTAS', () => {
  // El defecto que atrapa: restar contra un esperado inexistente publica el avance real como si
  // fuera un desvío, y un frente sin plan aparece «en fecha».
  const frentes = new Map([['a1', { id: 'f1', nombre: 'Eje 1–4' }]])
  const g = avancePorFrente([tarea({ avance_pct: 40, hh_plan: 10 })], frentes, HOY)
  assert.equal(g.length, 1)
  assert.equal(g[0].nombre, 'Eje 1–4')
  assert.equal(g[0].pct, 40)
  assert.equal(g[0].esperado, null)
  assert.equal(g[0].delta, null)
})

test('EL FRENTE COMPARA REAL CONTRA ESPERADO EN PUNTOS', () => {
  const frentes = new Map([['a1', { id: 'f1', nombre: 'Fundaciones' }]])
  const g = avancePorFrente(
    [tarea({ avance_pct: 62, hh_plan: 10, inicio_plan: '2026-07-01', fin_plan: '2026-07-10' })],
    frentes, HOY)
  assert.equal(g[0].pct, 62)
  assert.equal(g[0].esperado, 100)
  assert.equal(g[0].delta, -38)
})

test('LOS CONTENEDORES NO SON UN FRENTE MÁS: no entran a la lista', () => {
  const g = avancePorFrente([tarea({ tipo: 'resumen', avance_pct: 10 })], new Map(), HOY)
  assert.equal(g.length, 0)
})

function imp(p: Partial<Impedimento>): Impedimento {
  return {
    id: 'i1', descripcion: null, tipo: null, actividad_id: null, creado_en: null,
    responsable: null, fecha_necesidad: null, fecha_compromiso: null, ...p,
  }
}

test('DOS IMPEDIMENTOS SOBRE LA MISMA TAREA SON DOS CAUSAS Y UNA TAREA FRENADA', () => {
  // El defecto que atrapa: contar tareas con la longitud de la lista duplica el trabajo detenido y
  // convierte una discusión sobre un frente en «dos frentes parados».
  const c = causasDeAtraso([
    imp({ id: 'i1', tipo: 'material', actividad_id: 'a1', creado_en: '2026-08-20T10:00:00Z' }),
    imp({ id: 'i2', tipo: 'material', actividad_id: 'a1', creado_en: '2026-08-22T10:00:00Z' }),
    imp({ id: 'i3', tipo: null, actividad_id: 'a2' }),
  ], HOY)
  assert.equal(c.length, 2)
  assert.equal(c[0].tipo, 'material')
  assert.equal(c[0].n, 2)
  assert.equal(c[0].tareas, 1)
  assert.equal(c[0].diasElMasViejo, 4)
  assert.equal(c[1].tipo, 'sin clasificar')
  assert.equal(c[1].diasElMasViejo, null)
})
