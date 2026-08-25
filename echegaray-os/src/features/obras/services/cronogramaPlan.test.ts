import test from 'node:test'
import assert from 'node:assert/strict'
import { desvioProyectado, filasDelPlan, pares, resumenDelCronograma } from './cronogramaPlan.ts'
import type { Actividad } from '../types/index.ts'

// LO QUE ESTAS PRUEBAS SOSTIENEN — las tres mentiras que la pantalla 07 puede decir sin dar error:
//
//   · un desvío leído de `desvio_plan_dias`, que da 0 en las once obras vivas porque el sellado
//     copió el plan (un control validado contra la misma información que produce);
//   · un rubro dibujado con las fechas guardadas en su fila de resumen, que están podridas;
//   · una ventana calculada sólo sobre el plan, que deja la línea base fuera del lienzo — o sea,
//     esconde justo el desvío que la pantalla existe para mostrar.

const act = (p: Partial<Actividad> & { id: string; nombre: string }): Actividad => ({
  obra_id: 'o', clave: p.id, seccion: null, codigo: null, codigo_padre: null,
  tipo: 'tarea', orden: 0, inicio_plan: null, fin_plan: null, dias_plan: null,
  inicio_real: null, fin_real: null, dias_real: null, inicio_base: null, fin_base: null,
  pct: null, estado: 'pendiente', cuadrilla: null, comentario: null, editado_a_mano: false,
  fuente_pestana: null, sellada_en: null, responsable_id: null, hh_plan: null, archivada: false,
  creada_en_web: true, rubro: null, unidad: null, cantidad_objetivo: null, metodo_avance: 'manual',
  cuadrilla_id: null, cuadrilla_prevista: null, partida_codigo: null, partida_cantidad: null,
  cantidad_ejecutada: null, n_partes: 0, ultimo_parte: null, hh_real: null, hh_extra: null,
  n_imputaciones: 0, impedimentos_abiertos: 0, avance_pct: null, origen_avance: null,
  estado_operativo: 'pendiente', productividad: null, consumo_hh_pct: null,
  inicio_real_declarado: null, fin_real_declarado: null, origen_inicio_real: null,
  origen_fin_real: null, forecast_fin: null, base_del_forecast: null, dias_restantes: null,
  tiene_fecha: true, tiene_fecha_plan: true, estado_fecha: 'planificada',
  desvio_plan_dias: null, desvio_forecast_dias: null,
  actividad_padre_id: null, n_tareas: 0, n_tareas_hechas: 0, n_pedidos: 0,
  ...p,
})

const fila = (filas: ReturnType<typeof filasDelPlan>, nombre: string) =>
  filas.find((f) => f.nombre === nombre)!

test('el desvío sale de forecast_fin − fin_plan, no de desvio_plan_dias', () => {
  // El caso real: el sellado copió el plan, así que `desvio_plan_dias` dice 0 mientras el ritmo
  // medido proyecta cinco días de atraso. La columna tiene que decir +5.
  const [, a] = filasDelPlan([act({
    id: 'a', nombre: 'Viga', seccion: 'Fundaciones',
    inicio_plan: '2026-08-03', fin_plan: '2026-08-12', fin_base: '2026-08-12',
    desvio_plan_dias: 0, forecast_fin: '2026-08-17',
  })])
  assert.equal(a.desvio, 5)
})

test('sin forecast no hay desvío: null, nunca cero', () => {
  const [, a] = filasDelPlan([act({
    id: 'a', nombre: 'Viga', seccion: 'Fundaciones', inicio_plan: '2026-08-03', fin_plan: '2026-08-12',
  })])
  assert.equal(a.desvio, null)
  assert.equal(desvioProyectado('2026-08-12', null), null)
  assert.equal(desvioProyectado(null, '2026-08-12'), null)
})

test('terminar antes del plan conserva el signo negativo', () => {
  assert.equal(desvioProyectado('2026-08-12', '2026-08-09'), -3)
})

test('el rubro se queda con el PEOR desvío de sus hijas, no con el promedio', () => {
  const filas = filasDelPlan([
    act({ id: 'a', nombre: 'Losa', seccion: 'Estructura', fin_plan: '2026-08-10', forecast_fin: '2026-08-25' }),
    act({ id: 'b', nombre: 'Columna', seccion: 'Estructura', fin_plan: '2026-08-10', forecast_fin: '2026-08-10' }),
  ])
  assert.equal(fila(filas, 'Estructura').desvio, 15)
})

test('el rubro deriva sus fechas de las hijas e IGNORA las guardadas en su fila de resumen', () => {
  const filas = filasDelPlan([
    act({ id: 'r', nombre: 'Estructura', tipo: 'resumen', inicio_plan: '2026-01-01', fin_plan: '2026-12-31' }),
    act({ id: 'a', nombre: 'Losa', seccion: 'Estructura', inicio_plan: '2026-08-03', fin_plan: '2026-08-10' }),
    act({ id: 'b', nombre: 'Columna', seccion: 'Estructura', inicio_plan: '2026-08-06', fin_plan: '2026-08-20' }),
  ])
  const r = fila(filas, 'Estructura')
  assert.equal(r.nivel, 0)
  assert.equal(r.inicio, '2026-08-03')
  assert.equal(r.fin, '2026-08-20')
  assert.equal(r.nHijas, 2)
})

test('el forecast del rubro es el mayor de sus hijas', () => {
  const filas = filasDelPlan([
    act({ id: 'a', nombre: 'Losa', seccion: 'Estructura', fin_plan: '2026-08-10', forecast_fin: '2026-08-12' }),
    act({ id: 'b', nombre: 'Columna', seccion: 'Estructura', fin_plan: '2026-08-10', forecast_fin: '2026-08-30' }),
  ])
  assert.equal(fila(filas, 'Estructura').finForecast, '2026-08-30')
})

test('la ventana abarca también la línea base y la proyección', () => {
  const filas = filasDelPlan([act({
    id: 'a', nombre: 'Losa', seccion: 'Estructura',
    inicio_plan: '2026-08-10', fin_plan: '2026-08-20',
    inicio_base: '2026-08-01', fin_base: '2026-08-15', forecast_fin: '2026-09-05',
  })])
  const p = pares(filas)
  assert.ok(p.some((x) => x.inicio === '2026-08-01'), 'la línea base quedó fuera de la ventana')
  assert.ok(p.some((x) => x.fin === '2026-09-05'), 'la proyección quedó fuera de la ventana')
})

test('una actividad sin ninguna fecha de plan queda marcada, no dibujada en cero', () => {
  const [, a] = filasDelPlan([act({ id: 'a', nombre: 'Losa', seccion: 'Estructura' })])
  assert.equal(a.sinPlan, true)
  assert.equal(a.inicio, null)
  assert.equal(a.fin, null)
})

test('el resumen cuenta actividades y no rubros, y publica el denominador', () => {
  const filas = filasDelPlan([
    act({ id: 'a', nombre: 'Losa', seccion: 'Estructura', fin_plan: '2026-08-10', forecast_fin: '2026-08-14' }),
    act({ id: 'b', nombre: 'Columna', seccion: 'Estructura', fin_plan: '2026-08-12', forecast_fin: '2026-08-12' }),
    act({ id: 'c', nombre: 'Pintura', seccion: 'Terminaciones' }),
  ])
  const r = resumenDelCronograma(filas)
  assert.equal(r.actividades, 3)
  // El defecto que atrapa: contar la cabecera del rubro, que hereda el atraso de su hija y lo
  // sumaría de nuevo — dos atrasadas donde hay una.
  assert.equal(r.atrasadas, 1)
  assert.equal(r.medidas, 2)
  assert.equal(r.sinPlan, 1)
  assert.equal(r.finPlan, '2026-08-12')
  assert.equal(r.finForecast, '2026-08-14')
  assert.equal(r.desvioDelFin, 2)
})

test('sin línea base sellada el resumen lo dice con null, no con la fecha del plan', () => {
  const filas = filasDelPlan([
    act({ id: 'a', nombre: 'Losa', seccion: 'Estructura', fin_plan: '2026-08-10' }),
  ])
  assert.equal(resumenDelCronograma(filas).finBase, null)
})
