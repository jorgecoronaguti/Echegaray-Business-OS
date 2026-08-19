import test from 'node:test'
import assert from 'node:assert/strict'
import { anosACubrir, ARCHIVO_FISCAL, SUBCARPETA } from './impuestos-fuentes.mjs'

// POR QUÉ ESTE TEST. El 19/08/2026 el cuadro publicó $13.531.705 de impuesto "a pagar" —IVA
// $11.328.238 e IIBB $2.203.467— que YA estaban presentados en cero. No falló ningún cálculo:
// las carpetas de las que se leen las DDJJ se habían quedado en 06-2026 y el cuadro, sin dato,
// proyectó. La defensa contra que vuelva a pasar es que la carpeta se RESUELVA por año en cada
// corrida en vez de estar escrita a mano.

test('se mira el año en curso, y el anterior SÓLO en enero', () => {
  // Fuera de enero, un año y nada más: el cuadro es de un año calendario y traer el anterior
  // metería doce meses ajenos en la réplica y en el cuadro.
  assert.deepEqual(anosACubrir(new Date('2026-08-19')), ['2026'])
  assert.deepEqual(anosACubrir(new Date('2026-12-31')), ['2026'])
  // En enero sí: la DDJJ de diciembre se presenta en enero y se archiva en el año que cerró.
  assert.deepEqual(anosACubrir(new Date('2027-01-05')), ['2026', '2027'])
})

test('la raíz es el archivo fiscal de la empresa, no una carpeta suelta', () => {
  // Si alguien vuelve a apuntar a una copia, este test no lo va a impedir — pero deja escrito cuál
  // es la carpeta buena, que es el dato que se perdió la vez pasada.
  assert.equal(ARCHIVO_FISCAL, '1-7RmmzQeJA2g2O7GqZi4o_WQtiTQLc7l')
  assert.deepEqual(SUBCARPETA, { IIBB: 'IIBB', IVA: 'IVA' })
})
