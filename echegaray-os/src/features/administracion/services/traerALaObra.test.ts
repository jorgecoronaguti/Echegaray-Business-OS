// A QUIÉN OFRECE «TRAER A ALGUIEN A ESTA OBRA», Y A QUIÉN NO.
//
// ═══ QUÉ DEFECTOS ATRAPAN ═══
//
// 1. Que la lista ofrezca a alguien que YA ESTÁ en la obra. El gesto contestaría «ya estaba», la
//    cuadrilla no cambiaría y quien lo tocó pensaría que el sistema no le hace caso.
// 2. Que una asignación CERRADA cuente como vigente. La persona aparecería «en OBRA X» cuando en
//    realidad no está en ninguna, y el acuse diría que se le cerró algo que ya estaba cerrado.
// 3. Que una asignación FUTURA cuente como vigente — el mismo error al revés.
// 4. Que «sin obra» se dibuje igual que «en otra obra». Traer a alguien que está libre y sacárselo
//    a otra obra son dos decisiones distintas y el jefe tiene que poder distinguirlas ANTES de
//    tocar: elegir cierra la asignación de hoy.
// 5. Que el buscador exija el orden del nombre o la tilde. En el plantel hay nombres cargados
//    «APELLIDO NOMBRE» y otros al revés (memoria `nombre-dado-vuelta`, abril/26); con el teclado
//    del teléfono nadie escribe la tilde.

import test from 'node:test'
import assert from 'node:assert/strict'
import { candidatosParaTraer, filtrarCandidatos, vigenteEnFecha } from './traerALaObra.ts'

const HOY = '2026-09-08'

const PLANTEL = [
  { id: 'p1', nombre_completo: 'PÉREZ JUAN' },
  { id: 'p2', nombre_completo: 'GONZÁLEZ ANA' },
  { id: 'p3', nombre_completo: 'ACOSTA LUIS' },
  { id: 'p4', nombre_completo: '   ' },
]

const NOMBRES = { 'pisos-industriales': 'PISOS INDUSTRIALES', 'salon-comercial': 'SALÓN COMERCIAL' }

test('quien ya está en ESTA obra no se ofrece; los demás sí, con su obra actual', () => {
  const lista = candidatosParaTraer({
    plantel: PLANTEL,
    asignaciones: [
      { persona_id: 'p1', obra_id: 'salon-comercial', desde: '2026-01-01', hasta: null },
      { persona_id: 'p2', obra_id: 'pisos-industriales', desde: '2026-01-01', hasta: null },
    ],
    nombresDeObra: NOMBRES,
    obraId: 'salon-comercial',
    fecha: HOY,
  })
  // PÉREZ ya está en la obra destino: no se ofrece. La persona sin nombre tampoco.
  assert.deepEqual(lista.map((c) => c.id), ['p3', 'p2'])
  assert.equal(lista.find((c) => c.id === 'p2')?.obraActual, 'PISOS INDUSTRIALES')
  // SIN OBRA ES `null`, NO UNA CADENA VACÍA: la pantalla tiene que poder decir «sin obra».
  assert.equal(lista.find((c) => c.id === 'p3')?.obraActual, null)
})

test('una asignación CERRADA no cuenta: esa persona figura sin obra y se puede traer', () => {
  const lista = candidatosParaTraer({
    plantel: [{ id: 'p1', nombre_completo: 'PÉREZ JUAN' }],
    asignaciones: [
      { persona_id: 'p1', obra_id: 'salon-comercial', desde: '2026-01-01', hasta: '2026-09-07' },
    ],
    nombresDeObra: NOMBRES,
    obraId: 'salon-comercial',
    fecha: HOY,
  })
  // EL DEFECTO QUE ATRAPA: contar `hasta` pasado como vigente dejaría a PÉREZ fuera de la lista de
  // la obra en la que ya no está — y sin forma de volver a traerlo desde esta pantalla.
  assert.deepEqual(lista.map((c) => ({ id: c.id, obra: c.obraActual })), [{ id: 'p1', obra: null }])
})

test('una asignación que EMPIEZA MAÑANA todavía no es la obra de hoy', () => {
  const lista = candidatosParaTraer({
    plantel: [{ id: 'p1', nombre_completo: 'PÉREZ JUAN' }],
    asignaciones: [
      { persona_id: 'p1', obra_id: 'pisos-industriales', desde: '2026-09-09', hasta: null },
    ],
    nombresDeObra: NOMBRES,
    obraId: 'salon-comercial',
    fecha: HOY,
  })
  assert.equal(lista[0].obraActual, null)
})

test('con DOS vigentes se nombran las dos: traerlo cierra las dos', () => {
  const lista = candidatosParaTraer({
    plantel: [{ id: 'p1', nombre_completo: 'PÉREZ JUAN' }],
    asignaciones: [
      { persona_id: 'p1', obra_id: 'pisos-industriales', desde: '2026-01-01', hasta: null },
      { persona_id: 'p1', obra_id: 'salon-comercial', desde: '2026-02-01', hasta: null },
    ],
    nombresDeObra: NOMBRES,
    obraId: 'zz-otra',
    fecha: HOY,
  })
  assert.equal(lista[0].obraActual, 'PISOS INDUSTRIALES y SALÓN COMERCIAL')
})

test('una obra sin nombre en el catálogo se muestra con su id, no como «sin obra»', () => {
  const lista = candidatosParaTraer({
    plantel: [{ id: 'p1', nombre_completo: 'PÉREZ JUAN' }],
    asignaciones: [{ persona_id: 'p1', obra_id: 'obra-rara', desde: '2026-01-01', hasta: null }],
    nombresDeObra: NOMBRES,
    obraId: 'salon-comercial',
    fecha: HOY,
  })
  assert.equal(lista[0].obraActual, 'obra-rara')
})

test('vigenteEnFecha: `desde` nulo es «desde siempre», no una fila futura', () => {
  assert.equal(vigenteEnFecha({ desde: null, hasta: null }, HOY), true)
  assert.equal(vigenteEnFecha({ desde: null, hasta: '2026-09-08' }, HOY), true, 'el último día cuenta')
  assert.equal(vigenteEnFecha({ desde: '2026-09-08', hasta: null }, HOY), true, 'el primer día cuenta')
})

test('el buscador ignora tildes, mayúsculas y el ORDEN de las palabras', () => {
  const lista = [
    { id: 'p1', nombre: 'PÉREZ JUAN', obraActual: null },
    { id: 'p2', nombre: 'GONZÁLEZ ANA', obraActual: null },
  ]
  assert.deepEqual(filtrarCandidatos(lista, 'perez').map((c) => c.id), ['p1'])
  assert.deepEqual(filtrarCandidatos(lista, 'JUAN perez').map((c) => c.id), ['p1'],
    'el nombre está cargado al revés y el buscador tiene que encontrarlo igual')
  assert.deepEqual(filtrarCandidatos(lista, 'gonzalez').map((c) => c.id), ['p2'])
  assert.deepEqual(filtrarCandidatos(lista, '   ').map((c) => c.id), ['p1', 'p2'],
    'espacios en blanco no filtran nada')
  assert.deepEqual(filtrarCandidatos(lista, 'zzz'), [])
})
