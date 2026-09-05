// EL PARTE DE OBRA POR VOZ. Lo que se protege acá es que nada se registre solo.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { interpretarParte, MODELO } from './voz.mjs'

const PARTE = 'Hoy terminamos bases B1. Trabajaron Ochoa y Castillo ocho horas. Faltó hierro del ocho y estuvimos parados una hora.'

test('el parte del ejemplo real se descompone entero', () => {
  const r = interpretarParte(PARTE)
  assert.deepEqual(r.horas.map((h) => h.valor), [8, 1])
  assert.deepEqual(r.personas.map((p) => p.nombre), ['Ochoa', 'Castillo'])
  assert.equal(r.avances.length, 1)
  assert.equal(r.impedimentos.length, 2)
})

test('«Faltó» se detecta como impedimento y NO como persona', () => {
  // Defecto real: el `\b` final de la regex es ASCII y no cierra después de la «ó», así que la
  // frase «Faltó hierro del ocho» —que la regex nombra explícitamente— daba false. Y el patrón de
  // nombres sin acentos en el cuerpo partía «Faltó» en «Falt» y lo metía como apellido.
  const r = interpretarParte('Faltó hierro del ocho.')
  assert.equal(r.impedimentos.length, 1)
  assert.equal(r.personas.length, 0)
})

test('NADA de esto es un registro: sale marcado como propuesta', () => {
  // Ocho horas dichas al pasar no pueden convertirse solas en ocho HH imputadas con su costo. Si
  // el modelo entendió «ocho» donde el jefe dijo «nueve», nadie se entera hasta la liquidación.
  const r = interpretarParte(PARTE)
  assert.equal(r.estado, 'propuesta')
  assert.match(r.porQue, /confirme/)
})

test('las horas en número también se leen', () => {
  assert.deepEqual(interpretarParte('estuvieron 9 hs y 4,5 horas').horas.map((h) => h.valor), [9, 4.5])
})

test('un parte vacío no inventa nada', () => {
  const r = interpretarParte('')
  assert.deepEqual(r.horas, [])
  assert.deepEqual(r.personas, [])
  assert.equal(r.estado, 'propuesta')
})

test('el modelo declara su licencia y su revisión: sin eso no puede ir a producción', () => {
  assert.ok(MODELO.revision)
  assert.match(MODELO.licencia, /Apache/)
  assert.ok(MODELO.discoMb < 300, 'en una VM de 7 GB, 547 MB compiten por memoria con Postgres')
})
