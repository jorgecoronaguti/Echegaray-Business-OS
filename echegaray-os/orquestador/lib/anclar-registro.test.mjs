import { test } from 'node:test'
import assert from 'node:assert/strict'
import { filaEncabezado, rangoAbierto } from './anclar-registro.mjs'

test('encuentra la fila del encabezado por su rótulo, aunque la banda de arriba cambie de alto', () => {
  // Simula 'Cheques Emitidos' tras el rediseño: banda hasta la 18, "REGISTRO" en 19, "Tipo" en 20.
  const colA = [
    ['Cheques emitidos'], ['Registro de tesorería · al 23/7'], [''],
    ['1 · ¿ME ALCANZA?'], ['Concepto'], ['⇒ Comprometido, no debitado'], [''],
    ['Vencido'], ['Esta semana'], ['2 · ¿CUÁNDO SALE?'], [''], [''], [''], [''], [''], [''], [''], [''],
    ['REGISTRO'], ['Tipo'], ['FISICO'],
  ]
  assert.equal(filaEncabezado(colA, ['Tipo', 'TIPO']), 20)
})

test('acepta el encabezado en mayúsculas o minúsculas', () => {
  assert.equal(filaEncabezado([['TIPO'], ['x']], ['Tipo']), 1)
  assert.equal(filaEncabezado([['tipo'], ['x']], ['Tipo']), 1)
})

test('devuelve 0 cuando no está el encabezado (para que el que llama caiga a un fallback, no a una fila inventada)', () => {
  assert.equal(filaEncabezado([['algo'], ['otra cosa']], ['Tipo']), 0)
})

test('el registro que se movió de la fila 2 a la 20 se ancla solo: la cita ya no cuenta la banda', () => {
  // ANTES: el encabezado del registro estaba en la fila 1 (datos desde la 2).
  const antes = [['Tipo'], ['FISICO'], ['ECHEQ']]
  // AHORA: se rediseñó y el registro bajó. Una cita hardcodeada a la fila 2 leería la banda; la
  // anclada sigue al encabezado, que ahora está en la 5 (datos desde la 6).
  const ahora = [['Cheques emitidos'], ['nota'], [''], ['banda'], ['Tipo'], ['FISICO']]
  assert.equal(filaEncabezado(antes, ['Tipo']), 1)       // encabezado en la 1 → datos en la 2
  assert.equal(filaEncabezado(ahora, ['Tipo']), 5)       // el ancla siguió al registro → datos en la 6
})

test('rangoAbierto no fija fila final y cita con comillas si la hoja tiene espacios', () => {
  assert.equal(rangoAbierto('Cheques Emitidos', 'F', 21), `'Cheques Emitidos'!$F$21:$F`)
  assert.equal(rangoAbierto('_BANCO_RAW', 'C', 4), `_BANCO_RAW!$C$4:$C`)
})
