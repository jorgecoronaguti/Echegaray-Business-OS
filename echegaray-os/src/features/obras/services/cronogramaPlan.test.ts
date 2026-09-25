import test from 'node:test'
import assert from 'node:assert/strict'
import { arrancaEnElInicio, ladoFuera, desvioProyectado, filasDelPlan, pares, resumenDelCronograma } from './cronogramaPlan.ts'
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

// ═══ DISEÑO ERP OBRAS · 05 / M07 / C06 / MC7 ═══
import {
  bajadaDuracion, cambiosDeFechas, conFechas, diasHabilesDelEditor, diasHabilesEntre, indiceDe, mesesDeVentana,
  motivoSellarApagado, moverExtremo, posPct, rotuloColumna, semanasDe, textoPrecedencia, tonoDeFila, tramoVista,
  ventanaVista,
} from './cronogramaPlan.ts'

const HOY = '2026-09-07'
const filaDe = (p: Partial<Actividad> & { id: string; nombre: string }) => filasDelPlan([act(p)])[1]

test('el tono de la barra se deriva: plan, ejecutado, atrasada (vencida o proyectada), técnico', () => {
  assert.equal(tonoDeFila(filaDe({ id: 'a', nombre: 'a', inicio_plan: '2026-09-10', fin_plan: '2026-09-12' }), HOY), 'plan')
  assert.equal(tonoDeFila(filaDe({ id: 'a', nombre: 'a', inicio_plan: '2026-09-01', fin_plan: '2026-09-12', avance_pct: 40 }), HOY), 'ejecutado')
  assert.equal(tonoDeFila(filaDe({ id: 'a', nombre: 'a', inicio_plan: '2026-08-20', fin_plan: '2026-09-01', avance_pct: 60 }), HOY), 'atrasada')
  assert.equal(tonoDeFila(filaDe({ id: 'a', nombre: 'a', inicio_plan: '2026-09-01', fin_plan: '2026-09-12', forecast_fin: '2026-09-20', avance_pct: 10 }), HOY), 'atrasada')
  assert.equal(tonoDeFila(filaDe({ id: 'a', nombre: 'a', inicio_plan: '2026-08-20', fin_plan: '2026-09-01', avance_pct: 100 }), HOY), 'ejecutado')
  assert.equal(tonoDeFila(filaDe({ id: 'a', nombre: 'a', inicio_plan: '2026-08-20', fin_plan: '2026-09-01', tiempo_tecnico: true }), HOY), 'tecnico')
})

test('la ventana por semana arranca el lunes, rotula «17 ago» y marca la columna de hoy', () => {
  const v = ventanaVista([{ inicio: '2026-08-19', fin: '2026-09-24' }], 'semana', HOY)!
  assert.equal(v.desde, '2026-08-17')
  assert.deepEqual(v.columnas.slice(0, 3).map((c) => c.rotulo), ['17 ago', '24 ago', '31 ago'])
  assert.equal(v.columnas.find((c) => c.esHoy)?.rotulo, '7 sep')
  assert.equal(v.columnas.length, 6)
  assert.equal(rotuloColumna('2026-07-01', 'trimestre'), 'jul–sep')
  assert.equal(mesesDeVentana(v), 'ago · sep')
  const t = tramoVista(v, '2026-08-24', '2026-08-30')
  assert.ok(t && Math.abs(t.izqPct - (7 / 42) * 100) < 0.01 && Math.abs(t.anchoPct - (7 / 42) * 100) < 0.01)
  assert.equal(posPct(v, '2026-08-17'), 0)
  assert.equal(posPct(v, '2026-12-01'), null)
  assert.equal(ventanaVista([{ inicio: null, fin: null }], 'mes', HOY), null)
  assert.equal(ventanaVista([{ inicio: '2026-09-01', fin: '2026-09-02' }], 'mes', HOY)!.columnas.length, 3, 'mínimo tres períodos')
})

test('el editor tiene al menos 21 días hábiles DE LA OBRA, con sus semanas rotuladas', () => {
  const dias = diasHabilesDelEditor([{ inicio: '2026-08-26', fin: '2026-09-02' }], HOY, [1, 2, 3, 4, 5], new Set(['2026-08-31']))
  assert.equal(dias[0], '2026-08-24')
  assert.equal(dias.length, 21)
  assert.equal(dias.includes('2026-08-31'), false)
  assert.equal(dias.includes('2026-08-29'), false, 'un sábado no es columna en una obra de lunes a viernes')
  assert.deepEqual(semanasDe(dias).slice(0, 2), [{ rotulo: 'Sem 24/08', desdeIdx: 0, n: 5 }, { rotulo: 'Sem 31/08', desdeIdx: 5, n: 4 }])
  assert.equal(indiceDe(dias, '2026-08-29', 'inicio'), 5, 'un sábado como inicio cae al hábil siguiente (el 31/08 es feriado: 01/09)')
  assert.equal(indiceDe(dias, '2026-08-29', 'fin'), 4, 'un sábado como fin cae al hábil anterior')
  assert.equal(diasHabilesEntre(dias, '2026-08-24', '2026-08-28'), 5)
  assert.equal(diasHabilesEntre(dias, null, '2026-08-28'), null)
})

test('mover un extremo cuenta en días hábiles y no cruza el otro extremo', () => {
  const dias = diasHabilesDelEditor([{ inicio: '2026-08-24', fin: '2026-09-11' }], HOY, [1, 2, 3, 4, 5], new Set())
  const a = { inicio: '2026-08-24', fin: '2026-08-28' }
  assert.deepEqual(moverExtremo(dias, a, 'fin', 2), { inicio: '2026-08-24', fin: '2026-09-01' })
  assert.deepEqual(moverExtremo(dias, a, 'inicio', 6), { inicio: '2026-09-01', fin: '2026-09-01' })
  assert.deepEqual(moverExtremo(dias, a, 'barra', 5), { inicio: '2026-08-31', fin: '2026-09-04' })
  assert.deepEqual(moverExtremo(dias, { inicio: null, fin: null }, 'barra', 3), { inicio: '2026-08-27', fin: '2026-08-27' })
  assert.deepEqual(moverExtremo(dias, a, 'inicio', -9), { inicio: '2026-08-24', fin: '2026-08-28' })
})

test('sellar se apaga con el motivo del diseño; con fechas se cuenta «14 de 17»', () => {
  const filas = filasDelPlan([
    act({ id: 'a', nombre: 'a', seccion: 'S', inicio_plan: '2026-09-01', fin_plan: '2026-09-02' }),
    act({ id: 'b', nombre: 'b', seccion: 'S' }),
    act({ id: 'c', nombre: 'c', seccion: 'S' }),
  ])
  assert.equal(motivoSellarApagado(filas), 'Sellar está apagado: 2 ítems sin fechas.')
  assert.deepEqual(conFechas(filas), { con: 1, total: 3 })
  assert.equal(motivoSellarApagado(filas.filter((f) => f.nombre !== 'b' && f.nombre !== 'c')), null)
  assert.equal(textoPrecedencia(filas, [{ origen_id: 'a', destino_id: 'b' }]), '2 de 3 actividades con precedencia cargada. El resto solo tiene fechas.')
})

test('la bajada del MC7 y sólo lo cambiado viaja a la base', () => {
  const dias = diasHabilesDelEditor([{ inicio: '2026-08-24', fin: '2026-09-11' }], HOY, [1, 2, 3, 4, 5], new Set())
  const filas = filasDelPlan([
    act({ id: 'a', nombre: 'Demolición', seccion: 'S', inicio_plan: '2026-08-24', fin_plan: '2026-08-28' }),
    act({ id: 'b', nombre: 'Curado', seccion: 'S', inicio_plan: '2026-09-07', fin_plan: '2026-09-07', tiempo_tecnico: true }),
    act({ id: 'c', nombre: 'Montaje', seccion: 'S' }),
  ])
  assert.equal(bajadaDuracion(fila(filas, 'Demolición'), dias), '5 días hábiles')
  assert.equal(bajadaDuracion(fila(filas, 'Curado'), dias), '1 día técnicos')
  assert.equal(bajadaDuracion(fila(filas, 'Montaje'), dias), 'sin fechas')
  const cambios = cambiosDeFechas(filas, { a: { inicio: '2026-08-24', fin: '2026-08-28' }, c: { inicio: '2026-09-01', fin: '2026-09-03' } })
  assert.deepEqual(cambios, [{ actividadId: 'c', inicio: '2026-09-01', fin: '2026-09-03' }])
})

test('la vista (05 · M07) lista sólo lo que se mide: el rubro y sus tareas, sin las historias contenedoras', () => {
  const filas = filasDelPlan([
    act({ id: 'h', nombre: 'Demolición', seccion: 'Obra gruesa', tipo: 'resumen' }),
    act({ id: 't', nombre: 'Retiro', seccion: 'Obra gruesa', inicio_plan: '2026-09-01', fin_plan: '2026-09-04' }),
  ], { soloTareas: true })
  assert.deepEqual(filas.map((f) => f.nombre), ['Obra gruesa', 'Retiro'])
  assert.equal(filas[0].inicio, '2026-09-01')
})

test('una barra entera antes o después de lo visible se señala en ese borde; la que asoma, no', () => {
  const vis = { desde: 500, hasta: 1500, ancho: 2000 }
  assert.equal(ladoFuera({ izqPct: 0, anchoPct: 10 }, vis), 'izq') // 0–200 px
  assert.equal(ladoFuera({ izqPct: 80, anchoPct: 10 }, vis), 'der') // 1600–1800 px
  assert.equal(ladoFuera({ izqPct: 20, anchoPct: 10 }, vis), null) // 400–600 px: asoma
  assert.equal(ladoFuera(null, vis), null)
})

test('la ventana arranca en el inicio de la obra si empezó hace menos de 8 semanas', () => {
  assert.equal(arrancaEnElInicio('2026-08-03', '2026-09-25'), true) // 53 días
  assert.equal(arrancaEnElInicio('2026-07-01', '2026-09-25'), false)
  // En el teléfono entran seis semanas: 53 días no caben y abre con hoy a un tercio.
  assert.equal(arrancaEnElInicio('2026-08-03', '2026-09-25', 80), true)
  assert.equal(arrancaEnElInicio('2026-08-03', '2026-09-25', 42), false)
})
