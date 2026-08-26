import test from 'node:test'
import assert from 'node:assert/strict'
import { DESTINOS, NAVEGABLES, destinoActivo } from './destinos.ts'

test('el menú son cinco destinos y Avance apagado', () => {
  assert.equal(NAVEGABLES.length, 5)
  assert.deepEqual(NAVEGABLES.map((d) => d.rotulo), ['Inicio', 'Pagos', 'Facturas', 'Documentos', 'Terminadas'])
  const avance = DESTINOS.find((d) => d.rotulo === 'Avance')
  assert.equal(avance?.masAdelante, true, 'Avance se dibuja pero no navega')
})

test('el cliente no tiene acceso a nada del OS', () => {
  // Si alguien agrega un destino que sale de /portal, el cliente saldría a una pantalla interna.
  for (const d of DESTINOS) assert.match(d.href, /^\/portal(\/|$)/, `${d.rotulo} apunta fuera del portal`)
})

test('«/portal» es prefijo de todos: el activo es el más largo que calza, no el primero', () => {
  assert.equal(destinoActivo('/portal')?.rotulo, 'Inicio')
  assert.equal(destinoActivo('/portal/')?.rotulo, 'Inicio')
  assert.equal(destinoActivo('/portal/pagos')?.rotulo, 'Pagos')
  // Sin la regla del más largo, acá se encenderían Inicio Y Terminadas.
  assert.equal(destinoActivo('/portal/terminadas/deposito-ruta-5')?.rotulo, 'Terminadas')
  assert.equal(destinoActivo('/portal/documentos')?.rotulo, 'Documentos')
})

test('una ruta que no es del portal no enciende nada', () => {
  assert.equal(destinoActivo('/administracion'), null)
  assert.equal(destinoActivo('/portalero'), null, 'no alcanza con empezar igual: tiene que ser el segmento')
})

test('Avance nunca se marca activo — no navega', () => {
  assert.equal(destinoActivo('/portal/avance'), null)
})
