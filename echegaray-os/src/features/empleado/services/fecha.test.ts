import { test } from 'node:test'
import assert from 'node:assert/strict'
import { diaCorto, diaFechaYAnio, diaYFecha, dm, legible, mesAnterior, mesDe, mesLargo, semanaDe } from './fecha.ts'

test('el día de la semana sale en castellano SIN depender del ICU del servidor', () => {
  // El defecto que atrapa: con ICU reducido, `toLocaleDateString('es-AR')` devuelve «Wednesday» y la
  // pantalla queda en inglés sin romperse — un fallo silencioso que en obra nadie reporta.
  assert.equal(diaYFecha('2026-08-20'), 'jueves 20/08')
  assert.equal(diaFechaYAnio('2026-08-20'), 'jueves 20/08/2026')
})

test('la fecha no se corre un día por el huso', () => {
  // `new Date('2026-08-20')` es medianoche UTC: leída en Argentina, es el 19 a las 21. Sin el
  // cálculo en UTC, «hoy» se dibujaría como ayer todas las mañanas.
  assert.equal(diaYFecha('2026-01-01').startsWith('jueves'), true)
})

test('el mes se calcula entero, incluidos febrero y los de 31', () => {
  assert.deepEqual(mesDe('2026-02-14'), { desde: '2026-02-01', hasta: '2026-02-28' })
  assert.deepEqual(mesDe('2024-02-14'), { desde: '2024-02-01', hasta: '2024-02-29' })
  assert.deepEqual(mesDe('2026-08-20'), { desde: '2026-08-01', hasta: '2026-08-31' })
})

test('ENERO → DICIEMBRE DEL AÑO ANTERIOR', () => {
  // El defecto que atrapa: restarle uno al número del mes da «2026-00», y «mes pasado» en enero
  // devuelve una ventana vacía sin decir por qué.
  assert.deepEqual(mesAnterior('2026-01-15'), { desde: '2025-12-01', hasta: '2025-12-31' })
  assert.deepEqual(mesAnterior('2026-08-20'), { desde: '2026-07-01', hasta: '2026-07-31' })
})

test('el mes largo y el día corto', () => {
  assert.equal(mesLargo('2026-08-01'), 'Agosto 2026')
  assert.equal(dm('2026-08-05'), '05/08')
  assert.equal(dm(null), null)
})

test('la clave de la base se muestra como palabra, no como clave', () => {
  // El defecto que atrapa: «oficial_especializado» en la pantalla de un albañil. Es la clave del
  // vocabulario de Postgres, no su categoría — y un diccionario a mano deja sin traducir la primera
  // clave que alguien agregue.
  assert.equal(legible('oficial_especializado'), 'Oficial especializado')
  assert.equal(legible('MAQUINISTA'), 'MAQUINISTA')
  assert.equal(legible(null), null)
  assert.equal(legible(''), null)
})

test('semanaDe corta de lunes a domingo, y el domingo pertenece a la semana que termina', () => {
  // Sáb 23/08/2026 → lunes 17, domingo 23.
  assert.deepEqual(semanaDe('2026-08-23'), { desde: '2026-08-17', hasta: '2026-08-23' })
  assert.deepEqual(semanaDe('2026-08-17'), { desde: '2026-08-17', hasta: '2026-08-23' })
  // EL DEFECTO QUE ATRAPA: con `dow - 1` sin caso especial, el domingo (dow 0) corre la semana un
  // día hacia ADELANTE y la lista de M05 se ve vacía. Domingo 24 pertenece a la semana del 24 al 30.
  assert.deepEqual(semanaDe('2026-08-24'), { desde: '2026-08-24', hasta: '2026-08-30' })
})

test('semanaDe cruza el fin de mes sin inventar un día', () => {
  assert.deepEqual(semanaDe('2026-09-01'), { desde: '2026-08-31', hasta: '2026-09-06' })
})

test('diaCorto escribe el día de la semana y el número, sin corrimiento de huso', () => {
  assert.equal(diaCorto('2026-08-18'), 'Mar 18')
  assert.equal(diaCorto('2026-08-23'), 'Dom 23')
})
