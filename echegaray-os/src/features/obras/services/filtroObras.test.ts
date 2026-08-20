import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clienteVisible, filtrar, filtroDesde, hayFiltro, SIN_FILTRO } from './filtroObras.ts'

const CARTERA = [
  { nombre: 'Galpón 9', cliente_nombre: 'La Estrella', etapa: 'terminacion' },
  { nombre: 'Pisos Industriales', cliente_nombre: 'San Francisco (IMOTOR)', etapa: 'inicio' },
  { nombre: 'Salones Comerciales', cliente_nombre: 'Quattropani', etapa: 'previo' },
  { nombre: 'Limpieza de Escombros', cliente_nombre: 'Messina', etapa: 'desarrollo' },
]
const n = (r: { nombre: string }[]) => r.map((o) => o.nombre)

test('sin filtro no se pierde ninguna obra', () => {
  assert.equal(filtrar(CARTERA, SIN_FILTRO).length, 4)
  assert.equal(hayFiltro(SIN_FILTRO), false)
})

test('la etapa acota a esa etapa exacta', () => {
  assert.deepEqual(n(filtrar(CARTERA, { etapa: 'inicio', q: '' })), ['Pisos Industriales'])
})

test('el texto busca en la obra Y en el cliente con un solo control', () => {
  assert.deepEqual(n(filtrar(CARTERA, { etapa: null, q: 'messina' })), ['Limpieza de Escombros'])
  assert.deepEqual(n(filtrar(CARTERA, { etapa: null, q: 'salones' })), ['Salones Comerciales'])
})

test('buscar sin tildes encuentra lo que sí las tiene', () => {
  // «galpon» tipeado rápido no puede dejar afuera a «Galpón 9».
  assert.deepEqual(n(filtrar(CARTERA, { etapa: null, q: 'galpon' })), ['Galpón 9'])
})

test('los dos filtros se combinan, no se pisan', () => {
  assert.deepEqual(n(filtrar(CARTERA, { etapa: 'terminacion', q: 'estrella' })), ['Galpón 9'])
  assert.deepEqual(filtrar(CARTERA, { etapa: 'previo', q: 'estrella' }), [])
})

test('una etapa inventada en la URL no filtra ni rompe: se ignora', () => {
  const f = filtroDesde({ etapa: 'cualquier-cosa' })
  assert.equal(f.etapa, null)
  assert.equal(filtrar(CARTERA, f).length, 4)
})

test('los espacios de más no cuentan como filtro', () => {
  assert.equal(hayFiltro(filtroDesde({ q: '   ' })), false)
})

test('una obra sin nombre de cliente no rompe la búsqueda', () => {
  const sinCliente = [{ nombre: 'Obra suelta', cliente_nombre: null, etapa: null }]
  assert.equal(filtrar(sinCliente, { etapa: null, q: 'suelta' }).length, 1)
  assert.equal(filtrar(sinCliente, { etapa: null, q: 'messina' }).length, 0)
})

// ═══ EL BUSCADOR TIENE QUE ENCONTRAR LO QUE LA COLUMNA MUESTRA ═══
//
// La celda de cliente de `/obras` dibuja `cliente_nombre ?? cliente_texto`, y el orden compara ese
// mismo par. La búsqueda miraba SÓLO `cliente_nombre`: una obra con el cliente escrito a mano y sin
// ficha se veía en la tabla, se podía ordenar por ella, y desaparecía al tipear su nombre. Sin
// ningún error: la pantalla contestaba «no hay ninguna obra de ese cliente» sobre una obra que
// estaba ahí una línea antes.
//
// Si `clienteVisible` volviera a leer sólo el canónico, estas tres aserciones se ponen rojas.

test('se busca por el cliente que la columna MUESTRA, aunque no tenga ficha', () => {
  const sinFicha = [
    { nombre: 'Obra de campo', cliente_nombre: null, cliente_texto: 'Bodega San Juan', etapa: null },
    { nombre: 'Otra obra', cliente_nombre: 'Messina', cliente_texto: 'Messinas', etapa: null },
  ]
  assert.deepEqual(n(filtrar(sinFicha, { etapa: null, q: 'bodega' })), ['Obra de campo'])
})

test('el canónico le gana al texto de origen, igual que en la celda', () => {
  // `cliente_texto` es procedencia, no verdad: cuando hay ficha, manda la ficha. Buscar por el
  // texto viejo NO puede traer la obra, porque la columna ya no lo muestra.
  const conFicha = [{ nombre: 'Limpieza', cliente_nombre: 'Messina', cliente_texto: 'Messinas', etapa: null }]
  assert.equal(filtrar(conFicha, { etapa: null, q: 'messina' }).length, 1)
  assert.equal(filtrar(conFicha, { etapa: null, q: 'messinas' }).length, 0)
})

test('sin ninguna de las dos puntas la obra sigue siendo buscable por su nombre', () => {
  const huerfana = [{ nombre: 'Obra suelta', cliente_nombre: null, cliente_texto: null, etapa: null }]
  assert.equal(clienteVisible(huerfana[0]), '')
  assert.equal(filtrar(huerfana, { etapa: null, q: 'suelta' }).length, 1)
})
