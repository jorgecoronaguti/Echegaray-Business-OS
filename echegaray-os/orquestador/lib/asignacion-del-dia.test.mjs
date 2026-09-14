// LA CRONOLOGÍA DEL EMPLEADO DECIDE ENTRE VARIAS ASIGNACIONES (dueño, 14/09/2026).
//
// MUTACIONES QUE PONEN ESTO ROJO: elegir la más larga en vez de la más corta; ignorar el desempate por
// `desde`; decidir un empate total por el orden del array.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { obraDeLaAsignacionDelDia as obra } from './asignacion-del-dia.mjs'

test('Reta 09/09: un día en Messina gana contra Quattropani abierta', () => {
  const tramos = [
    { obra: 'quattropani', desde: '2026-09-08', hasta: null },
    { obra: 'messina-playon-dilucion-acido', desde: '2026-09-09', hasta: '2026-09-09' },
  ]
  assert.equal(obra(tramos, '2026-09-09'), 'messina-playon-dilucion-acido')
  assert.equal(obra(tramos, '2026-09-10'), 'quattropani', 'fuera del día suelto sigue la abierta')
})

test('Zogbe: el día suelto gana dentro de un rango cerrado, aunque el rango empiece después', () => {
  const tramos = [
    { obra: 'la-estrella', desde: '2026-09-03', hasta: '2026-09-03' },
    { obra: 'le-galpon-9', desde: '2026-08-20', hasta: '2026-09-07' },
  ]
  assert.equal(obra(tramos, '2026-09-03'), 'la-estrella')
  // La más corta manda aunque su `desde` sea MÁS VIEJO: el criterio 1 va antes que el 2.
  const corta = [
    { obra: 'corta', desde: '2026-09-01', hasta: '2026-09-05' },
    { obra: 'larga', desde: '2026-09-02', hasta: '2026-09-30' },
  ]
  assert.equal(obra(corta, '2026-09-03'), 'corta')
})

test('dos abiertas con distinto desde: la más reciente', () => {
  const tramos = [
    { obra: 'nueva', desde: '2026-09-02', hasta: null },
    { obra: 'vieja', desde: '2026-09-01', hasta: null },
  ]
  assert.equal(obra(tramos, '2026-09-10'), 'nueva')
  assert.equal(obra([...tramos].reverse(), '2026-09-10'), 'nueva', 'no depende del orden')
})

test('dos cerradas de igual duración: la de desde más reciente', () => {
  const tramos = [
    { obra: 'a', desde: '2026-09-01', hasta: '2026-09-05' },
    { obra: 'b', desde: '2026-09-03', hasta: '2026-09-07' },
  ]
  assert.equal(obra(tramos, '2026-09-04'), 'b')
})

test('empate total entre obras distintas: null, en cualquier orden', () => {
  const tramos = [
    { obra: 'a', desde: '2026-09-01', hasta: null },
    { obra: 'b', desde: '2026-09-01', hasta: null },
  ]
  assert.equal(obra(tramos, '2026-09-10'), null)
  assert.equal(obra([...tramos].reverse(), '2026-09-10'), null)
})

test('misma obra repetida no es ambigüedad; sin tramo que cubra, null; sin desde es abierto', () => {
  assert.equal(obra([{ obra: 'a', desde: '2026-09-01', hasta: null }, { obra: 'a', desde: '2026-09-01', hasta: null }], '2026-09-02'), 'a')
  assert.equal(obra([{ obra: 'a', desde: '2026-09-01', hasta: '2026-09-02' }], '2026-09-03'), null)
  assert.equal(obra([{ obra: 'a', desde: null, hasta: null }, { obra: 'b', desde: '2026-09-01', hasta: '2026-09-30' }], '2026-09-03'), 'b')
})

// ═══ GANA LA CARGA POSTERIOR (dueño, 14/09/2026) — los tres casos reales, con su `creado_en` ═══

test('RETA 09/09 → Quattropani: el día en Messina se cargó ANTES que Quattropani desde el mismo día', () => {
  const tramos = [
    { obra: 'messina-playon-dilucion-acido', desde: '2026-09-09', hasta: '2026-09-09', creado_en: '2026-09-08T19:06:41.811Z' },
    { obra: 'quattropani', desde: '2026-09-09', hasta: null, creado_en: '2026-09-09T14:06:09.328Z' },
  ]
  assert.equal(obra(tramos, '2026-09-09'), 'quattropani')
  assert.equal(obra([...tramos].reverse(), '2026-09-09'), 'quattropani', 'no depende del orden')
})

test('QUIROGA A. 09/09 → Messina: el día en Quattropani se cargó antes', () => {
  const tramos = [
    { obra: 'quattropani', desde: '2026-09-09', hasta: '2026-09-09', creado_en: '2026-09-08T19:09:49.224Z' },
    { obra: 'messina-playon-dilucion-acido', desde: '2026-09-09', hasta: null, creado_en: '2026-09-09T14:08:04.155Z' },
  ]
  assert.equal(obra(tramos, '2026-09-09'), 'messina-playon-dilucion-acido')
})

test('MALDONADO 08/09 → Quattropani: tres segundos después también es después (Date de pg)', () => {
  const tramos = [
    { obra: 'entrepiso-y-escalera', desde: '2026-09-08', hasta: '2026-09-08', creado_en: new Date('2026-09-08T15:23:28.655Z') },
    { obra: 'quattropani', desde: '2026-09-08', hasta: null, creado_en: new Date('2026-09-08T15:23:31.641Z') },
  ]
  assert.equal(obra(tramos, '2026-09-08'), 'quattropani')
})

test('el día suelto cargado DESPUÉS del tramo largo sigue ganando: es la excepción a propósito', () => {
  const tramos = [
    { obra: 'quattropani', desde: '2026-09-09', hasta: null, creado_en: '2026-09-09T10:00:00Z' },
    { obra: 'messina', desde: '2026-09-09', hasta: '2026-09-09', creado_en: '2026-09-09T12:00:00Z' },
  ]
  assert.equal(obra(tramos, '2026-09-09'), 'messina')
})

test('sin creado_en la regla es la de antes: el día suelto gana', () => {
  const tramos = [
    { obra: 'messina', desde: '2026-09-09', hasta: '2026-09-09', creado_en: '2026-09-08T19:06:41Z' },
    { obra: 'quattropani', desde: '2026-09-09', hasta: null },
  ]
  assert.equal(obra(tramos, '2026-09-09'), 'messina')
})

test('AGÜERO 08/09: tres días sueltos del mismo día → el último cargado; si a uno le falta creado_en, null', () => {
  const tramos = [
    { obra: 'quattropani', desde: '2026-09-08', hasta: '2026-09-08', creado_en: '2026-09-08T15:54:56Z' },
    { obra: 'pisos-industriales', desde: '2026-09-08', hasta: '2026-09-08', creado_en: '2026-09-08T15:55:14Z' },
    { obra: 'messina-playon-dilucion-acido', desde: '2026-09-08', hasta: '2026-09-08', creado_en: '2026-09-08T19:59:24Z' },
  ]
  assert.equal(obra(tramos, '2026-09-08'), 'messina-playon-dilucion-acido')
  assert.equal(obra([...tramos.slice(0, 2), { ...tramos[2], creado_en: null }], '2026-09-08'), null)
})

test('fechas que llegan como Date de pg (03:00Z) desempatan igual que las ISO', () => {
  const d = (s) => new Date(`${s}T03:00:00Z`)
  const tramos = [
    { obra: 'quattropani', desde: d('2026-09-08'), hasta: null },
    { obra: 'messina', desde: d('2026-09-09'), hasta: d('2026-09-09') },
  ]
  assert.equal(obra(tramos, '2026-09-09'), 'messina')
  assert.equal(obra(tramos, '2026-09-10'), 'quattropani')
})
