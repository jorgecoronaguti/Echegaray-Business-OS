import assert from 'node:assert/strict'
import { test } from 'node:test'
import { deHoy, kpisDelDia } from './ejecucionService.ts'
import type { Actividad, ParteEjecucion } from '../types/index.ts'

// LOS KPIs DE LA JORNADA DE EJECUCIÓN.
//
// ═══ EL DEFECTO QUE ATRAPAN ═══
//
// El titular del día se puede escribir de dos maneras: contando lo que hay, o restando de lo que
// debería haber. La segunda es la que miente cuando falta un dato — «sin parte: 0» sobre una obra
// sin cronograma cargado dice que todos los frentes reportaron, cuando lo cierto es que no hay
// ningún frente declarado. Estos tests fijan que cada cifra cuente HECHOS: partes que existen y
// actividades que están declaradas en curso.

const act = (x: Partial<Actividad>): Actividad => ({
  id: x.id ?? 'a', obra_id: 'o', clave: 'k', seccion: null, codigo: null, codigo_padre: null,
  nombre: 'x', tipo: 'tarea', orden: 1, inicio_plan: null, fin_plan: null, dias_plan: null,
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
  tiene_fecha: false, tiene_fecha_plan: false, estado_fecha: 'sin_fecha',
  desvio_plan_dias: null, desvio_forecast_dias: null,
  actividad_padre_id: null, n_tareas: 0, n_tareas_hechas: 0, n_pedidos: 0, ...x,
})

const parte = (x: Partial<ParteEjecucion>): ParteEjecucion => ({
  id: 'p', obra_id: 'o', actividad_id: 'a', fecha: '2026-08-20', cantidad: null,
  avance_pct: null, comentario: null, fuente: 'web', creado_en: '2026-08-20T10:00:00Z', ...x,
})

const CURSO = { estado_operativo: 'en_curso' } as const

test('«sin parte» cuenta frentes en curso que hoy no reportaron, no la resta de un total', () => {
  const actividades = [
    act({ id: 'a1', ...CURSO }),
    act({ id: 'a2', ...CURSO }),
    act({ id: 'a3', ...CURSO }),
    act({ id: 'a4' }),                                  // pendiente: no debe reportar todavía
    act({ id: 'a5', ...CURSO, archivada: true }),        // archivada: salió del trabajo
    act({ id: 'r', tipo: 'resumen', ...CURSO }),         // un rubro no se ejecuta
  ]
  const partes = [
    parte({ id: 'p1', actividad_id: 'a1' }),
    parte({ id: 'p2', actividad_id: 'a1' }),             // dos partes, UNA actividad tocada
    parte({ id: 'p3', actividad_id: 'a2' }),
    parte({ id: 'p4', actividad_id: 'a3', fecha: '2026-08-19' }), // de ayer: no cuenta hoy
  ]
  assert.deepEqual(kpisDelDia(partes, actividades, '2026-08-20'), {
    partes: 3, tocadas: 2, enCurso: 3, sinParte: 1,
  })
})

test('sin cronograma cargado NO hay frentes reportando ni frentes en falta', () => {
  // El cero de `sinParte` acá significa «no hay ningún frente declarado», y por eso `enCurso`
  // también es 0: la pantalla tiene que poder decir «de 0 en curso» en vez de un rojo mentiroso.
  assert.deepEqual(kpisDelDia([], [], '2026-08-20'), {
    partes: 0, tocadas: 0, enCurso: 0, sinParte: 0,
  })
})

test('un parte sobre una actividad que no está en curso se cuenta igual: pasó', () => {
  const r = kpisDelDia([parte({ actividad_id: 'z' })], [act({ id: 'z' })], '2026-08-20')
  assert.equal(r.partes, 1)
  assert.equal(r.tocadas, 1)
  assert.equal(r.enCurso, 0)
})

test('deHoy suma por actividad sólo la jornada pedida', () => {
  const m = deHoy([
    parte({ id: '1', actividad_id: 'a', cantidad: 15.2 }),
    parte({ id: '2', actividad_id: 'a', cantidad: 4.8 }),
    parte({ id: '3', actividad_id: 'a', cantidad: 100, fecha: '2026-08-19' }),
  ], '2026-08-20')
  assert.equal(m.get('a')!.cantidad, 20)
})
