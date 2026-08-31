// §5 · Los dos casos de este archivo son los que el motor falló sobre la base REAL, con sus
// motivos textuales. Lo que se prueba NO es que ahora mapeen —el rechazo era correcto— sino que
// ahora exista el camino de vuelta.

import test from 'node:test'
import assert from 'node:assert/strict'
import { preguntaParaCerrar, responder, opcionesPorAtributo, TIPO_PREGUNTA } from './base-maestra-pregunta.mjs'
import { seleccionar, ESTADO } from './plano/seleccion.mjs'
import { paresComplementarios } from './base-maestra-completitud.mjs'
import { FUENTE } from './plano/fuente.mjs'

// El catálogo REAL de mampostería: la base tiene DOS partidas y sólo una de ladrillón.
const T1018 = { id: 'a', codigo: 'T1018', nombre: 'MAMPOSTERÍA LADRILLON CERÁMICO e = 0,20 m', unidad: 'M2' }
const T1019 = { id: 'b', codigo: 'T1019', nombre: 'MAMPOSTERÍA DE BLOCK DE HORMIGON', unidad: 'M2' }
const T1107_1 = { id: 'c', codigo: 'T1107.1', nombre: 'PISO DE HORMIGON ALISADO MECÁNICO - MANO DE OBRA', unidad: 'M2' }
const T1107_2 = { id: 'd', codigo: 'T1107.2', nombre: 'PISO DE HORMIGON ALISADO MECÁNICO - MATERIALES H17, 15cm y #6 15-15', unidad: 'M2' }

const COSTOS = { T1018: 45000, T1019: 38000, 'T1107.1': 17550.9, 'T1107.2': 28939.5 }
const dictado = (nombre, unidad) => ({ id: nombre, nombre, unidad, cantidad: { valor: 520 } })

test('CASO REAL 1 · mampostería sin espesor: el rechazo se mantiene y aparece la pregunta', () => {
  const m = seleccionar(dictado('MAMPOSTERÍA LADRILLON CERÁMICO', 'M2'), [T1018, T1019])
  // El comportamiento de fondo NO se tocó: sigue sin mapear, y eso está bien.
  assert.equal(m.estado, ESTADO.PARTIDA_CANDIDATA)
  assert.equal(m.faltan[0].atributo, 'espesor_m')

  const p = preguntaParaCerrar(m, { costos: COSTOS })
  assert.equal(p.tipo, TIPO_PREGUNTA.ATRIBUTO)
  // LA REGLA 1: las opciones salen del catálogo. La base sólo analizó 0,20 → no se ofrece un 0,15
  // que después nadie va a poder cotizar.
  assert.deepEqual(p.opciones.map((o) => o.respuesta), ['T1018', 'NO_HAY_ANALISIS'])
  assert.match(p.pregunta, /0,20/)
  // LA REGLA 2: cada opción trae su plata.
  assert.match(p.opciones[0].que, /45\.000/)
})

test('CASO REAL 1 · contestada, el mapeo se cierra solo y queda registrado', () => {
  const m = seleccionar(dictado('MAMPOSTERÍA LADRILLON CERÁMICO', 'M2'), [T1018, T1019])
  const p = preguntaParaCerrar(m, { costos: COSTOS })
  const r = responder(p, 'T1018', { quien: 'jorge@ecsas.com.ar', cuando: '2026-08-30' })
  assert.equal(r.ok, true)
  assert.equal(r.estado, ESTADO.MAPEADA)
  assert.deepEqual(r.codigos, ['T1018'])
  // La fuente cambia: el código lo eligió una persona, no el puntaje. Verificarlo es preguntarle
  // a esa persona, no releer el catálogo.
  assert.equal(r.fuente, FUENTE.EXPERIENCIA_ECSAS)
  assert.equal(r.decision.quien, 'jorge@ecsas.com.ar')
})

test('CASO REAL 2 · el piso: la respuesta NO es «cuál de las dos», es «van juntas»', () => {
  const pares = paresComplementarios([T1107_1, T1107_2, T1018])
  const m = seleccionar(dictado('PISO DE HORMIGON ALISADO MECÁNICO', 'M2'), [T1107_1, T1107_2])
  assert.equal(m.estado, ESTADO.AMBIGUO, 'el motor de hoy las ve como dos opciones a 0,096')

  const p = preguntaParaCerrar(m, { costos: COSTOS, paresComplementarios: pares })
  assert.equal(p.tipo, TIPO_PREGUNTA.VAN_JUNTAS, 'no son dos opciones: son dos mitades')
  assert.equal(p.recomendada, 'JUNTAS')
  // El costo de equivocarse, en plata: 17.550,90 + 28.939,50 = 46.490,40
  assert.match(p.opciones[0].que, /46\.490/)

  const r = responder(p, 'JUNTAS')
  assert.deepEqual(r.codigos, ['T1107.1', 'T1107.2'])
  assert.equal(r.estado, ESTADO.MAPEADA)
})

test('elegir UNA de dos mitades sigue siendo posible, pero es una decisión explícita', () => {
  const pares = paresComplementarios([T1107_1, T1107_2])
  const m = seleccionar(dictado('PISO DE HORMIGON ALISADO MECÁNICO', 'M2'), [T1107_1, T1107_2])
  const r = responder(preguntaParaCerrar(m, { costos: COSTOS, paresComplementarios: pares }), 'T1107.2')
  assert.deepEqual(r.codigos, ['T1107.2'])
  assert.ok(r.decision.respuesta === 'T1107.2', 'queda registrado quién decidió cotizar sólo la mitad')
})

test('UNA RESPUESTA QUE HAY QUE INTERPRETAR NO CIERRA UN MAPEO', () => {
  const m = seleccionar(dictado('MAMPOSTERÍA LADRILLON CERÁMICO', 'M2'), [T1018, T1019])
  const p = preguntaParaCerrar(m, { costos: COSTOS })
  for (const basura of ['creo que era el de 20', 'T1018 ', 'si', '0,20', null, 'T9999']) {
    const r = responder(p, basura)
    assert.equal(r.ok, false, `«${basura}» no puede cerrar un mapeo`)
    assert.match(r.porQue, /no es una de las opciones/)
  }
})

test('NO_HAY_ANALISIS es una respuesta correcta, y deja CANDIDATO — que no cotiza', () => {
  const m = seleccionar(dictado('MAMPOSTERÍA LADRILLON CERÁMICO', 'M2'), [T1018, T1019])
  const r = responder(preguntaParaCerrar(m, { costos: COSTOS }), 'NO_HAY_ANALISIS')
  assert.equal(r.ok, true)
  assert.equal(r.estado, ESTADO.PARTIDA_CANDIDATA, 'un candidato se muestra, no cotiza')
  assert.deepEqual(r.codigos, [])
  assert.equal(r.fuente, FUENTE.FALTA_DATO)
})

test('a un mapeo RESUELTO no se le pregunta nada', () => {
  const m = seleccionar(dictado('MAMPOSTERÍA LADRILLON CERÁMICO e = 0,20 m', 'M2'), [T1018, T1019])
  assert.equal(m.estado, ESTADO.MAPEADA)
  assert.equal(preguntaParaCerrar(m, { costos: COSTOS }), null)
})

test('la pregunta NUNCA ofrece una opción que el catálogo no tiene', () => {
  const ops = opcionesPorAtributo('espesor_m', [
    { codigo: 'T1018', nombre: T1018.nombre, unidad: 'M2' },
    { codigo: 'T1019', nombre: T1019.nombre, unidad: 'M2' },
  ], COSTOS)
  // T1019 no declara espesor → no aparece como opción de espesor. Ofrecerla obligaría a elegir un
  // valor que esa partida no afirma.
  assert.deepEqual(ops.map((o) => o.codigo), ['T1018'])
  assert.equal(ops[0].valor, 0.2)
})

test('sin candidatos la pregunta es «¿se crea el análisis?», no una lista vacía', () => {
  const m = seleccionar(dictado('CÚPULA GEODÉSICA DE TITANIO', 'M2'), [T1018, T1019])
  const p = preguntaParaCerrar(m, { costos: COSTOS })
  assert.deepEqual(p.opciones.map((o) => o.respuesta), ['NO_HAY_ANALISIS'])
})
