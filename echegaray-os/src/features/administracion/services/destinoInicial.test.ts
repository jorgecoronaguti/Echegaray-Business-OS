import { test } from 'node:test'
import assert from 'node:assert/strict'
import { obraDestinoInicial } from './destinoInicial.ts'

const ACTIVAS = [{ id: 'pisos-industriales' }, { id: 'quattropani' }]

test('LA OBRA DEL TRAMO MANDA SI ESTÁ ACTIVA', () => {
  assert.equal(obraDestinoInicial('quattropani', 'pisos-industriales', ACTIVAS), 'quattropani')
})

test('HORAS EN UNA OBRA NO ACTIVA: el panel NO propone otra obra en silencio', () => {
  // Antes el <select> caía a la primera opción y la pantalla decía «PISOS INDUSTRIALES» mientras las
  // horas eran de MAMPOSTERÍA. Sin default no hay destino fingido: hay que elegir.
  assert.equal(obraDestinoInicial('sf-mamposteria', null, ACTIVAS), '')
})

test('SIN TRAMO, LA OBRA POR DEFECTO DE LA FILA — sólo si está activa', () => {
  assert.equal(obraDestinoInicial(null, 'pisos-industriales', ACTIVAS), 'pisos-industriales')
  assert.equal(obraDestinoInicial(null, 'la-estrella', ACTIVAS), '')
})

test('SIN NADA, VACÍO — nunca la primera opción por descarte', () => {
  assert.equal(obraDestinoInicial(null, null, ACTIVAS), '')
  assert.equal(obraDestinoInicial('quattropani', null, []), '')
})
