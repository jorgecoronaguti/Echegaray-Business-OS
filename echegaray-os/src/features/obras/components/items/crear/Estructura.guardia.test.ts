// Sin infraestructura para montar TSX, la guarda lee el fuente: si alguien quita la barra de teléfono
// del árbol de Estructura, o la vuelve a cerrar en una obra vacía, esto se pone rojo.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const estructura = readFileSync(new URL('./Estructura.tsx', import.meta.url), 'utf8')

test('BarraCrearTelefono se monta cuando el alta a mano está abierta y no hay formulario lateral', () => {
  assert.match(estructura, /\{enMano && !conAsideForm && \(\s*<BarraCrearTelefono/)
})

test('con 0 rubros la barra no ofrece «Cerrar»', () => {
  assert.match(estructura, /<BarraCrearTelefono[^\n]*conCerrar=\{nodos\.length > 0\}/)
})

test('el alta de una obra vacía no depende de la URL: nuevo se deriva de nodos.length === 0', () => {
  assert.match(estructura, /modo\.crear === 'mano' && nodos\.length === 0 \? \{ padreId: null, nombre: '' \}/)
})

test('al crear el primer rubro se navega con crear=mano (no sólo replaceState)', () => {
  assert.match(estructura, /nodos\.length === 0 && m !== 'abrir'[\s\S]{0,300}ir\(`&crear=mano&nuevo=/)
})
