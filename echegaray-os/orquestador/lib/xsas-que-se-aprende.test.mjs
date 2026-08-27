// LA AUSENCIA CON NOMBRE — que faltar un dato no se lea como un cero, y que faltar uno no tape
// lo que SÍ se puede aprender con lo que hay.

import test from 'node:test'
import assert from 'node:assert/strict'
import { queSePuedeAprender, resumirAprendizajePosible, METRICAS } from './xsas-que-se-aprende.mjs'

const conFechas = {
  es_trabajo: true, terminada: true, avance_pct: 100, plan_dias: 5, dias_real: 6,
  plan_cantidad: 100, cantidad_real: null, hh_real: null, dotacion_por_hh: 0, avance_sumado: false,
}

test('sin HH no hay productividad, pero con fechas SÍ hay duración', () => {
  // Es la frase entera de este módulo. Antes, una actividad así se contaba como «no aprende» y el
  // tablero decía «2 de 279»: la conclusión era que el circuito estaba roto, y era falsa.
  const d = queSePuedeAprender(conFechas)
  assert.equal(d.duracion.puede, true)
  assert.equal(d.rendimiento.puede, false)
  assert.ok(d.rendimiento.falta.includes('horas imputadas a la actividad'))
})

test('la cantidad ejecutada se deduce del cierre, y ahí el rendimiento sí puede', () => {
  const d = queSePuedeAprender({ ...conFechas, hh_real: 40 })
  assert.equal(d.rendimiento.puede, true, 'terminada con cantidad objetivo: lo ejecutado es el objetivo')
})

test('la dotación NO sale de quién figuraba asignado', () => {
  // `dotacion_real` de la vista cae a `obra_asignacion` cuando nadie imputó. Aprender de ahí sería
  // aprender de una planilla, no de la obra.
  const d = queSePuedeAprender({ ...conFechas, dotacion_real: 8, dotacion_por_hh: 0 })
  assert.equal(d.dotacion.puede, false)
  assert.ok(d.dotacion.falta[0].includes('horas imputadas'))
  assert.equal(queSePuedeAprender({ ...conFechas, dotacion_por_hh: 3 }).dotacion.puede, true)
})

test('el costo no es un faltante: es un dato que el OS no tiene de dónde sacar', () => {
  const d = queSePuedeAprender(conFechas)
  assert.equal(d.costo.puede, false)
  assert.equal(d.costo.noDisponible, true, 'no se confunde con algo que alguien se olvidó de cargar')
  assert.match(d.costo.porQue, /por obra/)
})

test('una fila que agrupa a otras no enseña NINGUNA de las cuatro', () => {
  const d = queSePuedeAprender({ ...conFechas, es_trabajo: false, hh_real: 40, dotacion_por_hh: 5 })
  for (const m of METRICAS) assert.equal(d[m].puede, false, `${m} no debería poder`)
  assert.match(d.duracion.falta[0], /agrupa a otras/)
})

test('un plan de cero días no es un plan', () => {
  assert.equal(queSePuedeAprender({ ...conFechas, plan_dias: 0 }).duracion.puede, false)
})

test('el resumen cuenta cada actividad UNA vez por métrica, en el requisito que hay que resolver primero', () => {
  // Contarla en cada faltante inflaría el total por encima de la cantidad de actividades y ningún
  // número sería interpretable.
  const filas = [conFechas, { ...conFechas, plan_dias: null, dias_real: null, terminada: false, avance_pct: 5 }]
  const r = resumirAprendizajePosible(filas)
  assert.equal(r.duracion.puede, 1)
  assert.equal(r.duracion.noPuede, 1)
  assert.equal(r.duracion.frenos.reduce((s, f) => s + f.actividades, 0), 1)
  assert.equal(r.rendimiento.noPuede, 2)
  assert.equal(r.costo.noDisponible, true)
  assert.equal(r.costo.puede, 0)
})
