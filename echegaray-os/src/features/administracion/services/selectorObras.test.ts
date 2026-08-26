import test from 'node:test'
import assert from 'node:assert/strict'
import {
  SIN_CLIENTE, agruparPorCliente, estaCerrada, nombreDeCliente, rotuloDeObra, ubicarObra,
} from './selectorObras.ts'

// LO QUE ESTAS PRUEBAS IMPIDEN: que el selector del cronograma vuelva a mezclar obras de clientes
// distintos. El defecto original ordenaba por `estado` y después por `nombre`, así que dos obras del
// mismo cliente quedaban separadas por la de otro. Elegir la equivocada publica los cobros de un
// cliente en el portal de otro.

const o = (id: string, nombre: string, cliente: string | null, estado = 'activa') =>
  ({ id, nombre, cliente, estado })

test('las obras de un mismo cliente quedan JUNTAS aunque tengan estados distintos', () => {
  const grupos = agruparPorCliente([
    o('1', 'Nave 2', 'ARCOR', 'activa'),
    o('2', 'Depósito', 'Messinas', 'activa'),
    o('3', 'Nave 1', 'ARCOR', 'contratada'),
  ])
  assert.deepEqual(grupos.map((g) => g.cliente), ['ARCOR', 'Messinas'])
  assert.deepEqual(grupos[0].obras.map((x) => x.nombre), ['Nave 1', 'Nave 2'])
})

test('las cerradas van al FINAL de su cliente, no fuera de la lista', () => {
  // Una obra cerrada todavía devuelve el fondo de reparo: sacarla dejaría ese cobro sin pantalla.
  const grupos = agruparPorCliente([
    o('1', 'Aaa', 'ARCOR', 'cerrada'),
    o('2', 'Zzz', 'ARCOR', 'activa'),
  ])
  assert.deepEqual(grupos[0].obras.map((x) => x.nombre), ['Zzz', 'Aaa'])
  assert.equal(rotuloDeObra({ nombre: 'Aaa', estado: 'cerrada' }), 'Aaa — cerrada')
  assert.equal(rotuloDeObra({ nombre: 'Zzz', estado: 'activa' }), 'Zzz')
})

test('«Sin cliente asignado» existe, se nombra y va último', () => {
  // Esconder la obra sin cliente la volvería ineditable; llamarla "" la haría parecer un cliente.
  const grupos = agruparPorCliente([o('1', 'Suelta', null), o('2', 'Nave', 'Zeta'), o('3', 'X', 'ARCOR')])
  assert.deepEqual(grupos.map((g) => g.cliente), ['ARCOR', 'Zeta', SIN_CLIENTE])
})

test('el paréntesis de la razón social no es parte del nombre', () => {
  assert.equal(nombreDeCliente('(Messinas)'), 'Messinas')
  assert.equal(nombreDeCliente('  ARCOR '), 'ARCOR')
  assert.equal(nombreDeCliente(''), SIN_CLIENTE)
  assert.equal(nombreDeCliente(null), SIN_CLIENTE)
  // Y `(Messinas)` y `Messinas` son EL MISMO grupo: si no, el cliente aparecería dos veces.
  const grupos = agruparPorCliente([o('1', 'A', '(Messinas)'), o('2', 'B', 'Messinas')])
  assert.equal(grupos.length, 1)
})

test('«cerrada» se reconoce sin depender de mayúsculas ni espacios; null NO es cerrada', () => {
  assert.equal(estaCerrada('cerrada'), true)
  assert.equal(estaCerrada(' Cerrada '), true)
  assert.equal(estaCerrada(null), false)
  assert.equal(estaCerrada('activa'), false)
})

test('el encabezado sabe de qué cliente es la obra que se está editando', () => {
  const grupos = agruparPorCliente([o('1', 'Nave 2', 'ARCOR'), o('2', 'Depósito', 'Messinas')])
  assert.equal(ubicarObra(grupos, '2')?.cliente, 'Messinas')
  assert.equal(ubicarObra(grupos, '2')?.nombre, 'Depósito')
  // Una obra que no está en la lista devuelve null, y la pantalla dice que no hay obra elegida en
  // vez de dibujar un encabezado con el cliente de otra.
  assert.equal(ubicarObra(grupos, '99'), null)
  assert.equal(ubicarObra(grupos, null), null)
})
