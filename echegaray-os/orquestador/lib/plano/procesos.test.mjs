// QUE LA OMISIÓN SE VEA, Y QUE NADA SE AGREGUE SOLO.
//
// La prueba central es la que pide el caso de la fundación: con «BASE B1» computada, el sistema
// tiene que preguntar por el replanteo, la excavación, el hormigón de limpieza, la armadura, el
// encofrado, el hormigonado, el curado y el relleno compactado. Ninguna de esas ocho aparece en el
// plano, todas se pagan, y las ocho llegan sin confirmar.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { procesosDe, procesosDeTodos, dimensionesDe, ESTADO_PROCESO, ORIGEN } from './procesos.mjs'
import { SISTEMA } from './interpretar.mjs'
import { FUENTE } from './fuente.mjs'

const BASE = {
  id: 'B1',
  nombre: 'Base aislada B1',
  sistema: SISTEMA.HORMIGON_ARMADO,
  dimensiones: { largo: 1.5, ancho: 1.5, alto: 0.4 },
}

test('UNA BASE ARRASTRA OCHO PROCESOS que el plano no dibuja', () => {
  const p = procesosDe(BASE)
  const tareas = p.map((x) => x.tarea)
  for (const esperada of ['Replanteo', 'Excavación de bases y zanjas', 'Hormigón de limpieza', 'Armadura elaborada y colocada', 'Encofrado', 'Hormigonado', 'Curado', 'Relleno y compactación']) {
    assert.ok(tareas.includes(esperada), `falta ${esperada}`)
  }
  assert.equal(p.length, 8)
})

test('NINGUNO NACE CONFIRMADO: la regla propone, la persona confirma', () => {
  const p = procesosDe(BASE)
  assert.ok(p.every((x) => x.estado === ESTADO_PROCESO.PENDIENTE_CONFIRMACION))
})

test('la cantidad se deriva CUANDO SE PUEDE, con su fórmula y sus entradas', () => {
  const p = procesosDe(BASE)
  const limpieza = p.find((x) => x.tarea === 'Hormigón de limpieza')
  assert.equal(limpieza.cantidad, 2.25, '1,50 × 1,50')
  assert.equal(limpieza.formula, 'largo × ancho')
  assert.deepEqual(limpieza.entradas, { largo: 1.5, ancho: 1.5 })
  assert.equal(limpieza.fuente, FUENTE.CALCULADO)

  const encofrado = p.find((x) => x.tarea === 'Encofrado')
  assert.equal(encofrado.cantidad, 2.4, '2 × (1,50 + 1,50) × 0,40')

  const hormigon = p.find((x) => x.tarea === 'Hormigonado')
  assert.equal(hormigon.cantidad, 0.9)
})

test('LO QUE DEPENDE DE UN CRITERIO NO SE DERIVA: la excavación sale abierta y con dueño', () => {
  const exc = procesosDe(BASE).find((x) => x.tarea === 'Excavación de bases y zanjas')
  assert.equal(exc.cantidad, null, 'inventar el sobreancho es inventar metros cúbicos')
  assert.equal(exc.fuente, FUENTE.FALTA_DATO)
  assert.match(exc.porQueFalta, /sobreancho/)
  assert.equal(exc.quienLoTiene, 'dirección técnica / proyecto')
})

test('sin dimensiones NO se inventa una cantidad: sale el hueco', () => {
  const p = procesosDe({ ...BASE, dimensiones: {} })
  assert.ok(p.every((x) => x.cantidad === null))
  assert.ok(p.every((x) => x.fuente === FUENTE.FALTA_DATO))
})

test('cada proceso dice DE DÓNDE sale la afirmación, y ninguno se atribuye a ECSAS', () => {
  const p = procesosDe(BASE)
  assert.ok(p.every((x) => x.origen && x.cita))
  assert.ok(!p.some((x) => x.origen === ORIGEN.EXPERIENCIA_ECSAS), 'ECSAS todavía no tiene esto escrito en una fuente citable')
  assert.ok(p.some((x) => x.origen === ORIGEN.REFERENCIA_CIRCOT))
})

test('lo que el proyecto YA tiene computado no se vuelve a proponer', () => {
  const p = procesosDe(BASE, { yaComputadas: ['Replanteo general de obra', 'Excavación manual'] })
  assert.ok(!p.some((x) => x.tarea === 'Replanteo'))
  assert.ok(!p.some((x) => x.tarea.startsWith('Excavación')))
  assert.equal(p.length, 6)
})

test('una respuesta explícita queda escrita: NO_APLICA es un resultado, no un olvido', () => {
  const p = procesosDe(BASE, { respuestas: { 'FUNDACION_HORMIGON:Curado': ESTADO_PROCESO.NO_APLICA } })
  assert.equal(p.find((x) => x.tarea === 'Curado').estado, ESTADO_PROCESO.NO_APLICA)
})

test('una columna NO dispara la regla de fundación, y sí la de estructura', () => {
  const col = { id: 'C1', nombre: 'Columna de carga C1', sistema: SISTEMA.HORMIGON_ARMADO, dimensiones: { largo: 0.3, ancho: 0.5, alto: 3.5 } }
  const p = procesosDe(col)
  assert.ok(p.every((x) => x.regla === 'ESTRUCTURA_HORMIGON'))
  assert.ok(p.some((x) => x.tarea === 'Desencofrado'))
  assert.ok(!p.some((x) => x.tarea === 'Replanteo'))
})

test('LA ELEVACIÓN DEL HORMIGÓN es una partida aparte, y el CIRCOT lo dice con todas las letras', () => {
  const col = { id: 'C1', nombre: 'Columna de carga C1', sistema: SISTEMA.HORMIGON_ARMADO, dimensiones: { largo: 0.3, ancho: 0.5, alto: 3.5 } }
  const e = procesosDe(col).find((x) => x.tarea === 'Elevación del hormigón')
  assert.ok(e, 'una base no la lleva; una columna sí')
  assert.match(e.cita, /s\/ elevación/)
})

test('una pieza metálica arrastra taller, protección, transporte y montaje — nada de eso está en el plano', () => {
  const p = procesosDe({ id: 'CE1', nombre: 'Cercha CE1', sistema: SISTEMA.METALICA, dimensiones: { largo: 18.3 } })
  const tareas = p.map((x) => x.tarea)
  assert.ok(tareas.includes('Provisión y fabricación en taller'))
  assert.ok(tareas.includes('Tratamiento anticorrosivo'))
  assert.ok(tareas.includes('Izaje y montaje'))
  assert.ok(p.every((x) => x.cantidad === null), 'el plano da longitud, no kilos ni superficie desarrollada')
})

test('las dimensiones se leen tanto sueltas como envueltas en su dato con fuente', () => {
  assert.deepEqual(dimensionesDe({ dimensiones: { largo: 2, ancho: 1, alto: 0.5 } }), { largo: 2, ancho: 1, alto: 0.5 })
  assert.deepEqual(dimensionesDe({ dimensiones: { largo: { valor: 2 }, ancho: { valor: 1 }, espesor: { valor: 0.5 } } }), { largo: 2, ancho: 1, alto: 0.5 })
  assert.deepEqual(dimensionesDe({}), { largo: null, ancho: null, alto: null })
})

test('el recuento separa lo que tiene cantidad de lo que quedó abierto', () => {
  const r = procesosDeTodos([BASE])
  assert.equal(r.conCantidad, 5)
  assert.equal(r.sinCantidad, 3)
  assert.equal(r.pendientes, 8)
})

test('DOS CORRIDAS IDÉNTICAS derivan exactamente los mismos procesos', () => {
  assert.deepEqual(procesosDe(BASE), procesosDe(BASE))
})
