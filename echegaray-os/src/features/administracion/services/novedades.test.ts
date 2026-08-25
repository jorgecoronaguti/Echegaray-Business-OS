// LA CAMPANITA DEL HEADER, PROBADA SIN NAVEGADOR.
//
// El defecto que estas pruebas atrapan es el que el propio `AppHeader` denunciaba antes de que la
// campanita existiera: *"un punto rojo permanentemente apagado —o peor, permanentemente prendido—
// sería un dato inventado en el lugar más visible del OS"*.

import test from 'node:test'
import assert from 'node:assert/strict'
import { cuantasNovedades, estadoDeCampana, hayPunto, leyendaCampana } from './novedades.ts'
import type { ChipAtencion } from './homeAdministracion.ts'

const chip = (clave: string, numero: number): ChipAtencion => ({
  clave, numero, texto: clave, href: '/x', tono: 'warn',
})

test('el punto se prende SÓLO con un pendiente medido', () => {
  assert.equal(hayPunto(estadoDeCampana({ ok: true, chips: [chip('a', 3)], noLeida: false })), true)
  assert.equal(hayPunto(estadoDeCampana({ ok: true, chips: [], noLeida: false })), false)
})

test('mientras no contestó el servidor la campanita NO afirma nada', () => {
  // El defecto: pintar el punto en el primer render «por si acaso» lo deja prendido en todas las
  // pantallas de todos los usuarios, y a la semana nadie lo mira.
  assert.equal(estadoDeCampana(null), 'sin_pedir')
  assert.equal(hayPunto('sin_pedir'), false)
  assert.equal(leyendaCampana('sin_pedir', null), 'Leyendo…')
})

test('un error NO enciende el punto, pero tampoco se calla', () => {
  const e = estadoDeCampana({ ok: false, error: 'permission denied for table proveedores' })
  assert.equal(e, 'error')
  assert.equal(hayPunto(e), false, 'un no-sé no es una alarma')
  assert.equal(leyendaCampana(e, 'permission denied for table proveedores'), 'permission denied for table proveedores')
})

test('si NINGUNA fuente se pudo leer, la campanita no dice «al día»', () => {
  // `noLeida` es lo que distingue «no hay nada pendiente» de «no pude mirar»: sin esto las dos se
  // dibujan como una campanita apagada.
  const e = estadoDeCampana({ ok: true, chips: [], noLeida: true })
  assert.equal(e, 'sin_lectura')
  assert.notEqual(e, 'al_dia')
  assert.match(leyendaCampana(e, null) ?? '', /NO quiere decir que no haya nada pendiente/)
})

test('el número es la suma de lo pendiente, no la cantidad de chips', () => {
  assert.equal(cuantasNovedades([chip('sin-cuit', 14), chip('duplicados', 1)]), 15)
  assert.equal(cuantasNovedades([]), 0)
})
