// LA JORNADA NO SON OCHO HORAS PAREJAS, Y CREERLO DEJABA LA PROYECCIÓN 10% CORTA (27/08/2026).
//
// El dueño: *"9 h de lunes a jueves y 8 h el viernes"*, regla general — *"todo igual y así"*. Son 44 h
// semanales. La constante anterior valía 8 h de lunes a viernes: 40. La limitación estaba declarada
// («un piso DEL piso») y una limitación declarada no deja de ser un número corto.
//
// El sábado es aparte: se trabaja, con carga variable (diciembre lo tiene con 4 h para todo el
// plantel; en agosto hay uno en blanco y Sosa con 8 h el 8/8). Se toma 4 h COMO SUPUESTO.
//
// Si alguien vuelve a poner un promedio por día, los tests de abajo se ponen rojos con el número.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  HORAS_POR_DIA_DE_SEMANA, HORAS_LUNES_A_JUEVES, HORAS_VIERNES, HORAS_SABADO_SUPUESTO,
  HORAS_SEMANA_DECLARADA, HORAS_SEMANA_CON_SABADO, HORAS_POR_DIA_HABIL,
  horasDeJornada, expresionHorasDeJornada, MASCARAS,
} from './jornada-uocra.mjs'
import { diasHabilesObra } from './jornales-demanda-obras.mjs'

const d = (dia, mes) => new Date(2026, mes - 1, dia)

test('la tabla está indexada como Date.getDay(): domingo 0, sábado 6', () => {
  // El `+1` que haría falta con cualquier otra convención es el error que corre una semana entera
  // sin dar un solo error. Se prueba contra fechas reales, no contra el orden en que está escrita.
  assert.equal(HORAS_POR_DIA_DE_SEMANA[d(3, 8).getDay()], HORAS_LUNES_A_JUEVES, 'lunes 3/8/2026')
  assert.equal(HORAS_POR_DIA_DE_SEMANA[d(6, 8).getDay()], HORAS_LUNES_A_JUEVES, 'jueves 6/8/2026')
  assert.equal(HORAS_POR_DIA_DE_SEMANA[d(7, 8).getDay()], HORAS_VIERNES, 'viernes 7/8/2026')
  assert.equal(HORAS_POR_DIA_DE_SEMANA[d(8, 8).getDay()], HORAS_SABADO_SUPUESTO, 'sábado 8/8/2026')
  assert.equal(HORAS_POR_DIA_DE_SEMANA[d(9, 8).getDay()], 0, 'domingo 9/8/2026')
})

test('EL DEFECTO: 8 h parejas eran 40 h semanales, y la jornada del dueño son 44', () => {
  assert.equal(HORAS_SEMANA_DECLARADA, 44)
  assert.equal(HORAS_SEMANA_CON_SABADO, 48)
  // El 10% que faltaba, medido: 44/40 − 1.
  assert.equal(Number((HORAS_SEMANA_DECLARADA / (8 * 5) - 1).toFixed(2)), 0.10)
})

test('las horas se cuentan día por día, no como promedio × cuenta de días', () => {
  // Una quincena empieza y termina en cualquier día de la semana. Con "días hábiles × promedio" el
  // resultado difiere según dónde caigan los viernes: chico y silencioso, la peor combinación.
  //
  // 1/9 (martes) → 15/9 (martes) de 2026: 11 días hábiles. Los viernes son el 4 y el 11 (2), así que
  // lunes-a-jueves son 9. Jornada = 9×9 + 2×8 = 97 h; el promedio daría 11 × 8,8 = 96,8.
  assert.equal(diasHabilesObra(d(1, 9), d(15, 9)), 11)
  assert.equal(horasDeJornada(d(1, 9), d(15, 9)), 9 * 9 + 2 * 8 + 2 * 4)
  assert.notEqual(horasDeJornada(d(1, 9), d(15, 9)), 11 * HORAS_POR_DIA_HABIL + 2 * 4)
  // Y un tramo que sólo tiene un viernes rinde exactamente las horas de ese viernes.
  assert.equal(horasDeJornada(d(7, 8), d(7, 8)), HORAS_VIERNES)
  // Rango invertido o fecha inválida es 0, no NaN: un NaN se propaga a la masa entera del semestre.
  assert.equal(horasDeJornada(d(15, 9), d(1, 9)), 0)
  assert.equal(horasDeJornada(null, d(1, 9)), 0)
  assert.equal(horasDeJornada(new Date('x'), d(1, 9)), 0)
})

test('el promedio del día hábil es 8,8 y NO lleva el sábado adentro', () => {
  // Es lo que le corresponde a `obra_canonica.jornada_horas`: el cronograma divide HH por esta cifra
  // y su calendario es `dias_habiles = {1,2,3,4,5}`. Meter el sábado obligaría a agregar el 6 a todas
  // las obras y eso mueve el cronograma entero — un efecto que el dueño NO pidió.
  assert.equal(HORAS_POR_DIA_HABIL, 8.8)
  assert.equal(HORAS_POR_DIA_HABIL * 5, HORAS_SEMANA_DECLARADA)
  assert.notEqual(HORAS_POR_DIA_HABIL * 5, HORAS_SEMANA_CON_SABADO)
})

test('la FÓRMULA dice lo mismo que el JS sobre las nueve quincenas reales', () => {
  // Dos caminos al mismo criterio. Si un día se separan, el número de la pestaña y el del log dejan
  // de ser el mismo número — que es como un control empieza a validarse contra lo que produce.
  const e = expresionHorasDeJornada({
    celdaDesde: 'A40', celdaHasta: 'B40', celdaLJ: '$B$34', celdaV: '$C$34', celdaS: '$D$34',
  })
  assert.equal(e, '(NETWORKDAYS.INTL(A40;B40;"0000111")*$B$34'
    + '+NETWORKDAYS.INTL(A40;B40;"1111011")*$C$34'
    + '+NETWORKDAYS.INTL(A40;B40;"1111101")*$D$34)')
  // Las tres máscaras son disjuntas y cubren lunes a sábado: si dos se pisaran, un día contaría dos
  // veces y el total subiría sin que nada lo diga. Se prueba sobre la máscara, carácter por carácter.
  const cuenta = (m) => m.replace(/"/g, '').split('').map(Number)
  const [lj, v, sa] = [MASCARAS.lunesAJueves, MASCARAS.viernes, MASCARAS.sabado].map(cuenta)
  for (let i = 0; i < 7; i++) {
    const cuentan = [lj[i], v[i], sa[i]].filter((x) => x === 0).length
    assert.ok(cuentan <= 1, `el día ${i} lo cuentan ${cuentan} máscaras: se sumaría dos veces`)
    // Domingo (índice 6 en la máscara, que arranca en lunes) no lo cuenta ninguna.
    if (i < 6) assert.equal(cuentan, 1, `el día ${i} no lo cuenta ninguna máscara: se pierde`)
    else assert.equal(cuentan, 0, 'el domingo no puede contar en ninguna máscara')
  }
})

test('las tres celdas son EDITABLES a propósito — el sábado es el que hay que poder corregir', () => {
  // La expresión no lleva un solo literal de horas: si el sábado fuera un número adentro de la
  // fórmula, el único de los tres que es un supuesto sólo se podría corregir tocando código.
  const e = expresionHorasDeJornada({
    celdaDesde: 'A40', celdaHasta: 'B40', celdaLJ: '$B$34', celdaV: '$C$34', celdaS: '$D$34',
  })
  for (const n of [String(HORAS_LUNES_A_JUEVES), String(HORAS_VIERNES), String(HORAS_SABADO_SUPUESTO)]) {
    assert.ok(!e.includes(`*${n}`), `la jornada quedó como literal (${n}) en vez de celda: ${e}`)
  }
  // Y el sábado se puede pisar en la versión JS con el valor que mida el dueño.
  const sinSabado = [...HORAS_POR_DIA_DE_SEMANA]
  sinSabado[6] = 0
  assert.equal(horasDeJornada(d(3, 8), d(9, 8), sinSabado), HORAS_SEMANA_DECLARADA)
})
