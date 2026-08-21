import test from 'node:test'
import assert from 'node:assert/strict'
import {
  avanceMasivoLabel, avancePorCantidad, avancePorPasos, avisoMasivo, deltaDeAvance, deltaDeCantidad,
  hhProyectadas, operacionCompatible, proyeccionExcedida, quedaraEn, resumenSeleccion,
  seleccionable, type CandidataMasiva,
} from './avance.ts'

const act = (extra: Partial<CandidataMasiva> = {}): CandidataMasiva => ({
  id: 'a', metodo_avance: 'manual', cantidad_objetivo: null, avance_pct: null,
  es_contenedor: false, es_subcontrato: false, n_pasos: 0, ...extra,
})

// LOS PESOS SON RELATIVOS Y NO SUMAN 100 — así lo decidió la base para que agregar un paso no deje
// la actividad inválida a mitad de camino. El avance es la FRACCIÓN de peso ejecutado.
test('el avance por pasos es fracción de peso, no cantidad de pasos', () => {
  const pasos = [
    { peso: 10, hecho: true },   // Replanteo
    { peso: 30, hecho: true },   // Armadura
    { peso: 25, hecho: false },  // Encofrado
    { peso: 25, hecho: false },  // Hormigonado
    { peso: 10, hecho: false },  // Curado
  ]
  assert.equal(avancePorPasos(pasos), 40)
  assert.equal(avancePorPasos(pasos.map((p) => ({ ...p, hecho: true }))), 100)
})

test('los pesos relativos dan el mismo porcentaje que los que suman 100', () => {
  assert.equal(avancePorPasos([{ peso: 1, hecho: true }, { peso: 3, hecho: false }]), 25)
  assert.equal(avancePorPasos([{ peso: 25, hecho: true }, { peso: 75, hecho: false }]), 25)
})

test('una actividad sin pasos cargados no está al 0 %: no tiene avance por pasos', () => {
  assert.equal(avancePorPasos([]), null)
})

test('el avance por cantidad no existe sin objetivo, y no pasa de 100', () => {
  assert.equal(avancePorCantidad(48, 96), 50)
  assert.equal(avancePorCantidad(48, null), null, 'sin objetivo no hay porcentaje, hay un hueco')
  assert.equal(avancePorCantidad(120, 96), 100)
  assert.equal(avancePorCantidad(null, 96), null)
})

// ═══ LA TRAMPA DEL ACUMULADO ═══
// La pantalla pide la cantidad ACUMULADA y la vista SUMA los registros. Escribir el acumulado como
// un registro nuevo duplica todo lo anterior: 65 m² ya cargados + «ahora vamos por 74» daría 139.
test('lo que se guarda es la diferencia, no el acumulado que se tipeó', () => {
  assert.equal(deltaDeCantidad(74, 65), 9)
  assert.equal(deltaDeCantidad(9, null), 9, 'sin nada cargado antes, el acumulado ES el primer registro')
  assert.equal(deltaDeCantidad(60, 65), -5, 'una corrección a la baja es un hecho y se guarda')
})

test('las HH proyectadas necesitan las dos puntas: sin base son null, nunca cero', () => {
  assert.equal(hhProyectadas(21, 40), 53)
  assert.equal(hhProyectadas(null, 40), null)
  assert.equal(hhProyectadas(21, null), null)
  assert.equal(hhProyectadas(21, 0), null, 'dividir por cero avance daría infinito, no una proyección')
})

test('la proyección se marca sólo cuando pasa el plan por más del 5 %', () => {
  assert.equal(proyeccionExcedida(53, 37), true)
  assert.equal(proyeccionExcedida(38, 37), false)
  assert.equal(proyeccionExcedida(53, null), false, 'sin plan no hay exceso: hay un dato que falta')
})

// ═══ EL AVANCE EN LOTE NO LE SIRVE A TODOS LOS MÉTODOS ═══
// Una actividad medida por pasos calcula su porcentaje desde el tildado de los pasos: escribir un
// porcentaje general al lado dejaría el registro firmado y la actividad quieta. Es el peor caso —
// una escritura que no falla y no mueve el número.
test('el avance general sirve para manual, partes y cantidad con objetivo; nunca para pasos', () => {
  assert.equal(operacionCompatible(act({ metodo_avance: 'manual' }), 'avance'), true)
  assert.equal(operacionCompatible(act({ metodo_avance: 'partes' }), 'avance'), true)
  assert.equal(operacionCompatible(act({ metodo_avance: 'cantidad', cantidad_objetivo: 96 }), 'avance'), true)
  assert.equal(operacionCompatible(act({ metodo_avance: 'cantidad', cantidad_objetivo: null }), 'avance'), false)
  assert.equal(operacionCompatible(act({ metodo_avance: 'pasos' }), 'avance'), false)
})

test('estado, responsable y fechas no dependen de cómo se mida la actividad', () => {
  for (const op of ['estado', 'responsable', 'fechas'] as const) {
    assert.equal(operacionCompatible(act({ metodo_avance: 'pasos' }), op), true)
    assert.equal(operacionCompatible(act({ es_contenedor: true }), op), false, 'un contenedor no se opera')
  }
})

// ═══ QUÉ SE PUEDE TILDAR, MEDIDO CONTRA LA BASE REAL ═══
// El contrato visual apagaba la casilla de lo que está «sin análisis». Las 275 actividades de las
// tres obras están sin análisis: esa regla dejaba el avance masivo inerte. Lo que de verdad impide
// medir es no tener CON QUÉ — una cantidad sin objetivo, unos pasos sin pasos.
test('sólo se tilda lo que se puede medir de alguna manera', () => {
  assert.equal(seleccionable(act({ metodo_avance: 'manual' })), true)
  assert.equal(seleccionable(act({ metodo_avance: 'partes' })), true)
  assert.equal(seleccionable(act({ es_contenedor: true })), false, 'un contenedor no se mide, se agrega')
  assert.equal(seleccionable(act({ metodo_avance: 'cantidad', cantidad_objetivo: null })), false,
    'sin el total no hay porcentaje que calcular')
  assert.equal(seleccionable(act({ metodo_avance: 'cantidad', cantidad_objetivo: 96 })), true)
  assert.equal(seleccionable(act({ metodo_avance: 'pasos', n_pasos: 0 })), false,
    'sin pasos cargados no hay peso que sumar')
  assert.equal(seleccionable(act({ metodo_avance: 'pasos', n_pasos: 5 })), true)
})

test('la columna QUEDARÁ EN escribe «—» donde la operación no se va a aplicar', () => {
  assert.equal(quedaraEn(act({ metodo_avance: 'manual' }), 'avance', 75), 75)
  assert.equal(quedaraEn(act({ metodo_avance: 'pasos' }), 'avance', 75), null)
})

// EL AVISO ES UNO SOLO Y EN ORDEN DE GRAVEDAD. Tres apilados no se leen: se leen como uno y no se
// actúa sobre ninguno.
test('gana el retroceso, después la precisión, y al final la firma del subcontrato', () => {
  const sel = [
    act({ id: '1', metodo_avance: 'manual', avance_pct: 90 }),
    act({ id: '2', metodo_avance: 'pasos', es_subcontrato: true }),
  ]
  const r = resumenSeleccion(sel, 'avance', 50)
  assert.equal(r.retrocesos, 1)
  assert.match(avisoMasivo(r) ?? '', /^1 actividad quedaría con menos avance/)

  const sinRetroceso = resumenSeleccion(sel, 'avance', 95)
  assert.equal(avisoMasivo(sinRetroceso), '1 no se mide por pasos: aplicar un porcentaje general le quita precisión.')

  const soloSub = resumenSeleccion([act({ metodo_avance: 'pasos', es_subcontrato: true })], 'avance', 50)
  assert.equal(avisoMasivo(soloSub), 'Hay 1 de subcontrato: el avance lo firma el jefe de obra.')
})

test('el plural del aviso está escrito, no armado con una «s» pegada', () => {
  const sel = [act({ metodo_avance: 'manual' }), act({ metodo_avance: 'partes' })]
  assert.equal(avisoMasivo(resumenSeleccion(sel, 'avance', 50)),
    '2 no se miden por pasos: aplicar un porcentaje general les quita precisión.')
})

// CAMBIAR EL RESPONSABLE DE VEINTE ACTIVIDADES NO PIERDE PRECISIÓN POR CÓMO SE MIDAN. Un aviso que
// aparece siempre es un aviso que no se lee nunca.
test('las operaciones que no son avance no arrastran el aviso de precisión', () => {
  const sel = [act({ metodo_avance: 'manual' }), act({ metodo_avance: 'manual' })]
  assert.equal(avisoMasivo(resumenSeleccion(sel, 'responsable', null)), null)
})

test('el rótulo del lote dice cuántas se van a tocar de verdad', () => {
  const sel = [act({ metodo_avance: 'manual' }), act({ metodo_avance: 'pasos' })]
  assert.equal(avanceMasivoLabel(resumenSeleccion(sel, 'avance', 50)), 'Aplicar a 1')
  assert.equal(avanceMasivoLabel(resumenSeleccion(sel, 'estado', null)), 'Aplicar a 2')
})

// EL ESPEJO DE LA TRAMPA ANTERIOR: `partes` SUMA porcentajes. Dejar una actividad «en 75 %»
// escribiendo 75 sobre 65 ya sumados daría 140, la vista lo recorta a 100, el número queda bien de
// casualidad y el historial queda mintiendo para siempre.
test('sobre el método partes se escribe la diferencia de porcentaje, no el objetivo', () => {
  assert.equal(deltaDeAvance(75, 65), 10)
  assert.equal(deltaDeAvance(75, null), 75)
  assert.equal(deltaDeAvance(50, 90), -40, 'el retroceso se guarda: es un hecho, no un error')
})
