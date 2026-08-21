import test from 'node:test'
import assert from 'node:assert/strict'
import { duracionDe, hhRestantes, origenDelCronograma } from './cronograma-obra.mjs'
import { CalendarioObra } from './calendario-obra.mjs'

test('la duración sale de dias_plan cuando alguien la fijó', () => {
  assert.equal(duracionDe({ dias_plan: 5, hh_plan: 999 }), 5, 'lo declarado a mano manda')
})

test('sin dias_plan, la duración sale de HH y capacidad ponderada', () => {
  assert.equal(duracionDe({ hh_plan: 240, capacidad_ponderada: 3.2 }, 8), 10)
  assert.equal(duracionDe({ hh_plan: 240, capacidad_ponderada: 4 }, 8), 8, 'más capacidad, menos días')
})

test('sin nadie asignado NO hay duración: es «sin plan», no cero días', () => {
  assert.equal(duracionDe({ hh_plan: 240 }), null)
  assert.equal(duracionDe({ hh_plan: 240, capacidad_ponderada: 0 }), null)
})

test('sin HH tampoco hay duración: no se inventa un día para que el grafo cierre', () => {
  assert.equal(duracionDe({ hh_plan: null, capacidad_ponderada: 3 }), null)
})

test('la dotación prevista sirve cuando todavía no hay cuadrilla armada', () => {
  assert.equal(duracionDe({ hh_plan: 160, dotacion_prevista: 2 }, 8), 10)
})

test('sin avance registrado, lo que falta sale del plan y se dice que sale del plan', () => {
  const r = hhRestantes({ hh_plan: 100, hh_real: 20, avance_pct: null })
  assert.deepEqual(r, { hh: 80, base: 'plan' })
})

test('con avance registrado, lo que falta sale del rendimiento OBSERVADO', () => {
  // 40% de avance consumiendo 60 HH: entera va a costar 150, faltan 90. El análisis decía 100.
  const r = hhRestantes({ hh_plan: 100, hh_real: 60, avance_pct: 40 })
  assert.equal(r.base, 'rendimiento observado')
  assert.equal(r.hh, 90)
  assert.ok(r.hh > 100 - 60, 'la proyección es PEOR que el plan, que es justo el aviso que importa')
})

test('una actividad terminada no proyecta HH', () => {
  assert.deepEqual(hhRestantes({ hh_plan: 100, hh_real: 130, avance_pct: 100 }), { hh: 0, base: 'terminada' })
})

test('con avance pero sin HH imputadas se proyecta por el plan, no por una división por cero', () => {
  const r = hhRestantes({ hh_plan: 100, hh_real: 0, avance_pct: 25 })
  assert.deepEqual(r, { hh: 75, base: 'plan' })
})

test('sin plan de HH no se proyecta nada: null, nunca 0', () => {
  assert.equal(hhRestantes({ hh_plan: null, hh_real: 0, avance_pct: null }).hh, null)
})

test('el origen sale de la obra, y sólo cae a hoy si no hay una sola fecha', () => {
  const cal = new CalendarioObra()
  assert.equal(
    origenDelCronograma({ fecha_inicio_plan: '2026-03-02' }, [{ inicio_plan: '2026-05-01' }], cal),
    '2026-03-02', 'la fecha de la obra gana')
  assert.equal(
    origenDelCronograma({ fecha_inicio_plan: null }, [{ inicio_plan: '2026-05-04' }, { inicio_real: '2026-04-06' }], cal),
    '2026-04-06', 'sin fecha de obra, la más temprana de las actividades')
  const hoy = new Date().toISOString().slice(0, 10)
  assert.equal(origenDelCronograma({ fecha_inicio_plan: null }, [{}], cal), cal.proximoHabil(hoy))
})

test('el origen acepta objetos Date, que es lo que devuelve el driver de Postgres', () => {
  const cal = new CalendarioObra()
  assert.equal(
    origenDelCronograma({ fecha_inicio_plan: new Date('2026-03-02T03:00:00Z') }, [], cal),
    '2026-03-02')
})

test('una actividad anterior al origen tiene índice negativo, no cero', () => {
  const cal = new CalendarioObra()
  assert.equal(cal.indice('2026-08-20', '2026-08-20'), 0)
  assert.equal(cal.indice('2026-08-20', '2026-08-13'), -5, 'cinco días hábiles antes')
  assert.equal(cal.fecha('2026-08-20', -5), '2026-08-13', 'y la vuelta cierra')
})
