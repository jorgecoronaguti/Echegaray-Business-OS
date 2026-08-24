// LAS HH DE UNA CUADRILLA — la suma, probada sin base.
//
// El handoff pide «HH del período» en el panel de la cuadrilla. La suma tiene DOS formas de mentir
// que no producen ningún error visible:
//
//   1. CONTAR UNA AUSENCIA COMO TRABAJO. Una ausencia tiene horas cargadas y no es trabajo: sumarla
//      dice que la cuadrilla trabajó el día que faltó medio equipo. Es el mismo criterio con el que
//      la ficha de cada persona separa trabajadas de ausencias — una sola definición de «HH».
//   2. DEJAR ENTRAR FILAS DE OTRO PERÍODO. La quincena es la ventana con la que se liquida; una
//      fila de la quincena anterior infla el número contra el que después se paga.
//
// Y `numeric` de Postgres llega como CADENA por PostgREST: `'8.00' + '8.00'` da '8.008.00', no 16.

import test from 'node:test'
import assert from 'node:assert/strict'
import { filtrarCuadrillas, resumirCuadrillas, sumarHHTrabajadas } from './cuadrillasService.ts'

const fila = (fecha: string | null, horas: number | string, tipo_hora = 'normal') => ({ fecha, horas, tipo_hora })

test('sólo las horas trabajadas: una ausencia no es trabajo', () => {
  const filas = [
    fila('2026-08-17', 8),
    fila('2026-08-18', 8, 'extra_50'),
    fila('2026-08-19', 8, 'ausencia'),
    fila('2026-08-19', 8, 'licencia'),
  ]
  assert.equal(sumarHHTrabajadas(filas, '2026-08-16', '2026-08-31'), 16)
})

test('sólo las filas del período: la quincena anterior no infla la de ahora', () => {
  const filas = [fila('2026-08-15', 8), fila('2026-08-16', 8), fila('2026-08-31', 8), fila('2026-09-01', 8)]
  assert.equal(sumarHHTrabajadas(filas, '2026-08-16', '2026-08-31'), 16)
})

test('un `numeric` que llega como cadena se suma, no se concatena', () => {
  assert.equal(sumarHHTrabajadas([fila('2026-08-17', '8.00'), fila('2026-08-18', '4.50')], '2026-08-16', '2026-08-31'), 12.5)
})

test('una fila sin fecha no entra en ninguna ventana', () => {
  // Las 19 filas históricas de `registros_hh` vienen del Sheet por SEMANA y sin día. Meterlas en la
  // quincena por defecto le atribuiría horas a un período al que nadie dijo que pertenecen.
  assert.equal(sumarHHTrabajadas([fila(null, 8)], '2026-08-16', '2026-08-31'), 0)
})

// ═══ EL BUSCADOR DE CUADRILLAS ═══

const cua = (nombre: string, responsable: string | null, obras: string | null) =>
  ({ nombre, responsable, obras_actuales: obras })

const TRES = [
  cua('Cuadrilla Norte', 'Ramón Gómez', 'Galpón Messina'),
  cua('Cuadrilla Sur', 'Juan Pérez', null),
  cua('Terminaciones', null, 'Ampliación ARCOR'),
]

test('se encuentra por el capataz y por la obra, no sólo por el nombre', () => {
  // El defecto que atrapa: buscar por lo que la tabla MUESTRA y no encontrarlo. El apellido del
  // capataz está a la vista en su columna; si el filtro sólo mirara el nombre de la cuadrilla,
  // escribirlo vaciaría la lista y quien busca concluiría que la cuadrilla no existe.
  assert.deepEqual(filtrarCuadrillas(TRES, 'gomez').map((c) => c.nombre), ['Cuadrilla Norte'])
  assert.deepEqual(filtrarCuadrillas(TRES, 'arcor').map((c) => c.nombre), ['Terminaciones'])
  assert.deepEqual(filtrarCuadrillas(TRES, 'cuadrilla').map((c) => c.nombre), ['Cuadrilla Norte', 'Cuadrilla Sur'])
})

test('sin texto no filtra nada, y una cuadrilla sin capataz no desaparece', () => {
  // Una columna en `null` no puede sacar la fila de la lista: «Terminaciones» no tiene responsable y
  // tiene que seguir estando cuando no se buscó nada.
  assert.equal(filtrarCuadrillas(TRES, '').length, 3)
  assert.equal(filtrarCuadrillas(TRES, '   ').length, 3)
  assert.deepEqual(filtrarCuadrillas(TRES, 'terminac').map((c) => c.nombre), ['Terminaciones'])
})

// ═══ EL PIE DE LA PANTALLA 21 — la capacidad que no se pudo leer no es cero ═══
//
// `cuadrilla_capacidad` no trae fila para una cuadrilla sin integrantes vigentes. Sumarla como 0
// devuelve un total que PARECE completo: nadie puede distinguir «la empresa rinde 6,4 oficiales» de
// «rinde 6,4 de las que pude mirar». Es el mismo defecto que la columna CAP. POND. ya resolvió
// mostrando «—», y el mismo que en el Sheet dejó publicar una caja de $384 M que no existía.

const cap = (capacidad_ponderada: number, personas = 0) => ({
  capacidad_ponderada, personas, personas_sin_categoria: 0,
})

test('la capacidad total NO suma como 0 las cuadrillas que no se pudieron leer', () => {
  const r = resumirCuadrillas(
    [{ id: 'a', integrantes: 4 }, { id: 'b', integrantes: 3 }, { id: 'c', integrantes: 0 }],
    new Map([['a', cap(3.4)], ['b', cap(2.6)]]),
    5,
  )
  assert.equal(r.capacidad, 6)
  assert.equal(r.sinCapacidad, 1, 'la cuadrilla sin capacidad leída desapareció del total sin avisar')
  assert.equal(r.cuadrillas, 3)
  assert.equal(r.personas, 7)
  assert.equal(r.sinCuadrilla, 5)
})

test('sin NINGUNA capacidad leída el total es null, nunca 0', () => {
  const r = resumirCuadrillas([{ id: 'a', integrantes: 4 }], new Map(), 0)
  assert.equal(r.capacidad, null, 'un 0 acá afirma que la empresa no rinde nada')
  assert.equal(r.sinCapacidad, 1)
})
