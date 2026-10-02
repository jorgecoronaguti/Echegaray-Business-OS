// LA REGLA DE APERTURA DEL DETALLE: el toque del teléfono y el teclado tras Esc. Sin DOM.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { abreConTecla, siguienteApertura, type EventoDeColumna } from './aperturaDeColumna.ts'

const correr = (eventos: EventoDeColumna[]) => eventos.reduce(siguienteApertura, false)

test('un toque en el teléfono (mouseenter emulado y después click) deja el detalle ABIERTO', () => {
  assert.equal(correr(['entra', 'toque']), true)
})

test('un toque solo también abre, y tocar fuera lo cierra', () => {
  assert.equal(correr(['toque']), true)
  assert.equal(correr(['toque', 'fuera']), false)
})

test('el mouse: entra abre y sale cierra', () => {
  assert.equal(correr(['entra']), true)
  assert.equal(correr(['entra', 'sale']), false)
})

test('tras Esc, Enter y Espacio reabren aunque el foco no se haya movido', () => {
  assert.equal(correr(['foco', 'esc']), false)
  assert.equal(correr(['foco', 'esc', 'tecla_abrir']), true)
  assert.ok(abreConTecla('Enter') && abreConTecla(' '))
  assert.equal(abreConTecla('a'), false)
})
