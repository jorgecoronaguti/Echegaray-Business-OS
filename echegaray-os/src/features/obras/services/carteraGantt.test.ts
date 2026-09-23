import { test } from 'node:test'
import assert from 'node:assert/strict'
import { barrasDe, posicionEn, ventanaGantt, type ObraDeGantt } from './carteraGantt.ts'

const obra = (o: Partial<ObraDeGantt> = {}): ObraDeGantt => ({
  estado: 'activa', etapa: 'desarrollo', fecha_inicio_plan: null, fecha_fin_plan: null,
  forecast_fin: null, avance_pct: null, ...o,
})

test('la ventana del trimestre son seis meses alrededor de hoy, con el actual marcado', () => {
  const v = ventanaGantt('2026-09-23', 'trimestre')
  assert.deepEqual(v.meses.map((m) => m.label), ['Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'])
  assert.deepEqual(v.meses.map((m) => m.actual), [false, false, true, false, false, false])
  assert.equal(v.desdeMs, Date.UTC(2026, 6, 1))
  assert.equal(v.hastaMs, Date.UTC(2027, 0, 1))
  // HOY cae dentro del tercer mes: entre el 33 % y el 50 % del lienzo.
  const hoy = posicionEn(v, '2026-09-23')
  assert.ok(hoy > 33 && hoy < 50, String(hoy))
})

test('la ventana cruza el año sin perder meses', () => {
  const v = ventanaGantt('2026-01-10', 'telefono')
  assert.deepEqual(v.meses.map((m) => m.label), ['Ago', 'Sep', 'Oct', 'Nov', 'Dic', 'Ene', 'Feb'])
  assert.equal(v.desdeMs, Date.UTC(2025, 7, 1))
})

test('sin las dos fechas de plan no hay barra: ni inventada ni de tres píxeles', () => {
  const v = ventanaGantt('2026-09-23', 'trimestre')
  assert.equal(barrasDe(obra({ fecha_inicio_plan: '2026-08-01' }), v), null)
  assert.equal(barrasDe(obra({ fecha_fin_plan: '2026-08-01' }), v), null)
})

test('el plan, lo ejecutado y la proyección salen del mismo forecast que la columna PLAZO', () => {
  const v = ventanaGantt('2026-09-23', 'trimestre')
  const b = barrasDe(obra({
    fecha_inicio_plan: '2026-07-01', fecha_fin_plan: '2026-09-05', forecast_fin: '2026-09-21', avance_pct: 50,
  }), v)!
  assert.equal(b.plan.left, 0)
  assert.ok(Math.abs(b.ejecutado!.width - b.plan.width / 2) < 0.01)
  assert.ok(b.proyeccion && b.proyeccion.left > b.plan.left + b.plan.width - 0.01)
  assert.equal(b.rotuloAtraso, '+16 d')
  // 16 días > umbral de 10: el estado es «· atraso» y la barra va en rojo.
  assert.equal(b.tono, 'neg')
  assert.equal(b.fueraDeVentana, false)
})

test('el tono sigue al estado: ámbar con pocos días, azul en fecha, verde al 100 %', () => {
  const v = ventanaGantt('2026-09-23', 'trimestre')
  const base = { fecha_inicio_plan: '2026-08-01', fecha_fin_plan: '2026-10-05' }
  assert.equal(barrasDe(obra({ ...base, forecast_fin: '2026-10-08', avance_pct: 30 }), v)!.tono, 'warn')
  assert.equal(barrasDe(obra({ ...base, forecast_fin: '2026-10-05', avance_pct: 30 }), v)!.tono, 'curso')
  assert.equal(barrasDe(obra({ ...base, forecast_fin: '2026-10-05', avance_pct: 100 }), v)!.tono, 'pos')
  assert.equal(barrasDe(obra({ ...base, forecast_fin: '2026-10-05', avance_pct: 30 }), v)!.proyeccion, null)
  assert.equal(barrasDe(obra({ ...base, avance_pct: null }), v)!.ejecutado, null)
})

test('una obra fuera de la ventana se recorta a nada y lo dice', () => {
  const v = ventanaGantt('2026-09-23', 'mes')
  const b = barrasDe(obra({ fecha_inicio_plan: '2026-01-01', fecha_fin_plan: '2026-03-01', avance_pct: 10 }), v)!
  assert.equal(b.fueraDeVentana, true)
  assert.equal(b.plan.width, 0)
  // Una que empieza antes y termina adentro se recorta en el borde izquierdo.
  const c = barrasDe(obra({ fecha_inicio_plan: '2026-01-01', fecha_fin_plan: '2026-09-15', avance_pct: 10 }), v)!
  assert.equal(c.fueraDeVentana, false)
  assert.equal(c.plan.left, 0)
  assert.ok(c.plan.width > 0 && c.plan.width < 100)
})
