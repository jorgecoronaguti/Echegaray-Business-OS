import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ALTO_FILA, SALTO_RUBRO, agruparActividades, disposicionDeFilas, filasVisibles,
} from './cronograma.ts'
import type { Actividad } from '../types/index.ts'

// LA TABLA Y EL GANTT SON UNA SOLA FILA — y esto es lo que lo prueba sin navegador.
//
// El defecto que atrapa: calcular la posición de la barra como `i × alto`, ignorando que cada rubro
// abre 8px de aire. Con un solo rubro no se nota; con cuatro, la última actividad muestra la barra
// de la de al lado. Es el error más caro de esta pantalla porque no se ve como un error: se ve como
// una obra que va distinto de lo que va.

const act = (id: string, seccion: string | null): Actividad => ({
  id, obra_id: 'o', clave: id, seccion, codigo: null, codigo_padre: null, nombre: id,
  tipo: 'tarea', orden: 0, inicio_plan: '2026-08-01', fin_plan: '2026-08-05', dias_plan: null,
  inicio_real: null, fin_real: null, dias_real: null, inicio_base: null, fin_base: null,
  pct: null, estado: 'pendiente', cuadrilla: null, comentario: null, editado_a_mano: false,
  fuente_pestana: null, sellada_en: null, responsable_id: null, hh_plan: null, archivada: false,
  creada_en_web: true, rubro: seccion, unidad: null, cantidad_objetivo: null, metodo_avance: 'manual',
  cuadrilla_id: null, cuadrilla_prevista: null, partida_codigo: null, partida_cantidad: null,
  cantidad_ejecutada: null, n_partes: 0, ultimo_parte: null, hh_real: null, hh_extra: null,
  n_imputaciones: 0, impedimentos_abiertos: 0, avance_pct: null, origen_avance: null,
  estado_operativo: 'pendiente', productividad: null, consumo_hh_pct: null,
  actividad_padre_id: null, n_tareas: 0, n_tareas_hechas: 0, n_pedidos: 0,
})

test('sin filas, el lienzo no tiene alto', () => {
  const d = disposicionDeFilas([])
  assert.deepEqual(d.tops, [])
  assert.equal(d.total, 0)
})

test('el salto de cada rubro se ACUMULA en las filas que vienen después', () => {
  const filas = filasVisibles(
    agruparActividades([act('a1', 'Estructura'), act('a2', 'Estructura'), act('a3', 'Mampostería')]),
    new Set(),
  )
  // grupo · a1 · a2 · grupo · a3
  assert.equal(filas.length, 5)
  const d = disposicionDeFilas(filas)
  assert.deepEqual(d.tops, [0, 38, 76, 122, 160])
  // La quinta fila NO está en 4 × 38 = 152: está 8px más abajo por el aire del segundo rubro.
  assert.notEqual(d.tops[4], 4 * ALTO_FILA)
  assert.equal(d.total, 198)
})

test('el primer rubro no abre aire: arriba tiene el encabezado', () => {
  const filas = filasVisibles(agruparActividades([act('a1', 'Estructura')]), new Set())
  const d = disposicionDeFilas(filas)
  assert.equal(d.saltos[0], 0)
  assert.equal(d.tops[0], 0)
})

test('cada fila mide lo mismo en los dos lados, y el salto viaja con ella', () => {
  const filas = filasVisibles(
    agruparActividades([act('a1', 'Estructura'), act('a2', 'Mampostería')]),
    new Set(),
  )
  const d = disposicionDeFilas(filas)
  // La tabla apila `salto + alto`; el lienzo posiciona en `top`. Las dos cuentas tienen que cerrar.
  let acumulado = 0
  filas.forEach((_, i) => {
    acumulado += d.saltos[i]!
    assert.equal(d.tops[i], acumulado, `la fila ${i} no cae donde la apila la tabla`)
    acumulado += d.alto
  })
  assert.equal(acumulado, d.total)
})

test('un rubro colapsado saca sus filas del cálculo, no las esconde debajo', () => {
  const grupos = agruparActividades([act('a1', 'Estructura'), act('a2', 'Mampostería')])
  const d = disposicionDeFilas(filasVisibles(grupos, new Set(['Estructura'])))
  // grupo(Estructura) · grupo(Mampostería) · a2 — la fila de a1 no ocupa lugar.
  assert.equal(d.tops.length, 3)
  assert.equal(d.total, 3 * ALTO_FILA + SALTO_RUBRO)
})
