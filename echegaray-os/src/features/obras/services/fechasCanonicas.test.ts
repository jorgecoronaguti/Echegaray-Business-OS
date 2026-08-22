// LAS FECHAS DE UNA ACTIVIDAD SALEN DE UNA SOLA FUENTE, Y TODAS LAS PANTALLAS LEEN DE AHÍ.
//
// ═══ EL DEFECTO QUE ATRAPA ═══
//
// En producción, el 22/08/2026: la cabecera de la ficha decía «Fin plan 30/01/2026» y el bloque
// «Plan vs real», tres centímetros abajo, «fin previsto 27/08/2026» — de la misma obra. La ficha
// mostraba «Inicio real 24/08» con fecha de hoy 22/08: una obra arrancada pasado mañana. Y la misma
// actividad aparecía «sin fecha» en la lista mientras el Gantt le dibujaba una barra.
//
// La causa no era ninguna pantalla: era que cada una armaba las fechas por su cuenta —una desde el
// campo del formulario de la obra, otra desde `max(fin_plan)` de las actividades, otra desde la
// columna `inicio_real` de la tabla, que nadie llena—. Este test fija el contrato: la regla vive en
// `actividad_fechas`/`obra_fechas` y los servicios PIDEN esas columnas, no las derivan.
//
// ═══ QUÉ NO PRUEBA ═══
//
// Esto lee el código, no la base. Que la vista publique lo que promete —y que el real futuro no
// salga— lo prueba `orquestador/lib/fechas-canonicas.pg.test.mjs` contra Postgres.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { estadoDe } from './cronograma.ts'
import { resumenDelPlan } from './resumenDelPlan.ts'
import type { Actividad } from '../types'

const fuente = (ruta: string) => readFileSync(fileURLToPath(new URL(ruta, import.meta.url)), 'utf8')

/** Las siete fechas del contrato. Ninguna pantalla puede inventar una octava ni derivar una. */
const SIETE = [
  'inicio_base', 'fin_base', 'inicio_plan', 'fin_plan', 'inicio_real', 'fin_real', 'forecast_fin',
]

test('el cronograma le pide a la vista las siete fechas, no seis', () => {
  const src = fuente('./cronogramaObraService.ts')
  const lista = src.slice(src.indexOf('const COLUMNAS ='), src.indexOf('const CAMPOS_FECHA'))
  for (const c of SIETE) assert.ok(lista.includes(`'${c}'`), `el cronograma no pide ${c}`)
  assert.ok(src.includes("from('obra_actividad_control')"), 'el cronograma tiene que leer la vista')
  assert.ok(!src.includes("from('obra_actividad')"), 'el cronograma no puede leer la tabla cruda')
})

test('el panel del jefe lee el real de la vista, que es evidencia y nunca futuro', () => {
  const src = fuente('../../jefe/services/jefeService.ts')
  const lista = src.slice(src.indexOf('const COLUMNAS_ACTIVIDAD'), src.indexOf('export async function getActividades'))
  // `inicio_real`/`fin_real` son las que usan `diasDeAtraso` y «terminada el …». Sin pedirlas, el
  // jefe ve «terminada» sin fecha sobre 117 actividades que tienen partes con fecha.
  for (const c of ['inicio_plan', 'fin_plan', 'inicio_real', 'fin_real', 'forecast_fin', 'estado_fecha']) {
    assert.ok(lista.includes(c), `el panel del jefe no pide ${c}`)
  }
  assert.ok(src.includes("from('obra_actividad_control')"))
})

test('el Gantt de obras lee el plazo de obra_plan_vs_real, con real y forecast', () => {
  const src = fuente('./ganttObras.ts')
  const lista = src.slice(src.indexOf('export const COLUMNAS_PLAZO'), src.indexOf('export async function getPlazoPorObra'))
  for (const c of ['inicio_plan', 'fin_plan', 'inicio_base', 'fin_base', 'inicio_real', 'fin_real', 'forecast_fin']) {
    assert.ok(lista.includes(c), `el Gantt de obras no pide ${c}`)
  }
  assert.ok(src.includes("from('obra_plan_vs_real')"))
})

test('la cabecera de la ficha y el Resumen leen la MISMA fecha de fin', () => {
  // La cabecera muestra `obra.fecha_fin_plan` (de `obra_panel`) y el titular del Resumen
  // `plan.fin_plan` (de `obra_plan_vs_real`). Las dos vistas cuelgan de `obra_fechas` desde la
  // migración T6020 — si alguien vuelve a colgar una de ellas de `obra_canonica`, esto se cae.
  const sql = fuente('../../../../supabase/migrations/20260822T6020_la_obra_publica_las_fechas_de_su_plan_no_otras.sql')
  const panel = sql.slice(sql.indexOf('create or replace view public.obra_panel'), sql.indexOf('-- ── Plan contra real'))
  assert.ok(panel.includes('f.fin_plan                           as fecha_fin_plan'),
    'obra_panel tiene que publicar el fin de obra_fechas, no el campo declarado')
  assert.ok(panel.includes('join public.obra_fechas f'))
  const pvr = sql.slice(sql.indexOf('create or replace view public.obra_plan_vs_real'))
  assert.ok(pvr.includes('f.fin_plan,') && pvr.includes('join public.obra_fechas f'),
    'obra_plan_vs_real tiene que publicar el fin de obra_fechas')
  // Y ninguna de las dos puede volver a leer la columna del formulario como si fuera el plan.
  assert.ok(!panel.includes('oc.fecha_fin_plan '), 'obra_panel volvió a leer el campo declarado')
})

test('la línea de tiempo del cliente lee las fechas reales de la vista, no de la tabla', () => {
  // El CRM dibujaba «arrancó la obra» con `obra_canonica.fecha_inicio_real`: el campo de un
  // formulario, que aceptaba pasado mañana. Un evento en el futuro dentro de una línea de tiempo.
  const src = fuente('../../clientes/services/clientesService.ts')
  assert.ok(!src.includes("from('obra_canonica')"), 'el CRM no puede leer las fechas de la tabla')
  assert.ok(src.includes("select('obra_id, nombre, creada_en, fecha_inicio_real, fecha_fin_real')"))
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// SIN FECHA ES UNO SOLO
// ═══════════════════════════════════════════════════════════════════════════════════════════════

const act = (p: Partial<Actividad>): Actividad => ({
  id: 'a', obra_id: 'o', clave: 'k', seccion: null, codigo: null, codigo_padre: null,
  nombre: 'tarea', tipo: 'tarea', orden: 1,
  inicio_plan: null, fin_plan: null, dias_plan: null, inicio_real: null, fin_real: null,
  dias_real: null, inicio_base: null, fin_base: null, pct: null, estado: 'pendiente',
  cuadrilla: null, comentario: null, editado_a_mano: false, fuente_pestana: null, sellada_en: null,
  responsable_id: null, hh_plan: null, archivada: false, creada_en_web: true,
  rubro: null, unidad: null, cantidad_objetivo: null, metodo_avance: 'manual',
  cuadrilla_id: null, cuadrilla_prevista: null, partida_codigo: null, partida_cantidad: null,
  inicio_real_declarado: null, fin_real_declarado: null, origen_inicio_real: null,
  origen_fin_real: null, forecast_fin: null, base_del_forecast: null, dias_restantes: null,
  tiene_fecha: false, tiene_fecha_plan: false, estado_fecha: 'sin_fecha',
  desvio_plan_dias: null, desvio_forecast_dias: null,
  cantidad_ejecutada: null, n_partes: 0, ultimo_parte: null, hh_real: null, hh_extra: null,
  n_imputaciones: 0, impedimentos_abiertos: 0,
  ...p,
} as Actividad)

const HOY = '2026-08-22'

test('una actividad con fin de plan pero sin inicio NO es «sin fecha»', () => {
  // Antes: `if (!a.inicio_plan) return 'sin_fecha'`. La actividad tenía fecha de entrega cargada,
  // la lista la mostraba «sin fecha» y el Gantt le dibujaba la barra igual.
  const a = act({ fin_plan: '2026-08-30', tiene_fecha: true, tiene_fecha_plan: true, estado_fecha: 'planificada' })
  assert.equal(estadoDe(a, HOY), 'por_empezar')
})

test('una actividad en curso por EVIDENCIA, sin plan, no es «sin fecha»', () => {
  const a = act({ inicio_real: '2026-08-10', tiene_fecha: true, estado_fecha: 'en_curso' })
  assert.equal(estadoDe(a, HOY), 'en_curso')
})

test('sin ninguna fecha sigue siendo «sin fecha»', () => {
  assert.equal(estadoDe(act({}), HOY), 'sin_fecha')
})

test('terminada por evidencia, aunque el avance declarado no llegue a 100', () => {
  const a = act({ pct: 80, fin_real: '2026-08-05', estado_fecha: 'terminada', tiene_fecha: true })
  assert.equal(estadoDe(a, HOY), 'terminada')
})

test('el Resumen cuenta las SIN FECHA con la marca de la vista, no con su propia regla', () => {
  const acts = [
    act({ id: '1', tiene_fecha: false }),
    act({ id: '2', fin_plan: '2026-08-30', tiene_fecha: true, tiene_fecha_plan: true }),
    // Sin plan, pero con partes encima: tiene fecha. La regla vieja («no tiene inicio_plan») la
    // habría contado como no programada.
    act({ id: '3', inicio_real: '2026-08-10', tiene_fecha: true, estado_fecha: 'en_curso' }),
    act({ id: '4', tipo: 'resumen', tiene_fecha: false }),
  ]
  const r = resumenDelPlan(acts, [], HOY)
  assert.equal(r.actividades, 3, 'la fila de resumen no es trabajo')
  assert.equal(r.sinFecha, 1)
})
