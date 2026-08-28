// LA REGLA QUE DECIDE A QUIÉN SE LE COMPLETAN LOS DÍAS QUE FALTAN.
//
// `nomina-pestana.mjs` no tenía un solo test, y publica la pestaña que se mira el día de pago: si
// completa de más, se pagan horas que nadie trabajó; si completa de menos, se le descuentan a alguien
// que sí fue. La regla estaba adentro de un script de 800 líneas que lee el Sheet y escribe el Sheet,
// o sea imposible de probar sin tocar ninguno de los dos. Vive acá, pura, y acá se prueba.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ultimaColumnaHabilCargada, dejoDeCargar } from './nomina-devengado.mjs'

/** Quincena 17→31/08/2026: 17 lunes … 22 sábado, 23 domingo, 24 lunes … 29 sábado, 30 domingo, 31 lunes. */
const COLUMNAS = [
  { col: 5, etiqueta: '17/08', habil: true }, { col: 6, etiqueta: '18/08', habil: true },
  { col: 7, etiqueta: '19/08', habil: true }, { col: 8, etiqueta: '20/08', habil: true },
  { col: 9, etiqueta: '21/08', habil: true }, { col: 10, etiqueta: '22/08', habil: false },
  { col: 11, etiqueta: '23/08', habil: false }, { col: 12, etiqueta: '24/08', habil: true },
  { col: 13, etiqueta: '25/08', habil: true }, { col: 14, etiqueta: '26/08', habil: true },
  { col: 15, etiqueta: '27/08', habil: true }, { col: 16, etiqueta: '28/08', habil: true },
  { col: 17, etiqueta: '29/08', habil: false }, { col: 18, etiqueta: '30/08', habil: false },
  { col: 19, etiqueta: '31/08', habil: true },
]
const cargóEn = (cols) => (col) => cols.includes(col)

test('el sábado de dos personas no deja a las otras catorce «sin cargar»', () => {
  // El caso del auditor: una guardia el sábado 29 para dos, el resto cargó hasta el viernes 28.
  const delResto = ultimaColumnaHabilCargada(COLUMNAS, cargóEn([5, 6, 7, 8, 9, 12, 13, 14, 15, 16, 17]))
  assert.equal(delResto, 16, 'el último día HÁBIL cargado es el viernes 28, no el sábado 29')
  const unaCualquiera = ultimaColumnaHabilCargada(COLUMNAS, cargóEn([5, 6, 7, 8, 9, 12, 13, 14, 15, 16]))
  assert.equal(dejoDeCargar({ ultimaSuya: unaCualquiera, ultimaDelResto: delResto }), false,
    'cargó hasta el mismo viernes que el resto: sigue en el frente')
})

test('el que dejó de cargar de verdad sigue detectándose', () => {
  // Sosa Raúl: horas hasta el 25/08, baja ese día. El resto cargó hasta el 26.
  const delResto = ultimaColumnaHabilCargada(COLUMNAS, cargóEn([5, 6, 7, 8, 9, 12, 13, 14]))
  const suya = ultimaColumnaHabilCargada(COLUMNAS, cargóEn([5, 6, 7, 8, 9, 12, 13]))
  assert.equal(dejoDeCargar({ ultimaSuya: suya, ultimaDelResto: delResto }), true)
})

test('quien nunca cargó no cuenta como que dejó de cargar: es un alta, no una baja', () => {
  const delResto = ultimaColumnaHabilCargada(COLUMNAS, cargóEn([5, 6, 7]))
  assert.equal(dejoDeCargar({ ultimaSuya: -1, ultimaDelResto: delResto }), false)
})

test('si nadie cargó todavía, nadie dejó de cargar', () => {
  assert.equal(ultimaColumnaHabilCargada(COLUMNAS, cargóEn([])), -1)
  assert.equal(dejoDeCargar({ ultimaSuya: 5, ultimaDelResto: -1 }), false)
})

test('un sábado no puede ser el último día de nadie a los efectos de esta regla', () => {
  // Alguien que SÓLO cargó el sábado: no tiene día hábil, así que no se lo marca de baja.
  assert.equal(ultimaColumnaHabilCargada(COLUMNAS, cargóEn([10])), -1)
})
