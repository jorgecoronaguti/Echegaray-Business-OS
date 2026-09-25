// EL PARTE DE OBRA POR VOZ. Lo que se protege acá es que nada se registre solo.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { interpretarParte, leerWav, MODELO, MODELO_DICTADO, tramosDeAudio } from './voz.mjs'

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

// ── DICTAR PARTE (25/09/2026) ──────────────────────────────────────────────────────────────────

/** Un WAV PCM16 como el que arma el navegador. */
function wav(muestras, { frecuencia = 16000, canales = 1 } = {}) {
  const datos = Buffer.alloc(muestras.length * 2)
  muestras.forEach((m, i) => datos.writeInt16LE(Math.round(m * 32767), i * 2))
  const h = Buffer.alloc(44)
  h.write('RIFF', 0); h.writeUInt32LE(36 + datos.length, 4); h.write('WAVE', 8)
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(canales, 22)
  h.writeUInt32LE(frecuencia, 24); h.writeUInt32LE(frecuencia * canales * 2, 28); h.writeUInt16LE(canales * 2, 32); h.writeUInt16LE(16, 34)
  h.write('data', 36); h.writeUInt32LE(datos.length, 40)
  return Buffer.concat([h, datos])
}

test('leerWav: el WAV del navegador vuelve a muestras en [-1, 1] con su duración', () => {
  const r = leerWav(wav(new Array(16000).fill(0).map((_, i) => (i % 2 ? 0.5 : -0.5))))
  assert.equal(r.ok, true)
  assert.equal(r.frecuencia, 16000)
  assert.equal(r.segundos, 1)
  assert.ok(Math.abs(r.muestras[0] + 0.5) < 0.001)
})

test('leerWav: un WAV cortado (tamaño de datos en 0) igual se lee; lo que no es WAV se rechaza con motivo', () => {
  const b = wav([0.1, 0.2, 0.3]); b.writeUInt32LE(0, 40)
  assert.equal(leerWav(b).muestras.length, 3)
  assert.match(leerWav(Buffer.from('OggS esto es opus')).error, /no es un WAV/)
  const f32 = wav([0.1]); f32.writeUInt16LE(3, 20)
  assert.match(leerWav(f32).error, /PCM de 16 bits/)
})

test('el modelo del dictado declara licencia CC-BY-4.0 con atribución, revisión fijada y sha256 de cada peso', () => {
  assert.equal(MODELO_DICTADO.licencia, 'CC-BY-4.0')
  assert.match(MODELO_DICTADO.atribucion, /NVIDIA/)
  assert.match(MODELO_DICTADO.revision, /^[0-9a-f]{40}$/)
  for (const h of Object.values(MODELO_DICTADO.archivos)) assert.match(h, /^[0-9a-f]{64}$/)
  assert.ok(MODELO_DICTADO.hilos <= 2, 'la VM tiene 4 núcleos y el chat vive ahí')
})

test('tramosDeAudio: 3 minutos se parten en tramos de ≤ 25 s cortando en el silencio, sin perder muestras', () => {
  const f = 1000
  const m = new Float32Array(180 * f).fill(0.5)
  for (let i = 22 * f; i < 22.3 * f; i++) m[i] = 0 // un silencio a los 22 s
  const t = tramosDeAudio(m, f)
  assert.ok(t.every(([a, b]) => b - a <= 25 * f))
  assert.equal(t[0][0], 0)
  assert.equal(t.at(-1)[1], m.length)
  for (let i = 1; i < t.length; i++) assert.equal(t[i][0], t[i - 1][1])
  assert.ok(t[0][1] >= 22 * f && t[0][1] <= 22.3 * f, `cortó en ${t[0][1]}`)
  assert.deepEqual(tramosDeAudio(new Float32Array(10 * f), f), [[0, 10 * f]])
})
