// EL FORMATO DE LOS NÚMEROS DEL PRESUPUESTO.
//
// ═══ LOS DEFECTOS QUE ATRAPA ═══
//
// 1. `pct()` de `@/shared/utils/format` escribe `17,0%` SIN espacio. El contrato visual pide
//    `17,0 %`. Si alguien reemplaza estas funciones por las compartidas «porque ya existen», estos
//    tests se ponen rojos antes de que el cambio llegue a una pantalla.
// 2. Un `0` que llega como cero de verdad tiene que escribirse. Lo que NO se escribe es el `null`,
//    y la diferencia entre los dos es toda la regla «NULL nunca es cero».
// 3. Las HH van sin decimales y el rendimiento con DOS. Es la misma familia de número y se
//    escriben distinto a propósito: 73 HH y 34,00 hs/m³.

import test from 'node:test'
import assert from 'node:assert/strict'
import { aNumero, plata, importe, porcentaje, porcentajeDeFraccion, cantidad, hh, rendimiento, fecha } from './formato.ts'

test('el importe se escribe con puntos de miles y el signo separado', () => {
  assert.equal(plata(165526633), '$ 165.526.633')
  assert.equal(importe(926763), '926.763')
})

test('null NO es cero: no se escribe, se devuelve null para que la pantalla diga la ausencia', () => {
  assert.equal(plata(null), null)
  assert.equal(importe(undefined), null)
  assert.equal(hh(null), null)
  assert.equal(cantidad(null), null)
  assert.equal(rendimiento(null), null)
  assert.equal(porcentaje(null), null)
})

test('un cero REAL sí se escribe: es una afirmación de quien lo cargó, no una ausencia', () => {
  assert.equal(plata(0), '$ 0')
  assert.equal(hh(0), '0')
  assert.equal(porcentajeDeFraccion(0), '0,0 %')
})

test('el porcentaje lleva ESPACIO antes del signo — el defecto que trae pct() de shared', () => {
  assert.equal(porcentajeDeFraccion(0.17), '17,0 %')
  assert.equal(porcentajeDeFraccion(0.035, 'auto'), '3,5 %')
  assert.equal(porcentajeDeFraccion(0.12, 'auto'), '12 %')
  assert.equal(porcentaje(16.4), '16,4 %')
})

test('porcentajeDeFraccion recibe la FRACCIÓN y porcentaje la escala 0-100: no se confunden', () => {
  assert.equal(porcentajeDeFraccion(0.17), '17,0 %')
  assert.equal(porcentaje(0.17), '0,2 %')
})

test('las HH van sin decimales y el rendimiento con dos, aunque sean el mismo tipo de dato', () => {
  assert.equal(hh(73.44), '73')
  assert.equal(rendimiento(34), '34,00')
  assert.equal(rendimiento(37.1), '37,10')
})

test('la cantidad conserva hasta 4 decimales: a 4 redondea el control de la base', () => {
  assert.equal(cantidad(2.16), '2,16')
  assert.equal(cantidad(1.0833), '1,0833')
  assert.equal(cantidad(1000), '1.000')
})

test('un numeric que llega como texto se lee igual que si llegara como número', () => {
  assert.equal(aNumero('926763.44'), 926763.44)
  assert.equal(aNumero(''), null)
  assert.equal(aNumero('sin dato'), null)
  assert.equal(aNumero(Number.NaN), null)
  assert.equal(plata(aNumero('926763.44')), '$ 926.763')
})

test('la fecha se escribe DD/MM/AAAA y una fecha rota no se convierte en hoy', () => {
  assert.equal(fecha('2026-02-28'), '28/02/2026')
  assert.equal(fecha(null), null)
  assert.equal(fecha('nunca'), null)
})
