// EL «✔ CARGADO» DEL CHAT DICE LA OBRA DE CADA FILA (15/09/2026).
//
// ═══ QUÉ DEFECTO ATRAPAN ═══
//
// El mensaje decía «Cargado en Compras, fila 900» y nada sobre la columna «Obra». El cargador la deja
// vacía cuando no es segura (historial, cliente con varias obras, sin código): sin decirlo, la persona
// da por imputada una fila que quedó sin obra. Si se saca la línea, estos tests se ponen rojos.

import test from 'node:test'
import assert from 'node:assert/strict'
import { textoCargado, obraPorFila } from './escritura.mjs'

const FILA = { fila: 900, proveedor: 'DUPEC', numero: '0004-00036542' }

test('una fila: la obra escrita se dice con su rótulo', () => {
  const t = textoCargado([FILA], [], { filas: [{ fila: 900, obra: 'OB-0012 · MESSINA', obraEscrita: true }] })
  assert.match(t, /Obra: \*\*OB-0012 · MESSINA\*\*/)
})

test('una fila sin obra: se dice que quedó sin completar y POR QUÉ', () => {
  const t = textoCargado([FILA], [], {
    filas: [{ fila: 900, obra: null, obraEscrita: false, obraPorque: 'la obra salió del historial del proveedor' }],
  })
  assert.match(t, /Obra: \*\*sin completar\*\* — la obra salió del historial del proveedor/)
})

test('obra decidida pero la columna todavía no existe: no se afirma que se escribió', () => {
  const t = textoCargado([FILA], [], { filas: [{ fila: 900, obra: 'OB-0012 · MESSINA', obraEscrita: false }] })
  assert.match(t, /no la escribí: Compras todavía no tiene la columna «Obra»/)
  assert.doesNotMatch(t, /Obra: \*\*OB-0012/)
})

test('varias filas: cada renglón lleva su obra', () => {
  const filas = [FILA, { fila: 901, proveedor: 'Alumetal', numero: '0001-00000001' }]
  const t = textoCargado(filas, [], {
    filas: [{ fila: 900, obra: 'OB-0012 · MESSINA', obraEscrita: true }, { fila: 901, obra: null, obraEscrita: false }],
  })
  assert.match(t, /DUPEC 0004-00036542 → fila 900 · obra OB-0012 · MESSINA/)
  assert.match(t, /Alumetal 0001-00000001 → fila 901 · sin obra/)
})

test('un cargador que no manda la obra no produce «sin obra» inventado', () => {
  assert.equal(obraPorFila({ filas: [{ fila: 900 }] }).size, 0)
  assert.doesNotMatch(textoCargado([FILA], [], { filas: [{ fila: 900 }] }), /Obra/)
})
