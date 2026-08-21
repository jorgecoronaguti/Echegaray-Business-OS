// LO QUE ATRAPAN: una barra en el lugar equivocado, una barra invisible que se lee «sin fechas», y
// la línea de hoy pegada al borde en una obra que terminó el año pasado.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  celdasDe, construirEscalaCronograma, diasEntre, etiquetaDe, semanaIso, tramoDe, ventanaDe,
  N_COLUMNAS,
} from './escalaCronograma.ts'

test('la ventana abarca de la primera fecha a la última, no del orden de la lista', () => {
  const v = ventanaDe([
    { inicio: '2026-07-20', fin: '2026-07-22' },
    { inicio: '2026-07-06', fin: '2026-07-10' },
    { inicio: '2026-07-15', fin: null },
  ])
  assert.deepEqual(v, { desde: '2026-07-06', hasta: '2026-07-22' })
})

test('sin una sola fila con fechas no hay ventana: null, y la pantalla dice la deuda de carga', () => {
  assert.equal(ventanaDe([{ inicio: null, fin: null }]), null)
  assert.equal(ventanaDe([]), null)
})

test('una fila que empieza y no termina no invierte la ventana', () => {
  assert.deepEqual(ventanaDe([{ inicio: '2026-07-20', fin: null }]), { desde: '2026-07-20', hasta: '2026-07-20' })
})

test('doce columnas siempre, y el rótulo cambia con el zoom', () => {
  const e = construirEscalaCronograma({ desde: '2026-03-02', hasta: '2027-02-26' }, 'mes', '2026-08-21')
  assert.equal(e.columnas.length, N_COLUMNAS)
  assert.equal(e.columnas[0].etiqueta, 'MAR')
  assert.equal(e.columnas[0].posPct, 0)
  const dia = construirEscalaCronograma({ desde: '2026-08-18', hasta: '2026-09-02' }, 'dia', '2026-08-21')
  assert.equal(dia.columnas[0].etiqueta, '18/8')
})

test('la semana se rotula con su número ISO, no con el día', () => {
  assert.equal(etiquetaDe('2026-03-02', 'semana'), 'S10')
  assert.equal(semanaIso(new Date(Date.UTC(2026, 0, 1))), 1)
})

test('HOY no se dibuja cuando cae fuera del plan: la línea pegada al borde diría que la obra empieza hoy', () => {
  const vieja = construirEscalaCronograma({ desde: '2025-01-06', hasta: '2025-03-06' }, 'mes', '2026-08-21')
  assert.equal(vieja.hoyPosPct, null)
  const viva = construirEscalaCronograma({ desde: '2026-08-01', hasta: '2026-08-31' }, 'dia', '2026-08-16')
  assert.equal(Math.round(viva.hoyPosPct!), 48, '15 días de 31 celdas, no la mitad de 30')
})

test('una actividad de un día en una obra larga no desaparece: piso de ancho', () => {
  const e = { desde: '2026-01-01', hasta: '2026-12-31' }
  const t = tramoDe(e, '2026-06-01', '2026-06-01')!
  assert.ok(t.anchoPct >= 0.6, 'una barra invisible se lee «sin fechas», que es otra cosa')
  assert.equal(Math.round(t.izqPct), 41, 'el 1° de junio cae al 41 % de un año que arranca el 1° de enero')
})

test('una barra nunca se sale del lienzo', () => {
  const e = { desde: '2026-01-01', hasta: '2026-01-31' }
  const t = tramoDe(e, '2026-01-28', '2026-03-15')!
  assert.ok(t.izqPct + t.anchoPct <= 100.0001, `se sale: ${t.izqPct + t.anchoPct}`)
})

test('sin inicio no hay tramo: null, y la fila muestra «sin fechas · falta análisis»', () => {
  assert.equal(tramoDe({ desde: '2026-01-01', hasta: '2026-12-31' }, null, '2026-06-01'), null)
})

test('el ancho del gantt es calendario, no días hábiles: el sábado ocupa lugar', () => {
  assert.equal(diasEntre('2026-07-06', '2026-07-13'), 7)
})

test('doce rótulos iguales no se dibujan doce veces: sólo el primero de cada unidad', () => {
  // Una obra de cuatro días en escala «Semana» caía entera en la semana 28 y el encabezado decía
  // «S28» doce veces. Doce rótulos iguales no informan nada y se leen como una pantalla rota.
  const e = construirEscalaCronograma({ desde: '2026-07-06', hasta: '2026-07-09' }, 'semana', '2026-08-21')
  assert.equal(e.columnas.length, N_COLUMNAS, 'las doce columnas siguen existiendo: sostienen la grilla')
  assert.equal(e.columnas.filter((c) => c.nueva).length, 1, 'pero un solo rótulo')
  const dia = construirEscalaCronograma({ desde: '2026-08-01', hasta: '2026-08-31' }, 'dia', '2026-08-16')
  assert.equal(dia.columnas.filter((c) => c.nueva).length, N_COLUMNAS, 'en escala día son doce distintos')
})

test('LA ACTIVIDAD QUE TERMINA EL ÚLTIMO DÍA SE VE — no cae fuera del lienzo', () => {
  // «Desencofrado de losa» arrancaba y terminaba el 09/07, el último día de la ventana, y con el
  // denominador equivocado quedaba en `left: 100 %`: la fila salía en blanco y se leía «sin
  // fechas», que es lo contrario de lo que pasaba.
  const e = { desde: '2026-07-06', hasta: '2026-07-09' }
  assert.equal(celdasDe(e.desde, e.hasta), 4, 'del 6 al 9 son cuatro días, contando las dos puntas')
  const t = tramoDe(e, '2026-07-09', '2026-07-09')!
  assert.equal(t.izqPct, 75)
  assert.equal(t.anchoPct, 25)
  const primera = tramoDe(e, '2026-07-06', '2026-07-06')!
  assert.equal(primera.izqPct, 0)
  assert.equal(primera.anchoPct, 25)
})

test('una ventana de un solo día ocupa el lienzo entero', () => {
  const t = tramoDe({ desde: '2026-07-06', hasta: '2026-07-06' }, '2026-07-06', '2026-07-06')!
  assert.deepEqual(t, { izqPct: 0, anchoPct: 100 })
})
