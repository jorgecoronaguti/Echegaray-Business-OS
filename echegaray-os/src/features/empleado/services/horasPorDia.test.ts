import test from 'node:test'
import assert from 'node:assert/strict'
import { porDia, totalExtra } from './horasPorDia.ts'

// LO QUE ESTOS TESTS ATRAPAN
//
// 1. Que tres imputaciones del mismo día se dibujen como tres renglones de «Lunes 18»: la persona
//    tendría que sumar de cabeza para saber si el lunes está bien cargado.
// 2. Que las horas EXTRA se pierdan adentro del total: no se liquidan igual, y a fin de quincena
//    esa es la única diferencia que importa.
// 3. Que un día sin imputaciones aparezca con 0,00: no es un día de cero horas, es un día del que
//    la obra no cargó nada, y son dos afirmaciones distintas.

test('las imputaciones del mismo día se suman en UNA fila', () => {
  const dias = porDia([
    { fecha: '2026-08-18', obra: 'Escuela San Juan', tipo_hora: 'normal', horas: 4 },
    { fecha: '2026-08-18', obra: 'Escuela San Juan', tipo_hora: 'normal', horas: 3 },
    { fecha: '2026-08-18', obra: 'Galpón 2', tipo_hora: 'normal', horas: 2 },
  ])
  assert.equal(dias.length, 1)
  assert.equal(dias[0].horas, 9)
  // Las dos obras del día viajan, sin repetir la que se imputó dos veces.
  assert.deepEqual(dias[0].obras, ['Escuela San Juan', 'Galpón 2'])
})

test('las extra suman al total del día Y viajan aparte', () => {
  const dias = porDia([
    { fecha: '2026-08-18', obra: 'Escuela San Juan', tipo_hora: 'normal', horas: 8 },
    { fecha: '2026-08-18', obra: 'Escuela San Juan', tipo_hora: 'extra_50', horas: 1 },
  ])
  assert.equal(dias[0].horas, 9)
  assert.equal(dias[0].extra, 1)
  assert.equal(totalExtra(dias), 1)
})

test('un día SIN imputaciones no aparece: no es un día de cero horas', () => {
  const dias = porDia([{ fecha: '2026-08-18', obra: 'x', tipo_hora: 'normal', horas: 8 }])
  assert.deepEqual(dias.map((d) => d.fecha), ['2026-08-18'])
  // Una fila sin fecha tampoco inventa un día.
  assert.deepEqual(porDia([{ fecha: null, obra: 'x', tipo_hora: 'normal', horas: 8 }]), [])
})

test('el orden es del más reciente al más viejo, que es como se revisa una quincena', () => {
  const dias = porDia([
    { fecha: '2026-08-18', obra: 'x', tipo_hora: 'normal', horas: 8 },
    { fecha: '2026-08-20', obra: 'x', tipo_hora: 'normal', horas: 8 },
    { fecha: '2026-08-19', obra: 'x', tipo_hora: 'normal', horas: 8 },
  ])
  assert.deepEqual(dias.map((d) => d.fecha), ['2026-08-20', '2026-08-19', '2026-08-18'])
})

test('la suma de decimales no arrastra la basura del punto flotante', () => {
  // 0.1 + 0.2 en coma flotante da 0.30000000000000004, y eso se dibuja como «0,30000000000000004 h».
  const dias = porDia([
    { fecha: '2026-08-18', obra: 'x', tipo_hora: 'normal', horas: 0.1 },
    { fecha: '2026-08-18', obra: 'x', tipo_hora: 'normal', horas: 0.2 },
  ])
  assert.equal(dias[0].horas, 0.3)
})
