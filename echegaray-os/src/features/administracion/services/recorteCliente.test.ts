// EL RECORTE «CLIENTE» DE LIQUIDACIÓN (dueño, 01/10/2026): las personas asignadas a cada cliente, por la obra
// actual. Se prueba el cruce, las opciones, el recorte y que el parámetro viaja de la URL al cuadro.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { SIN_CLIENTE, clientePedido, opcionesDeCliente, pasaCliente } from './recorteDeLiquidacion.ts'
import { cruzarClientes } from './clientePorPersonaService.ts'

const leer = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

const MAPA = cruzarClientes(
  [
    { id: 'p1', obra_actual_id: 'o-sf1' }, { id: 'p2', obra_actual_id: 'o-sf2' }, { id: 'p3', obra_actual_id: 'o-qp' },
    { id: 'p4', obra_actual_id: null }, { id: 'p5', obra_actual_id: 'o-huerfana' }, { id: 'p6', obra_actual_id: 'o-borrada' },
  ],
  [
    { id: 'o-sf1', cliente_id: 'c-sf' }, { id: 'o-sf2', cliente_id: 'c-sf' }, { id: 'o-qp', cliente_id: 'c-qp' },
    { id: 'o-huerfana', cliente_id: null },
  ],
  [{ id: 'c-sf', nombre_comercial: 'San Francisco' }, { id: 'c-qp', nombre_comercial: 'Quattropani' }, { id: 'c-otro', nombre_comercial: 'ARCOR' }],
)

test('el cliente de una persona es el de su obra actual; dos obras del mismo cliente son un cliente', () => {
  assert.deepEqual(MAPA.p1, { id: 'c-sf', nombre: 'San Francisco' })
  assert.deepEqual(MAPA.p2, { id: 'c-sf', nombre: 'San Francisco' })
  assert.deepEqual(MAPA.p3, { id: 'c-qp', nombre: 'Quattropani' })
})

test('sin obra, obra sin cliente u obra que no existe: sin entrada (va en «Sin cliente»), nunca un cliente inventado', () => {
  for (const id of ['p4', 'p5', 'p6']) assert.equal(MAPA[id], undefined, id)
})

test('las opciones: sólo clientes con gente de la quincena, los de más gente primero, «Sin cliente» al final si hay', () => {
  const o = opcionesDeCliente(['p1', 'p2', 'p3', 'p4'], MAPA)
  assert.deepEqual(o.map((x) => x.texto), ['Todos', 'San Francisco', 'Quattropani', 'Sin cliente'])
  // Empate de gente: por nombre.
  assert.deepEqual(opcionesDeCliente(['p1', 'p3'], MAPA).map((x) => x.texto), ['Todos', 'Quattropani', 'San Francisco'])
  // ARCOR no tiene a nadie: no aparece. Y sin ningún cliente no hay grupo que dibujar.
  assert.ok(!o.some((x) => x.texto === 'ARCOR'))
  assert.deepEqual(opcionesDeCliente(['p4', 'p5'], MAPA), [])
})

test('el recorte: por cliente, «sin cliente» y «todos»', () => {
  assert.equal(pasaCliente('p1', 'c-sf', MAPA), true)
  assert.equal(pasaCliente('p3', 'c-sf', MAPA), false)
  assert.equal(pasaCliente('p4', 'c-sf', MAPA), false)
  assert.equal(pasaCliente('p4', SIN_CLIENTE, MAPA), true)
  assert.equal(pasaCliente('p1', SIN_CLIENTE, MAPA), false)
  for (const id of ['p1', 'p4']) assert.equal(pasaCliente(id, 'todos', MAPA), true)
})

test('un valor de la URL que no es una opción de esta quincena es «todos» (no deja la tabla vacía sin explicación)', () => {
  const o = opcionesDeCliente(['p1', 'p3'], MAPA)
  assert.equal(clientePedido(undefined, o), 'todos')
  assert.equal(clientePedido('c-otro', o), 'todos')
  assert.equal(clientePedido(SIN_CLIENTE, o), 'todos')
  assert.equal(clientePedido('c-qp', o), 'c-qp')
})

test('el parámetro viaja: página → solapa → filas y totales, y el buscador lo conserva', () => {
  const pagina = leer('../../../app/(main)/administracion/personas/page.tsx')
  assert.match(pagina, /parametros=\{\{[^}]*cliente: sp\.cliente/)
  assert.match(pagina, /cliente: base\.cliente/)
  const solapa = leer('../components/liquidacion/solapas/quincena.tsx')
  assert.match(solapa, /\.filter\(\(f\) => pasaCliente\(f\.personaId, cliente, clientes\.mapa\)\)/)
  assert.match(solapa, /opcionesDeCliente\(filas\.map/, 'las opciones salen de la quincena entera')
  assert.match(solapa, /cliente === 'todos' \? \{\} : \{ cliente \}/)
  const filtros = leer('../components/liquidacion/cuadro/FiltrosDelEspejo.tsx')
  assert.match(filtros, /testid="espejo-cliente" rotuloEnTelefono envuelve/, 'los nombres largos de cliente bajan de renglón en el teléfono')
  assert.match(filtros, /envuelve \? 'max-md:w-full max-md:flex-wrap'/)
})
