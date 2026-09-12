// LA CAMPANITA DEL HEADER, PROBADA SIN NAVEGADOR.
//
// El defecto que estas pruebas atrapan es el que el propio `AppHeader` denunciaba antes de que la
// campanita existiera: *"un punto rojo permanentemente apagado —o peor, permanentemente prendido—
// sería un dato inventado en el lugar más visible del OS"*.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  cuantasNovedades, edadDeLaLectura, estadoDeCampana, hayPunto, leyendaCampana, sirveLoGuardado,
  type NovedadesGuardadas,
} from './novedades.ts'
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

// ═══ EL CACHÉ DE UN MINUTO, Y LO QUE NO PUEDE HACER (12/09/2026) ═══
//
// El defecto que atrapan: que la campanita reuse una lectura que no debía reusar. Las tres formas de
// equivocarse son reusar un ERROR (repetir un minuto una ignorancia ya resuelta), reusar algo VIEJO
// (un punto rojo que afirma un pendiente que ya se arregló), y tratar una edad NEGATIVA como si
// fuera recién leída. Revertir `sirveLoGuardado` a un `edad < ttl` pelado pone rojo el caso del
// reloj para atrás; sacarle el chequeo de `ok` pone rojo el del error.
const guardadas = (en: number, chips: ChipAtencion[] = []) =>
  ({ en, lectura: { ok: true as const, chips, noLeida: false } })

test('una lectura del último minuto se reusa; una de hace más, no', () => {
  const ahora = 1_000_000
  assert.equal(sirveLoGuardado(guardadas(ahora - 59_000), ahora), true)
  assert.equal(sirveLoGuardado(guardadas(ahora - 60_001), ahora), false)
  assert.equal(sirveLoGuardado(guardadas(ahora), ahora), true)
})

test('un error NUNCA se reusa: la ignorancia no se cachea', () => {
  const ahora = 1_000_000
  const conError = { en: ahora, lectura: { ok: false, error: 'sin base' } }
  assert.equal(sirveLoGuardado(conError as unknown as NovedadesGuardadas, ahora), false)
})

test('sin nada guardado, o con basura, se pide la lectura', () => {
  assert.equal(sirveLoGuardado(null, 1_000_000), false)
  assert.equal(sirveLoGuardado({ en: 'ayer' } as unknown as NovedadesGuardadas, 1_000_000), false)
})

test('un reloj que fue para atrás no vuelve fresquísima una lectura vieja', () => {
  // La máquina estuvo suspendida y al despertar el reloj quedó detrás de cuando se guardó. Una edad
  // negativa es DESCONOCIDA, no cero.
  assert.equal(sirveLoGuardado(guardadas(2_000_000), 1_000_000), false)
})

test('la edad se declara en segundos, y no se declara si la lectura es de este instante', () => {
  const ahora = 1_000_000
  assert.equal(edadDeLaLectura(guardadas(ahora - 42_000), ahora), 'hace 42 s')
  assert.equal(edadDeLaLectura(guardadas(ahora - 900), ahora), null)
  assert.equal(edadDeLaLectura(null, ahora), null)
})
