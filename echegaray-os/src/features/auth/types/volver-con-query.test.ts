// EL REBOTE A /login GUARDA LA RUTA CON SU QUERY (dueño, 24/09/2026: el enlace de firma del efectivo
// volvía sin `?entrega=` después de entrar y la pantalla no sabía qué firmar).
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { aterrizajeDeIngreso } from './aterrizaje.ts'

test('el middleware arma el volver con path + query, no sólo el path', () => {
  const src = readFileSync(new URL('../../../middleware.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(src, /searchParams\.set\('volver', pathname\)/)
  assert.match(src, /searchParams\.set\('volver', pathname \+ request\.nextUrl\.search\)/)
})

test('después de entrar, la firma vuelve CON la entrega', () => {
  const firma = '/mi-informacion/efectivo/firmar?entrega=5e6a6085-804b-4ee6-9053-665132d3b733'
  assert.equal(aterrizajeDeIngreso('direccion', firma), firma)
  assert.equal(aterrizajeDeIngreso('campo', firma), firma)
  assert.equal(aterrizajeDeIngreso('jefe_obra', firma), firma)
})
