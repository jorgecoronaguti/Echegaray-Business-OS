import test from 'node:test'
import assert from 'node:assert/strict'
import { DESTINOS, NAVEGABLES, destinoActivo } from './destinos.ts'

test('el menú son cuatro destinos; Terminadas y Avance se dibujan pero no navegan', () => {
  // Terminadas se frenó el 26/08/2026: decide «obra terminada» por `public.obras`, mientras que el
  // cronograma vive en `obra_canonica`, y sin mapeo entre las dos mostraba «0 obras» a clientes que
  // sí las tienen. Se dibuja en gris —esconderla la convertiría en una sorpresa— y su ruta sigue
  // respondiendo para no romper enlaces ya compartidos.
  assert.equal(NAVEGABLES.length, 4)
  assert.deepEqual(NAVEGABLES.map((d) => d.rotulo), ['Inicio', 'Pagos', 'Facturas', 'Documentos'])
  for (const rotulo of ['Terminadas', 'Avance']) {
    assert.equal(DESTINOS.find((d) => d.rotulo === rotulo)?.masAdelante, true, `${rotulo} se dibuja pero no navega`)
  }
})

test('el cliente no tiene acceso a nada del OS', () => {
  // Si alguien agrega un destino que sale de /portal, el cliente saldría a una pantalla interna.
  for (const d of DESTINOS) assert.match(d.href, /^\/portal(\/|$)/, `${d.rotulo} apunta fuera del portal`)
})

test('«/portal» es prefijo de todos: el activo es el más largo que calza, no el primero', () => {
  assert.equal(destinoActivo('/portal')?.rotulo, 'Inicio')
  assert.equal(destinoActivo('/portal/')?.rotulo, 'Inicio')
  assert.equal(destinoActivo('/portal/pagos')?.rotulo, 'Pagos')
  // Sin la regla del más largo, acá se encendería Inicio. Se prueba sobre Documentos porque
  // Terminadas quedó frenada: un destino que no navega tampoco se enciende — resaltar en el menú un
  // lugar al que no se puede ir es peor que no resaltar nada.
  assert.equal(destinoActivo('/portal/documentos/una-carpeta')?.rotulo, 'Documentos')
  assert.equal(destinoActivo('/portal/terminadas/deposito-ruta-5'), null)
  assert.equal(destinoActivo('/portal/documentos')?.rotulo, 'Documentos')
})

test('una ruta que no es del portal no enciende nada', () => {
  assert.equal(destinoActivo('/administracion'), null)
  assert.equal(destinoActivo('/portalero'), null, 'no alcanza con empezar igual: tiene que ser el segmento')
})

test('Avance nunca se marca activo — no navega', () => {
  assert.equal(destinoActivo('/portal/avance'), null)
})
