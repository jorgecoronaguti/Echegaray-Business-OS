// LOS DOS CUADROS DE LA QUINCENA, SIN MONTAR REACT. Atrapan:
//
//  1. Que se vaya una columna pedida por el dueño («lo pedido no se quita», 16/09/2026): Efect. red., Saldo red.,
//     Presentismo, Pagado y Saldo de cada lado.
//  2. Que una columna quede fuera de su bloque o los bloques no cubran la grilla entera (el rótulo de un bloque sobre
//     columnas de otro: la queja del 17/09).
//  3. Que el cuadro de mensuales vuelva a tener grilla de días o columnas por hora.
//  4. Que el salto marque el bloque equivocado al final de la cinta.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CUADRO_JORNALEROS, CUADRO_MENSUALES, DIA, GAP, bloqueEnVista, columnasDe, desplazamientoHasta, tramosDeBloques,
} from './columnasDelCuadro.ts'

const rotulos = (cols: readonly { rotulo: string }[]) => cols.map((c) => c.rotulo.replace(' ✎', ''))

test('JORNALEROS: horas · recibo blanco (5) · recibo negro (5) · resto, en el orden de la planilla', () => {
  const por = (b: string) => rotulos(CUADRO_JORNALEROS.columnas.filter((c) => c.bloque === b))
  assert.deepEqual(CUADRO_JORNALEROS.bloques.map((b) => b.clave), ['horas', 'blanco', 'negro', 'resto'])
  assert.deepEqual(por('horas'), ['Horas'])
  assert.deepEqual(por('blanco'), ['Hs recibo', '$/h cat.', 'Banco', 'Pagado', 'Saldo'])
  assert.deepEqual(por('negro'), ['Hs', '$/h negro', 'Importe', 'Pagado', 'Saldo'])
  assert.deepEqual(por('resto'), ['Presentismo', 'Efect. red.', 'Total', 'Pagado', 'Saldo', 'Saldo red.'])
  // Las columnas que el dueño sacó no vuelven.
  for (const muerta of ['Adelanto banco / embargos', 'Adelanto efectivo', 'Total efectivo', 'Cobra total', 'Cliente']) {
    assert.ok(!rotulos(CUADRO_JORNALEROS.columnas).includes(muerta), muerta)
  }
})

test('MENSUALES: sin días ni columnas por hora; sueldo · recibo blanco · efectivo · el mismo resto', () => {
  assert.equal(CUADRO_MENSUALES.bloqueDeLosDias, null)
  assert.ok(!/repeat\(/.test(columnasDe(CUADRO_MENSUALES, 15)), 'MUTACIÓN: volver a dibujar los días en mensuales')
  const todas = rotulos(CUADRO_MENSUALES.columnas)
  for (const porHora of ['Hs recibo', '$/h cat.', 'Hs', '$/h negro', 'Horas']) assert.ok(!todas.includes(porHora), porHora)
  assert.deepEqual(rotulos(CUADRO_MENSUALES.columnas.filter((c) => c.bloque === 'resto')),
    rotulos(CUADRO_JORNALEROS.columnas.filter((c) => c.bloque === 'resto')), 'lo pedido para el resto vale para los dos')
  assert.deepEqual(rotulos(CUADRO_MENSUALES.columnas.filter((c) => c.bloque === 'blanco')), ['Banco', 'Pagado', 'Saldo'])
  assert.deepEqual(rotulos(CUADRO_MENSUALES.columnas.filter((c) => c.bloque === 'efectivo')), ['Importe', 'Pagado', 'Saldo'])
})

test('los bloques cubren la grilla entera, contiguos y sin solaparse', () => {
  for (const [def, dias] of [[CUADRO_JORNALEROS, 13], [CUADRO_MENSUALES, 13]] as const) {
    const tramos = tramosDeBloques(def, dias)
    const pistas = (def.bloqueDeLosDias ? dias : 0) + def.columnas.length
    assert.equal(tramos.reduce((s, t) => s + t.span, 0), pistas, 'MUTACIÓN: una columna fuera de orden deja un hueco')
    assert.equal(tramos[0].inicio, 2)
    for (let i = 1; i < tramos.length; i++) assert.equal(tramos[i].inicio, tramos[i - 1].inicio + tramos[i - 1].span)
    for (let i = 1; i < tramos.length; i++) assert.equal(tramos[i].desde, tramos[i - 1].desde + tramos[i - 1].ancho + GAP)
  }
  const [horas] = tramosDeBloques(CUADRO_JORNALEROS, 13)
  assert.equal(horas.ancho, 13 * DIA + 72 + 13 * GAP, 'el bloque Horas incluye los días')
})

test('el salto lleva cada bloque pegado a Persona, y marca el que más se ve (también al final de la cinta)', () => {
  const tramos = tramosDeBloques(CUADRO_JORNALEROS, 13)
  assert.equal(desplazamientoHasta(tramos[0], true), 0)
  assert.equal(desplazamientoHasta(tramos[2], false), tramos[2].desde - GAP)
  assert.equal(bloqueEnVista(tramos, 0, 1100), 'horas')
  assert.equal(bloqueEnVista(tramos, desplazamientoHasta(tramos[2], false), 1100), 'negro')
  // AL FINAL: Resto no llega a pegarse a Persona, pero es el que ocupa la pantalla. MUTACIÓN: «el último que pasó».
  const resto = tramos[3]
  const fin = resto.desde + resto.ancho - 1100
  assert.ok(fin < desplazamientoHasta(resto, false))
  assert.equal(bloqueEnVista(tramos, fin, 1100), 'resto')
  assert.equal(bloqueEnVista(tramos, 500, 0), 'horas', 'sin ancho medido, el primero')
})
