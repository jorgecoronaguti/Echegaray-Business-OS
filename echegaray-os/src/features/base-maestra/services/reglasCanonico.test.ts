// LAS PRUEBAS DE LO QUE EL CANÓNICO 17/18 AGREGÓ — cada una nombra el defecto que atrapa.
//
// Viven en su propio archivo y no en `reglas.test.ts` porque aquél ya prueba las siete reglas
// originales y los dos juntos pasaban de 500 líneas. El criterio es el mismo: si se revierte la
// decisión que la prueba defiende, la prueba se pone roja.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  mediana, rendimientoPorObra, restarMeses, tiposDeComposicion, variacionEnMeses,
} from './reglas.ts'

// ═══ COMPOSICIÓN ═══════════════════════════════════════════════════════════════════════════════

test('la composición sale del TIPO del recurso, no de su costo, y siempre en el mismo orden', () => {
  // EL DEFECTO: leer la composición de `analisis_costo.costo_materiales` la haría depender de
  // `recurso_precio`, que la RLS le devuelve VACÍA al jefe de obra — él vería tareas sin materiales.
  // Y sin orden fijo, dos tareas con los mismos tres tipos dibujarían los iconos distinto.
  assert.deepEqual(tiposDeComposicion(['material', 'equipo', 'mano_obra']), ['mano_obra', 'material', 'equipo'])
  assert.deepEqual(tiposDeComposicion(['equipo', 'equipo']), ['equipo'])
  assert.deepEqual(tiposDeComposicion([]), [])
})

test('la carga social NO agrega un cuarto icono: acompaña siempre a la mano de obra', () => {
  assert.deepEqual(tiposDeComposicion(['mano_obra', 'carga_social']), ['mano_obra'])
  assert.deepEqual(tiposDeComposicion(['otro']), [])
})

// ═══ LA VENTANA DE VARIACIÓN ═══════════════════════════════════════════════════════════════════

test('restar meses no desborda de mes: 31/08 − 6 meses es 28/02, no 03/03', () => {
  // EL DEFECTO: `setUTCMonth(-6)` sobre un 31 devuelve el 3 de marzo, y el corte se corre tres días
  // hacia adelante justo en el mes que más precios trae.
  assert.equal(restarMeses('2026-08-31', 6), '2026-02-28')
  assert.equal(restarMeses('2024-08-31', 6), '2024-02-29')
  assert.equal(restarMeses('2026-08-25', 6), '2026-02-25')
  assert.equal(restarMeses('2026-01-15', 1), '2025-12-15')
})

test('sin un precio anterior a la ventana la variación es «sin base», nunca 0 %', () => {
  // EL DEFECTO: devolver 0 afirma que el precio NO SE MOVIÓ en seis meses. Lo que pasa es que no
  // hay con qué compararlo — y con esa afirmación alguien deja de actualizar una lista.
  const soloReciente = [
    { costo: 152000, fecha_precio: '2026-08-18' },
    { costo: 148000, fecha_precio: '2026-07-01' },
  ]
  assert.equal(variacionEnMeses(soloReciente, 6, '2026-08-25'), null)
  assert.equal(variacionEnMeses([], 6, '2026-08-25'), null)
  // Un único precio tampoco se compara contra sí mismo.
  assert.equal(variacionEnMeses([{ costo: 100, fecha_precio: '2020-01-01' }], 6, '2026-08-25'), null)
})

test('la variación mide el precio vigente contra el que regía seis meses atrás', () => {
  const historial = [
    { costo: 420, fecha_precio: '2026-06-02' },
    { costo: 375, fecha_precio: '2026-04-14' },
    { costo: 300, fecha_precio: '2026-01-05' },
    { costo: 250, fecha_precio: '2025-09-30' },
  ]
  const v = variacionEnMeses(historial, 6, '2026-08-25')
  // El corte es el 25/02/2026: el primero (en orden descendente) que ya regía es el del 05/01.
  assert.equal(v?.desde, '2026-01-05')
  assert.ok(v && Math.abs(v.fraccion - 0.4) < 1e-9)
})

test('un precio en cero no se usa de divisor: sería un infinito formateado como dato', () => {
  const historial = [
    { costo: 500, fecha_precio: '2026-08-01' },
    { costo: 0, fecha_precio: '2026-01-01' },
    { costo: 250, fecha_precio: '2025-11-01' },
  ]
  const v = variacionEnMeses(historial, 6, '2026-08-25')
  assert.equal(v?.desde, '2025-11-01')
  assert.ok(v && Math.abs(v.fraccion - 1) < 1e-9)
})

test('un precio sin fecha no entra a la ventana: no se le inventa una antigüedad', () => {
  const historial = [
    { costo: 500, fecha_precio: '2026-08-01' },
    { costo: 250, fecha_precio: null },
  ]
  assert.equal(variacionEnMeses(historial, 6, '2026-08-25'), null)
})

// ═══ RENDIMIENTO POR OBRA ══════════════════════════════════════════════════════════════════════

test('la mediana no la corre un registro cargado mal; el promedio sí', () => {
  // EL DEFECTO que justifica la mediana: una actividad con la cantidad mal cargada mete un 400 y
  // el promedio de la obra pasa de 1,5 a 101. La barra diría que esa obra rinde 67 veces peor.
  assert.equal(mediana([1, 2, 3]), 2)
  assert.equal(mediana([1, 2, 3, 400]), 2.5)
  assert.equal(mediana([]), null)
  assert.equal(mediana([Number.NaN]), null)
})

test('cada obra aporta UNA barra, con su mediana y su muestra', () => {
  const filas = rendimientoPorObra([
    { obra_id: 'o1', obra_nombre: 'Escuela', hs_unitarias: 44 },
    { obra_id: 'o1', obra_nombre: 'Escuela', hs_unitarias: 46 },
    { obra_id: 'o2', obra_nombre: 'Depósito', hs_unitarias: 36 },
  ], 34)
  assert.equal(filas.length, 2)
  assert.equal(filas[0].obra_nombre, 'Escuela')
  assert.equal(filas[0].hs_unitarias, 45)
  assert.equal(filas[0].muestra, 2)
  assert.equal(filas[0].direccion, 'peor')
  assert.equal(filas[1].muestra, 1)
})

test('el ancho de la barra es relativo a la peor obra, no a la base', () => {
  // Es lo que hace el canónico (1,32× ocupa el 100 % y 0,96× el 73 %). Proporcional a la base, las
  // cuatro barras medirían casi lo mismo y el gráfico no diría nada.
  const filas = rendimientoPorObra([
    { obra_id: 'a', obra_nombre: 'A', hs_unitarias: 132 },
    { obra_id: 'b', obra_nombre: 'B', hs_unitarias: 118 },
    { obra_id: 'c', obra_nombre: 'C', hs_unitarias: 96 },
  ], 100)
  assert.deepEqual(filas.map((f) => f.ancho), [100, 89, 73])
  // 0,96× queda en «igual»: la banda de `desvioObservado` es simétrica de 10 % y NO la asimétrica
  // del canónico (1,10 / 0,95), que declaraba mejora con la mitad de evidencia que empeoramiento.
  assert.deepEqual(filas.map((f) => f.direccion), ['peor', 'peor', 'igual'])
})

test('sin esfuerzo base la barra existe igual, pero SIN cociente inventado', () => {
  // EL DEFECTO: rellenar `ratio: 1` sobre una tarea sin análisis pintaría «la obra confirma la
  // base» cuando no hay ninguna base que confirmar.
  const filas = rendimientoPorObra([{ obra_id: 'a', obra_nombre: 'A', hs_unitarias: 12 }], null)
  assert.equal(filas.length, 1)
  assert.equal(filas[0].ratio, null)
  assert.equal(filas[0].direccion, null)
  assert.equal(filas[0].ancho, 100)
})

test('un registro sin horas no crea una obra fantasma en el gráfico', () => {
  const filas = rendimientoPorObra([
    { obra_id: 'a', obra_nombre: 'A', hs_unitarias: null },
    { obra_id: 'b', obra_nombre: 'B', hs_unitarias: 4 },
  ], 4)
  assert.deepEqual(filas.map((f) => f.obra_nombre), ['B'])
})

test('dos obras sin id no se funden en una sola barra', () => {
  // `obra_id` es nullable en `rendimiento_historico`: agrupar por él a secas metería en la misma
  // barra registros de obras distintas que perdieron la referencia.
  const filas = rendimientoPorObra([
    { obra_id: null, obra_nombre: 'Sin obra A', hs_unitarias: 10 },
    { obra_id: null, obra_nombre: 'Sin obra B', hs_unitarias: 20 },
  ], 10)
  assert.equal(filas.length, 2)
})
