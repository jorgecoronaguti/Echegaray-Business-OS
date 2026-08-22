// LOS FILTROS DE PLANIFICACIÓN — que recortar no rompa la estructura del cronograma.
//
// El defecto que este archivo previene: filtrar por estado o por responsable y llevarse puestas las
// filas de RESUMEN, que son la cabecera del rubro. Sin cabecera, sus hijas quedan colgando de un
// grupo sin nombre y el Gantt dibuja «Sin sección» donde había «Estructura».

import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { aplicarFiltro, cuantosFiltros, FILTRO_VACIO, hayFiltro } from './filtroPlan.ts'
import type { Actividad } from '../types/index.ts'

const act = (p: Partial<Actividad>): Actividad => ({
  id: p.id ?? 'a', obra_id: 'o', clave: 'k', seccion: null, codigo: null, codigo_padre: null,
  nombre: 'x', tipo: 'tarea', orden: 1, inicio_plan: null, fin_plan: null, dias_plan: null,
  inicio_real: null, fin_real: null, dias_real: null, inicio_base: null, fin_base: null, pct: null,
  estado: 'pendiente', cuadrilla: null, comentario: null, editado_a_mano: false,
  fuente_pestana: null, sellada_en: null, responsable_id: null, hh_plan: null, archivada: false,
  creada_en_web: false, rubro: null, unidad: null, cantidad_objetivo: null, metodo_avance: 'manual',
  cuadrilla_id: null, cuadrilla_prevista: null, partida_codigo: null, partida_cantidad: null,
  cantidad_ejecutada: null, n_partes: 0, ultimo_parte: null, hh_real: null, hh_extra: null,
  n_imputaciones: 0, impedimentos_abiertos: 0, avance_pct: null, origen_avance: null,
  estado_operativo: 'pendiente', productividad: null, consumo_hh_pct: null,
  actividad_padre_id: null, n_tareas: 0, n_tareas_hechas: 0, n_pedidos: 0,
  inicio_real_declarado: null, fin_real_declarado: null, origen_inicio_real: null,
  origen_fin_real: null, forecast_fin: null, base_del_forecast: null, dias_restantes: null,
  tiene_fecha: false, tiene_fecha_plan: false, estado_fecha: 'sin_fecha',
  desvio_plan_dias: null, desvio_forecast_dias: null,
  ...p,
})

const PLAN = [
  act({ id: 'r1', nombre: 'Estructura', tipo: 'resumen' }),
  act({ id: 'a1', nombre: 'Excavaciones', seccion: 'Estructura', estado_operativo: 'hecha', responsable_id: 'p1' }),
  act({ id: 'a2', nombre: 'Fundaciones', seccion: 'Estructura', estado_operativo: 'bloqueada' }),
  act({ id: 'r2', nombre: 'Mampostería', tipo: 'resumen' }),
  act({ id: 'a3', nombre: 'Interior', seccion: 'Mampostería', estado_operativo: 'en_curso', responsable_id: 'p1' }),
]

test('sin filtro devuelve la MISMA lista, sin copiarla', () => {
  assert.equal(aplicarFiltro(PLAN, FILTRO_VACIO), PLAN)
  assert.equal(hayFiltro(FILTRO_VACIO), false)
})

test('filtrar por estado NO se lleva puesta la cabecera del rubro', () => {
  const r = aplicarFiltro(PLAN, { ...FILTRO_VACIO, estado: 'bloqueada' })
  assert.deepEqual(r.map((a) => a.id), ['r1', 'a2', 'r2'])
})

test('filtrar por rubro deja el rubro entero y saca los otros, cabecera incluida', () => {
  const r = aplicarFiltro(PLAN, { ...FILTRO_VACIO, rubro: 'Estructura' })
  assert.deepEqual(r.map((a) => a.id), ['r1', 'a1', 'a2'])
})

test('el rubro se compara normalizado: MAMPOSTERIA encuentra Mampostería', () => {
  const r = aplicarFiltro(PLAN, { ...FILTRO_VACIO, rubro: 'MAMPOSTERIA' })
  assert.deepEqual(r.map((a) => a.id), ['r2', 'a3'])
})

test('responsable «sin» son las que no tienen: no es lo mismo que todas', () => {
  const r = aplicarFiltro(PLAN, { ...FILTRO_VACIO, responsable: 'sin' })
  assert.deepEqual(r.filter((a) => a.tipo !== 'resumen').map((a) => a.id), ['a2'])
})

test('los tres filtros se cruzan, y el contador los cuenta', () => {
  const f = { rubro: 'Estructura', estado: 'hecha', responsable: 'p1' }
  assert.equal(cuantosFiltros(f), 3)
  assert.deepEqual(aplicarFiltro(PLAN, f).filter((a) => a.tipo !== 'resumen').map((a) => a.id), ['a1'])
})
