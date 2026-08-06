// EL ESCRITOR DE LAS DOS VISTAS — lo que este archivo impide que vuelva a pasar.
//
// EL DEFECTO QUE MOTIVÓ EL ARCHIVO (06/08/2026, medido en vivo): `--dry` cortaba antes de escribir la
// grilla pero NO antes de agrandar la hoja. Una corrida `--dry` desde un worktree llevó "Cash Flow
// Semanal" de 34×15 a 71×55 y "Cash Flow Mensual" de 50×14 a 73×14 contra el archivo REAL. Es
// aditivo —filas y columnas vacías— pero es una escritura, y un `--dry` que escribe no sirve para
// decidir si escribir.
//
// Importar este módulo NO dispara `main()`: la guarda de `ejecutadoDirecto` lo impide, y por eso este
// test no toca la red.

import test from 'node:test'
import assert from 'node:assert/strict'
import { tamanoQueFalta } from './cash-flow-vistas.mjs'
import { footprintDe } from '../lib/cash-flow-matriz.mjs'

test('sólo AGRANDA: una hoja que ya aloja el footprint no necesita ninguna propiedad', () => {
  const fp = footprintDe('semana', 2026)
  assert.deepEqual(tamanoQueFalta({ rows: fp.filas, cols: fp.cols }, fp), {})
  // Y una hoja MÁS GRANDE tampoco: el achique va después de escribir, cuando la firma ya dio permiso.
  assert.deepEqual(tamanoQueFalta({ rows: 220, cols: 65 }, fp), {})
})

test('una hoja chica declara exactamente lo que le falta, y no más', () => {
  const fp = footprintDe('semana', 2026)
  assert.deepEqual(tamanoQueFalta({ rows: 34, cols: 15 }, fp), { rowCount: fp.filas, columnCount: fp.cols })
  assert.deepEqual(tamanoQueFalta({ rows: 34, cols: 200 }, fp), { rowCount: fp.filas })
  assert.deepEqual(tamanoQueFalta({ rows: 500, cols: 15 }, fp), { columnCount: fp.cols })
})

test('una hoja que no existe todavía necesita el footprint entero, sin romperse', () => {
  const fp = footprintDe('mes', 2026)
  assert.deepEqual(tamanoQueFalta(null, fp), { rowCount: fp.filas, columnCount: fp.cols })
  assert.deepEqual(tamanoQueFalta({}, fp), { rowCount: fp.filas, columnCount: fp.cols })
})
