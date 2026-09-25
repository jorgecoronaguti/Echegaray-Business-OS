import { test } from 'node:test'
import assert from 'node:assert/strict'
import { codificarWav, motivoSinMicrofono, nivel, remuestrear, unir } from './wavDelNavegador.ts'

test('48 kHz → 16 kHz: un tercio de las muestras, promediadas', () => {
  const m = new Float32Array(48000).fill(0.3)
  const r = remuestrear(m, 48000)
  assert.equal(r.length, 16000)
  assert.ok(Math.abs(r[100] - 0.3) < 1e-6)
  assert.equal(remuestrear(m, 16000, 16000), m)
  assert.equal(remuestrear(new Float32Array(44100), 44100).length, 16000)
})

test('el WAV lleva la cabecera que lee la VM: RIFF/WAVE, PCM 1, mono, 16 kHz, 16 bits', () => {
  const w = codificarWav(unir([new Float32Array([0, 0.5]), new Float32Array([-1, 1])]))
  const v = new DataView(w.buffer)
  const txt = (o: number) => String.fromCharCode(...w.slice(o, o + 4))
  assert.equal(txt(0), 'RIFF'); assert.equal(txt(8), 'WAVE'); assert.equal(txt(36), 'data')
  assert.equal(v.getUint16(20, true), 1); assert.equal(v.getUint16(22, true), 1)
  assert.equal(v.getUint32(24, true), 16000); assert.equal(v.getUint16(34, true), 16)
  assert.equal(v.getUint32(40, true), 8)
  assert.equal(w.length, 52)
  assert.equal(v.getInt16(48, true), -32768)
  assert.equal(v.getInt16(50, true), 32767)
})

test('la onda: silencio es 0, voz fuerte satura en 1', () => {
  assert.equal(nivel(new Float32Array(100)), 0)
  assert.equal(nivel(new Float32Array(100).fill(0.9)), 1)
})

test('sin micrófono se dice por qué y qué hacer', () => {
  assert.match(motivoSinMicrofono('NotAllowedError', true, true), /Permitir/)
  assert.match(motivoSinMicrofono(undefined, false, true), /https/)
  assert.match(motivoSinMicrofono('NotFoundError', true, true), /No encontré/)
})
