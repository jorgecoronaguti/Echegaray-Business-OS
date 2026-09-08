import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  correrQuincena, diasDeQuincena, esFechaISO, esFinDeSemana, etiquetaDiaCorta, noLaborablesDe,
  nombreDia, quincenaDe, rotuloQuincena,
} from './quincena.ts'

// LOS BORDES SON EL MÓDULO. El 1 al 15 no se equivoca nunca; lo que se equivoca es el 15→16, el
// último día de un mes que no tiene 30, y diciembre→enero. Cada uno tiene su test.

test('el 15 y el 16 caen en quincenas distintas — el corte de la liquidación', () => {
  assert.deepEqual(quincenaDe('2026-09-15'), { desde: '2026-09-01', hasta: '2026-09-15' })
  assert.deepEqual(quincenaDe('2026-09-16'), { desde: '2026-09-16', hasta: '2026-09-30' })
})

test('el fin de la segunda quincena es el último día REAL del mes, no el 30', () => {
  // El defecto que atrapa: clavar 30 y perder el 31. Un 31 fuera de la ventana son horas
  // trabajadas que no entran a la quincena que las paga.
  assert.equal(quincenaDe('2026-01-20').hasta, '2026-01-31', 'enero tiene 31')
  assert.equal(quincenaDe('2026-04-20').hasta, '2026-04-30', 'abril tiene 30')
  assert.equal(quincenaDe('2026-02-20').hasta, '2026-02-28', 'febrero de año común')
  assert.equal(quincenaDe('2028-02-20').hasta, '2028-02-29', 'febrero bisiesto')
})

test('SIGUIENTE desde la segunda quincena cruza el año, y ANTERIOR vuelve', () => {
  // El defecto que atrapa: «siguiente» sumando 15 días. Desde el 16 de enero eso cae el 31 —la
  // MISMA quincena— y el botón deja de mover la pantalla sin dar ningún error.
  const dic2 = quincenaDe('2026-12-20')
  assert.deepEqual(dic2, { desde: '2026-12-16', hasta: '2026-12-31' })
  const ene1 = correrQuincena(dic2, 1)
  assert.deepEqual(ene1, { desde: '2027-01-01', hasta: '2027-01-15' })
  assert.deepEqual(correrQuincena(ene1, -1), dic2, 'y volver deja exactamente donde estaba')
})

test('correr desde una primera quincena cae en la segunda del mismo mes, y al revés', () => {
  assert.deepEqual(correrQuincena(quincenaDe('2026-02-03'), 1), { desde: '2026-02-16', hasta: '2026-02-28' })
  assert.deepEqual(correrQuincena(quincenaDe('2026-03-02'), -1), { desde: '2026-02-16', hasta: '2026-02-28' })
})

test('correr varias quincenas seguidas no se desincroniza con los meses cortos', () => {
  // Dos saltos desde la 1ª de febrero tienen que dar la 1ª de marzo: es lo que rompe cualquier
  // aritmética de «+15 días» apenas pasa por un mes de 28.
  assert.deepEqual(correrQuincena(quincenaDe('2026-02-05'), 2), { desde: '2026-03-01', hasta: '2026-03-15' })
  assert.equal(correrQuincena(quincenaDe('2026-02-05'), 0).desde, '2026-02-01', '0 no mueve nada')
})

test('los días son uno por columna y el largo depende del mes', () => {
  assert.equal(diasDeQuincena(quincenaDe('2026-09-03')).length, 15, 'la primera siempre son 15')
  assert.equal(diasDeQuincena(quincenaDe('2026-01-20')).length, 16, 'la segunda de un mes de 31')
  assert.equal(diasDeQuincena(quincenaDe('2026-09-20')).length, 15, 'la segunda de un mes de 30')
  assert.equal(diasDeQuincena(quincenaDe('2026-02-20')).length, 13, 'la segunda de febrero común')
  assert.equal(diasDeQuincena(quincenaDe('2028-02-20')).length, 14, 'la segunda de febrero bisiesto')
  const dias = diasDeQuincena(quincenaDe('2026-09-01'))
  assert.equal(dias[0], '2026-09-01')
  assert.equal(dias[14], '2026-09-15')
})

test('EL SÁBADO Y EL DOMINGO NO SE RECLAMAN — entran a los no laborables', () => {
  // El defecto que atrapa: pasar de una grilla L-V a una de quincena y que cada fin de semana sin
  // marcar se pinte en rojo como «alguien se olvidó de cargar esto». Son cuatro días falsos por
  // quincena, en todas las filas.
  const dias = diasDeQuincena(quincenaDe('2026-09-01'))
  const noLab = new Set(noLaborablesDe(dias, ['2026-09-08']))
  assert.ok(noLab.has('2026-09-05'), 'el sábado 5')
  assert.ok(noLab.has('2026-09-06'), 'el domingo 6')
  assert.ok(noLab.has('2026-09-12') && noLab.has('2026-09-13'), 'el otro fin de semana')
  assert.ok(noLab.has('2026-09-08'), 'el feriado declarado sigue estando')
  assert.ok(!noLab.has('2026-09-09'), 'un miércoles cualquiera NO es no laborable')
  assert.equal(noLab.size, 5, 'cuatro de fin de semana más el feriado, sin duplicar')
})

test('esFinDeSemana distingue el viernes del sábado', () => {
  assert.equal(esFinDeSemana('2026-09-04'), false, 'viernes')
  assert.equal(esFinDeSemana('2026-09-05'), true, 'sábado')
  assert.equal(esFinDeSemana('2026-09-06'), true, 'domingo')
  assert.equal(esFinDeSemana('2026-09-07'), false, 'lunes')
})

test('la etiqueta de columna es la letra y el número, sin cero adelante', () => {
  assert.equal(etiquetaDiaCorta('2026-09-01'), 'M 1', 'el 1 de septiembre de 2026 es martes')
  assert.equal(etiquetaDiaCorta('2026-09-07'), 'L 7')
  // Martes y miércoles comparten la M A PROPÓSITO: el número los separa y el nombre completo va en
  // el `title` de la columna. Inventar una X para el miércoles sería una convención de España.
  assert.equal(etiquetaDiaCorta('2026-09-30'), 'M 30')
  assert.equal(nombreDia('2026-09-30'), 'miércoles', 'el nombre completo desambigua la letra')
  assert.equal(nombreDia('2026-09-29'), 'martes')
})

test('el rótulo dice qué quincena es y con qué números cierra', () => {
  assert.equal(rotuloQuincena(quincenaDe('2026-09-03')), '1ª quincena de septiembre · 1 al 15')
  assert.equal(rotuloQuincena(quincenaDe('2026-09-20')), '2ª quincena de septiembre · 16 al 30')
  assert.equal(rotuloQuincena(quincenaDe('2026-01-20')), '2ª quincena de enero · 16 al 31')
  assert.equal(rotuloQuincena(quincenaDe('2026-02-20')), '2ª quincena de febrero · 16 al 28')
})

test('lo que llega por la URL se valida antes de usarlo como fecha', () => {
  assert.equal(esFechaISO('2026-09-16'), true)
  assert.equal(esFechaISO('2026-13-01'), false, 'un mes 13 no es una fecha')
  assert.equal(esFechaISO('16/09/2026'), false)
  assert.equal(esFechaISO(''), false)
  assert.equal(esFechaISO(undefined), false)
  assert.equal(esFechaISO(20260916), false)
})
