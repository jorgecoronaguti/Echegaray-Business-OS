// LO QUE ATRAPAN: un día que mide distinto según cuánto dura la obra, una barra en el lugar
// equivocado, una barra invisible que se lee «sin fechas», la línea de hoy pegada al borde en una
// obra que terminó el año pasado, y enero de 2027 dibujado como si fuera enero de 2026.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  abreUnidad, ANCHO_DIA, celdasDe, construirEscalaCronograma, DAYW, diasEntre, etiquetaDe,
  semanaIso, tramoDe, ventanaDe, xDe,
} from './escalaCronograma.ts'

test('la ventana abarca de la primera fecha a la última, no del orden de la lista', () => {
  const v = ventanaDe([
    { inicio: '2026-07-20', fin: '2026-07-22' },
    { inicio: '2026-07-06', fin: '2026-07-10' },
    { inicio: '2026-07-15', fin: null },
  ])
  assert.deepEqual(v, { desde: '2026-07-06', hasta: '2026-07-22' })
})

test('RANGO VACÍO: sin una sola fila con fechas no hay ventana, y la pantalla dice la deuda de carga', () => {
  assert.equal(ventanaDe([{ inicio: null, fin: null }]), null)
  assert.equal(ventanaDe([]), null)
})

test('una fila que empieza y no termina no invierte la ventana', () => {
  assert.deepEqual(ventanaDe([{ inicio: '2026-07-20', fin: '2026-07-20' }]), { desde: '2026-07-20', hasta: '2026-07-20' })
  assert.deepEqual(ventanaDe([{ inicio: '2026-07-20', fin: null }]), { desde: '2026-07-20', hasta: '2026-07-20' })
})

// ═══ LA ESCALA ES DIARIA: EL DEFECTO QUE ESTOS TESTS ATRAPAN ═══

test('UN DÍA MIDE 26px EN ESCALA DE DÍA, dure lo que dure la obra', () => {
  // El defecto que atrapa —y que estaba vivo—: doce columnas repartidas sobre la ventana. Con eso
  // un día medía 45px en una obra de tres semanas y 1,3px en una de dos años, y las dos pantallas
  // se veían igual de llenas. Un ancho que no significa tiempo no es un Gantt.
  const corta = construirEscalaCronograma({ desde: '2026-08-01', hasta: '2026-08-21' }, 'dia', '2026-08-10')
  const larga = construirEscalaCronograma({ desde: '2026-01-01', hasta: '2027-12-31' }, 'dia', '2026-08-10')
  assert.equal(corta.pxPorDia, DAYW)
  assert.equal(larga.pxPorDia, DAYW)
  assert.equal(corta.pxPorDia, larga.pxPorDia, 'el mismo día no puede medir distinto en dos obras')
  assert.equal(ANCHO_DIA.dia, 26, 'el valor medido del mockup 07')
})

test('el lienzo mide lo que la obra dura, no lo que la pantalla mide', () => {
  const e = construirEscalaCronograma({ desde: '2026-08-01', hasta: '2026-08-31' }, 'dia', '2026-08-16')
  assert.equal(e.celdas, 31)
  assert.equal(e.anchoPx, 31 * DAYW, '31 días de agosto × 26px: 806px, y el resto se desplaza')
  // El defecto que atrapa: volver a un lienzo que se estira al contenedor. Ahí el ancho vuelve a
  // depender de la pantalla y no del tiempo.
  assert.equal(e.anchoPx, e.celdas * e.pxPorDia)
})

test('hay UNA COLUMNA POR DÍA, no doce repartidas', () => {
  const e = construirEscalaCronograma({ desde: '2026-08-01', hasta: '2026-08-31' }, 'dia', '2026-08-16')
  assert.equal(e.columnas.length, 31)
  assert.equal(e.columnas[0].iso, '2026-08-01')
  assert.equal(e.columnas[30].iso, '2026-08-31')
  assert.equal(e.columnas[0].x, 0)
  assert.equal(e.columnas[1].x, DAYW, 'el segundo día arranca a 26px del borde')
})

test('DÍA → X: el píxel de un día sale de contar días, no de un porcentaje del contenedor', () => {
  const e = construirEscalaCronograma({ desde: '2026-08-01', hasta: '2026-08-31' }, 'dia', '2026-08-16')
  assert.equal(xDe(e, '2026-08-01'), 0)
  assert.equal(xDe(e, '2026-08-16'), 15 * DAYW, 'el 16 es el día 15 contando desde cero')
  assert.equal(xDe(e, '2026-08-31'), 30 * DAYW, 'el último día del lienzo tiene su píxel')
})

test('un día FUERA de la ventana no tiene píxel: null, nunca el borde', () => {
  // Devolver 0 o `anchoPx` pegaría al borde una actividad que empieza tres meses antes del plan, y
  // se leería como que arranca el primer día de la obra.
  const e = construirEscalaCronograma({ desde: '2026-08-01', hasta: '2026-08-31' }, 'dia', '2026-08-16')
  assert.equal(xDe(e, '2026-07-31'), null)
  assert.equal(xDe(e, '2026-09-01'), null)
})

test('el rótulo de la escala de día es el número pelado: «18» no entra como «18/8» en 26px', () => {
  assert.equal(etiquetaDe('2026-08-18', 'dia'), '18')
  assert.equal(etiquetaDe('2026-03-02', 'semana'), 'S10')
  assert.equal(etiquetaDe('2026-03-02', 'mes'), 'MAR')
  assert.equal(semanaIso(new Date(Date.UTC(2026, 0, 1))), 1)
})

test('el rótulo va sólo donde ABRE la unidad: siete columnas por semana, un solo «S28»', () => {
  const sem = construirEscalaCronograma({ desde: '2026-07-06', hasta: '2026-07-19' }, 'semana', '2026-07-10')
  assert.equal(sem.columnas.length, 14, 'catorce días de lienzo')
  assert.equal(sem.columnas.filter((c) => c.nueva).length, 2, 'pero dos rótulos: dos lunes')
  assert.equal(sem.columnas.filter((c) => c.nueva)[0].etiqueta, 'S28')
  const dia = construirEscalaCronograma({ desde: '2026-07-06', hasta: '2026-07-19' }, 'dia', '2026-07-10')
  assert.equal(dia.columnas.filter((c) => c.nueva).length, 14, 'en escala día abre cada uno')
})

test('la PRIMERA columna siempre abre, aunque la obra arranque un miércoles', () => {
  // Sin esto, una obra que empieza el miércoles en escala de semana no tenía ninguna guía ni
  // rótulo hasta el lunes siguiente: el lienzo abría sin cabecera.
  const e = construirEscalaCronograma({ desde: '2026-07-08', hasta: '2026-07-20' }, 'semana', '2026-07-10')
  assert.equal(e.columnas[0].nueva, true)
})

test('ENERO DE 2027 NO ES LA CONTINUACIÓN DE ENERO DE 2026', () => {
  // El defecto que atrapa —y que estaba vivo—: `nueva` se decidía comparando el rótulo con el
  // anterior. `ENE` de 2026 y `ENE` de 2027 rotulan igual, así que la segunda quedaba sin guía y sin
  // rótulo y los dos eneros se dibujaban como uno solo.
  assert.equal(abreUnidad('2027-01-01', 'mes'), true)
  assert.equal(abreUnidad('2027-01-02', 'mes'), false)
  const e = construirEscalaCronograma({ desde: '2026-01-01', hasta: '2027-12-31' }, 'mes', '2026-08-21')
  assert.equal(e.columnas.filter((c) => c.nueva).length, 24, 'veinticuatro meses, veinticuatro rótulos')
})

test('el lunes abre la semana con la numeración isodow, no con el domingo=0 de JavaScript', () => {
  assert.equal(abreUnidad('2026-07-06', 'semana'), true, 'el 06/07/2026 es lunes')
  assert.equal(abreUnidad('2026-07-05', 'semana'), false, 'el domingo no abre semana')
})

// ═══ HOY ═══

test('HOY DENTRO del plan tiene píxel y porcentaje, y los dos apuntan al mismo día', () => {
  const e = construirEscalaCronograma({ desde: '2026-08-01', hasta: '2026-08-31' }, 'dia', '2026-08-16')
  assert.equal(e.hoyX, 15 * DAYW)
  assert.equal(e.hoyX, xDe(e, '2026-08-16'))
  assert.equal(Math.round(e.hoyPosPct!), 48, '15 días de 31 celdas, no la mitad de 30')
})

test('HOY FUERA del plan no se dibuja: la línea pegada al borde diría que la obra empieza hoy', () => {
  const vieja = construirEscalaCronograma({ desde: '2025-01-06', hasta: '2025-03-06' }, 'mes', '2026-08-21')
  assert.equal(vieja.hoyX, null)
  assert.equal(vieja.hoyPosPct, null)
  const futura = construirEscalaCronograma({ desde: '2027-01-06', hasta: '2027-03-06' }, 'dia', '2026-08-21')
  assert.equal(futura.hoyX, null)
})

test('HOY el último día de la obra todavía está adentro', () => {
  // El defecto que atrapa: usar `diasEntre` sin contar las dos puntas. El último día caía fuera y
  // la obra que termina hoy se dibujaba sin la marca de hoy.
  const e = construirEscalaCronograma({ desde: '2026-08-01', hasta: '2026-08-31' }, 'dia', '2026-08-31')
  assert.equal(e.hoyX, 30 * DAYW)
})

// ═══ LA BARRA — el porcentaje sobre un lienzo de ancho fijo ES el píxel ═══

test('el % de una barra, multiplicado por el ancho fijo, cae en el píxel del día', () => {
  const e = construirEscalaCronograma({ desde: '2026-08-01', hasta: '2026-08-31' }, 'dia', '2026-08-16')
  const t = tramoDe(e, '2026-08-16', '2026-08-20')!
  assert.equal((t.izqPct / 100) * e.anchoPx, 15 * DAYW, 'la barra arranca donde el día 16')
  assert.equal((t.anchoPct / 100) * e.anchoPx, 5 * DAYW, 'cinco días miden cinco celdas de 26px')
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

test('una ventana de un solo día ocupa el lienzo entero y mide 26px', () => {
  const e = construirEscalaCronograma({ desde: '2026-07-06', hasta: '2026-07-06' }, 'dia', '2026-07-06')
  assert.equal(e.anchoPx, DAYW)
  assert.deepEqual(tramoDe(e, '2026-07-06', '2026-07-06'), { izqPct: 0, anchoPct: 100 })
})
