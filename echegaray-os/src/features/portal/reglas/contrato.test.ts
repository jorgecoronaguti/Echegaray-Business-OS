import test from 'node:test'
import assert from 'node:assert/strict'
import { barraContrato } from './contrato.ts'
import type { ContratoPortal } from '../types.ts'

// LA BARRA DEL CONTRATO DEL PORTAL. Los números de referencia son los que dibuja
// `29 · Portal del Cliente.dc.html` (líneas 96–127): contrato $ 26,40 M, cobrado $ 4,10 M,
// certificado sin cobrar $ 7,40 M, fondo de reparo $ 0,64 M, falta ejecutar $ 14,26 M.

const M = 1_000_000

const contrato = (p: Partial<ContratoPortal> = {}): ContratoPortal => ({
  monto: 26.4 * M,
  retencion_pct: 5,
  cobrado: 4.1 * M,
  certificado_sin_cobrar: 7.4 * M,
  fondo_reparo: 0.64 * M,
  ...p,
})

const pct = (b: ReturnType<typeof barraContrato>, clave: string) =>
  b!.tramos.find((t) => t.clave === clave)!.pct
const monto = (b: ReturnType<typeof barraContrato>, clave: string) =>
  b!.tramos.find((t) => t.clave === clave)!.monto

test('los cuatro tramos del mockup 29 dan los porcentajes del mockup 29', () => {
  const b = barraContrato(contrato())
  assert.ok(b)
  assert.equal(monto(b, 'falta'), 14.26 * M)
  assert.equal(Math.round(pct(b, 'cobrado')), 16)
  assert.equal(Math.round(pct(b, 'sin_cobrar')), 28)
  assert.equal(Math.round(pct(b, 'reparo')), 2) // el mockup escribe 3 % — ver abajo
  assert.equal(Math.round(pct(b, 'falta')), 54)
  // El zip pone 3 % y 53 % a ojo (0,64/26,4 = 2,4 % y 14,26/26,4 = 54,0 %): los suyos son números
  // dibujados a mano, los de acá salen de la división. Manda la división — la barra tiene que
  // CERRAR contra el contrato, y 16+28+3+53 = 100 sólo por casualidad.
  const suma = b.tramos.reduce((t, x) => t + x.pct, 0)
  assert.ok(Math.abs(suma - 100) < 0.0001, `los tramos suman ${suma}`)
})

test('sin contrato cargado no hay barra — y no hay una barra de cero', () => {
  assert.equal(barraContrato(contrato({ monto: null })), null)
  assert.equal(barraContrato(contrato({ monto: 0 })), null)
  assert.equal(barraContrato(null), null)
})

test('certificar por encima del contrato no desborda la barra ni deja falta negativa', () => {
  // Adicionales ejecutados y todavía no incorporados al contrato: $ 30 M certificados sobre $ 26,4 M.
  const b = barraContrato(contrato({ cobrado: 20 * M, certificado_sin_cobrar: 10 * M, fondo_reparo: 0 }))
  assert.ok(b)
  assert.equal(b.sobre_contratado, true)
  assert.equal(monto(b, 'falta'), 0)
  const suma = b.tramos.reduce((t, x) => t + x.pct, 0)
  assert.ok(Math.abs(suma - 100) < 0.0001, `los tramos suman ${suma}`)
  assert.ok(b.tramos.every((t) => t.pct <= 100))
})

test('un importe negativo no arrastra la barra — se recorta en cero', () => {
  // Una nota de crédito con el signo dado vuelta ya costó $ 41,9 M de error en este sistema.
  const b = barraContrato(contrato({ cobrado: -4.1 * M }))
  assert.ok(b)
  assert.equal(monto(b, 'cobrado'), 0)
  assert.ok(b.tramos.every((t) => t.pct >= 0))
})
