// UN CAMPO NUMÉRICO VACÍO NO ES UN CERO.
//
// ═══ EL DEFECTO, ENCONTRADO EL 19/08/2026 ═══
//
// `z.union([z.coerce.number().nonnegative(), z.literal('')])` valida en ORDEN y devuelve la primera
// opción que pasa. Un `<input type="number">` que nadie tocó manda `''`; `Number('')` da 0; y
// `.nonnegative()` lo acepta. Resultado: un contrato sin cargar se guardaba como **un contrato de
// $0**, y una actividad con el campo de HH vacío quedaba con **0 horas planificadas**.
//
// El daño no es el cero: es que el cero después se SUMA. Un checklist que cuenta «actividades con
// HH plan» las cuenta; un margen que divide por el contratado divide por cero; y nadie ve un error
// porque 0 es un número perfectamente válido. Es la regla de oro «no usar 0 para representar
// ausencia», rota por el orden de dos líneas.
//
// Este test no importa el esquema —vive en un módulo de servidor de Next, con `'use server'`—: fija
// el COMPORTAMIENTO de la construcción, que es lo que se rompió y lo que se puede volver a romper.

import test from 'node:test'
import assert from 'node:assert/strict'
import { z } from 'zod'

/** La construcción MALA, tal como estaba. Se conserva para poder demostrar el defecto. */
const malo = z.union([z.coerce.number().nonnegative(), z.literal('')]).optional()

/** La construcción BUENA: el vacío se reconoce ANTES de intentar convertirlo en número. */
const bueno = z.union([z.literal(''), z.coerce.number().nonnegative()]).optional()

test('el orden mal puesto convierte un campo vacío en un cero', () => {
  // Si esto alguna vez deja de pasar, es que Zod cambió y el resto del test hay que releerlo.
  assert.equal(malo.parse(''), 0, 'el defecto ya no se reproduce: revisar la versión de Zod')
})

test('con el orden bueno, el vacío sigue siendo vacío', () => {
  assert.equal(bueno.parse(''), '')
  assert.equal(bueno.parse(undefined), undefined)
})

test('y el orden bueno no rompe ningún número real', () => {
  assert.equal(bueno.parse('0'), 0, 'un cero TIPEADO sí es un cero')
  assert.equal(bueno.parse('9000000'), 9000000)
  assert.equal(bueno.parse('12.5'), 12.5)
  assert.throws(() => bueno.parse('-1'), 'un negativo tiene que seguir siendo rechazado')
})

test('el esquema de las obras usa el orden bueno', async () => {
  // La evidencia es del EFECTO: se lee el archivo que corre en producción, no una copia del patrón.
  const fs = await import('node:fs')
  const url = new URL('../../src/features/obras/services/actions.ts', import.meta.url)
  const src = fs.readFileSync(url, 'utf8')
  assert.match(src, /const numOpt = z\.union\(\[z\.literal\(''\), z\.coerce\.number\(\)/,
    'actions.ts volvió a poner z.coerce.number() adelante: el vacío vuelve a guardarse como 0')
})
