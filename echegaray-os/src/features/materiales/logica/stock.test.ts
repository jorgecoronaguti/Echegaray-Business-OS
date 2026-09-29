// MATERIAL · STOCK — lo que se puede romper sin que la pantalla se entere.
//
//   1. Un pedido con dos llegadas parciales que muestra «falta» sobre lo pedido y no sobre lo que ya llegó
//      (se recibiría dos veces la misma bolsa), o que da faltante negativo.
//   2. Mover más de lo que hay en el lugar, o un renglón en cero, aceptado en el cliente.
//   3. Una cantidad «1.250» leída como 1,25 (o «12,5» rechazada): en es-AR el punto separa miles.
//   4. El remito sin número de cuatro dígitos: «R-7» se ordena después de «R-10» como texto.
//   5. Un lugar sin stock listado, o el Taller detrás de las obras.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  destinosPosibles, existenciasDe, faltaLlegar, leerCantidad, lugaresConStock, numeroRemito, puedeOperarMaterial, redondear, solapaDeUrl, verificarSalida,
  type Existencia, type Lugar,
} from './stock.ts'

test('falta llegar: resta lo ya recibido y nunca da negativo', () => {
  assert.equal(faltaLlegar(10, 4), 6)
  assert.equal(faltaLlegar(10, null), 10)
  assert.equal(faltaLlegar(10, 10), 0)
  assert.equal(faltaLlegar(10, 12), 0)
  assert.equal(faltaLlegar(null, 3), null)
})

test('los decimales no arrastran error de coma flotante', () => {
  assert.equal(redondear(0.1 + 0.2), 0.3)
  assert.equal(faltaLlegar(0.3, 0.1), 0.2)
})

test('leerCantidad: coma decimal sí, miles con punto no se adivinan, cero y negativos no', () => {
  assert.equal(leerCantidad('12,5'), 12.5)
  assert.equal(leerCantidad('12.5'), 12.5)
  assert.equal(leerCantidad('1.250'), 1.25)
  assert.equal(leerCantidad('0'), null)
  assert.equal(leerCantidad('-3'), null)
  assert.equal(leerCantidad('abc'), null)
  assert.equal(leerCantidad(''), null)
  assert.equal(leerCantidad('1,2345'), null)
})

test('verificarSalida: no se saca más de lo que hay ni un renglón en cero', () => {
  const hay = new Map([['a', 7]])
  const nombres = new Map([['a', 'Cemento']])
  assert.deepEqual(verificarSalida([{ material_id: 'a', cantidad: 7 }], hay, nombres), { ok: true })
  const de_mas = verificarSalida([{ material_id: 'a', cantidad: 8 }], hay, nombres)
  assert.equal(de_mas.ok, false)
  assert.match(de_mas.ok ? '' : de_mas.error, /Cemento hay 7/)
  assert.equal(verificarSalida([{ material_id: 'a', cantidad: 0 }], hay, nombres).ok, false)
  assert.equal(verificarSalida([{ material_id: 'z', cantidad: 1 }], hay, nombres).ok, false)
  assert.equal(verificarSalida([], hay, nombres).ok, false)
})

test('numeroRemito: cuatro dígitos', () => {
  assert.equal(numeroRemito(7), 'R-0007')
  assert.equal(numeroRemito(1234), 'R-1234')
  assert.equal(numeroRemito(10000), 'R-10000')
})

const lugar = (id: string, rotulo: string, tipo: 'taller' | 'obra'): Lugar => ({ id, rotulo, tipo, obra_id: tipo === 'obra' ? id : null })
const ex = (ubicacion_id: string, material: string, cantidad: number): Existencia =>
  ({ material_id: material, material, unidad: 'bolsa', ubicacion_id, cantidad })

test('lugares con stock: el Taller primero, las obras por nombre, sin los vacíos', () => {
  const lugares = [lugar('o2', 'OB-0002 · B', 'obra'), lugar('t', 'Taller', 'taller'), lugar('o1', 'OB-0001 · A', 'obra'), lugar('o3', 'OB-0003 · C', 'obra')]
  const todas = [ex('o2', 'Cemento', 3), ex('t', 'Arena', 1), ex('o1', 'Cal', 2), ex('o3', 'Ladrillo', 0)]
  assert.deepEqual(lugaresConStock(lugares, todas).map((l) => l.id), ['t', 'o1', 'o2'])
})

test('existencias de un lugar: sólo las suyas, con cantidad, por nombre', () => {
  const todas = [ex('t', 'Cemento', 3), ex('t', 'Arena', 1), ex('o1', 'Cal', 2), ex('t', 'Cal', 0)]
  assert.deepEqual(existenciasDe(todas, 't').map((e) => e.material), ['Arena', 'Cemento'])
})

test('destinos: Taller primero, obras con depósito, y una obra activa sin depósito también (obra:<id>)', () => {
  const lugares = [lugar('o1', 'OB-0001 · A', 'obra'), lugar('t', 'Taller', 'taller')]
  const rotulos = new Map([['o1', 'OB-0001 · A'], ['o2', 'OB-0002 · B'], ['o9', 'OB-0009 · cerrada']])
  const d = destinosPosibles(lugares, ['o1', 'o2'], rotulos)
  assert.deepEqual(d.map((x) => x.valor), ['t', 'o1', 'obra:o2'])
})

test('puedeOperarMaterial: el mismo conjunto que es_administracion(); campo y cliente no', () => {
  for (const r of ['direccion', 'administracion', 'jefe_obra']) assert.equal(puedeOperarMaterial(r), true, r)
  for (const r of ['campo', 'cliente', null, undefined, '']) assert.equal(puedeOperarMaterial(r), false, String(r))
})

test('solapaDeUrl: lo desconocido cae en Pedidos (la vista de hoy)', () => {
  assert.equal(solapaDeUrl('stock'), 'stock')
  assert.equal(solapaDeUrl('remitos'), 'remitos')
  assert.equal(solapaDeUrl('x'), 'pedidos')
  assert.equal(solapaDeUrl(null), 'pedidos')
})
