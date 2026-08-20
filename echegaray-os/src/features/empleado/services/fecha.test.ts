import { test } from 'node:test'
import assert from 'node:assert/strict'
import { diaFechaYAnio, diaYFecha, dm, mesAnterior, mesDe, mesLargo } from './fecha.ts'

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
