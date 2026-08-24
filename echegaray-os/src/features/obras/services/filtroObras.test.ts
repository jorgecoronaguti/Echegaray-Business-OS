import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  clienteVisible, esAtrasada, filtrar, filtrarPorAtraso, filtroDesde, hayFiltro, SIN_FILTRO,
} from './filtroObras.ts'
import { desvioDePlazo, type Semaforo } from './ganttObras.ts'

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

// ═══ «CON ATRASO» PREGUNTA POR EL MISMO ESTADO QUE PINTA EL GANTT ═══
//
// El chip del Design 01 no puede tener su propio criterio: el día que lo tuviera, la tabla diría
// «3 con atraso» y la línea de tiempo dibujaría cuatro barras ámbar de la misma cartera. Estas
// pruebas fijan las dos cosas que hacen que eso no pase: que el estado lo decide `desvioDePlazo` y
// que lo que NO se puede juzgar no se cuenta como atrasado.

test('con atraso son las dos del semáforo, y «sin datos» NO es una de ellas', () => {
  assert.equal(esAtrasada('atraso_menor'), true)
  assert.equal(esAtrasada('atraso_critico'), true)
  assert.equal(esAtrasada('al_dia'), false)
  // Una obra sin fechas o sin avance no es una obra que llega, pero tampoco una atrasada: contarla
  // acá sería afirmar un atraso que nadie midió.
  assert.equal(esAtrasada('sin_datos'), false)
})

test('el filtro de atraso usa el semáforo de la regla, no una cuenta de la pantalla', () => {
  const cartera = [
    // Esperado 38 por calendario contra 18 medido: 20 puntos de brecha, ámbar por `UMBRAL_ATRASO`.
    { nombre: 'Escuela', inicio: '2026-06-01', fin: '2026-09-09', avance: 18 },
    { nombre: 'Depósito', inicio: '2026-06-01', fin: '2026-09-09', avance: 60 },  // adelantada
    { nombre: 'Salón', inicio: null as string | null, fin: null as string | null, avance: null as number | null },
  ]
  const sem = (o: (typeof cartera)[number]): Semaforo =>
    desvioDePlazo(o.inicio, o.fin, o.avance, '2026-07-09').semaforo

  const puesto = filtrarPorAtraso(cartera, { ...SIN_FILTRO, atraso: true }, sem)
  assert.deepEqual(n(puesto), ['Escuela'])
  // Sin el filtro puesto no se pierde nadie, ni siquiera la que no se puede juzgar.
  assert.equal(filtrarPorAtraso(cartera, SIN_FILTRO, sem).length, 3)
})

test('el atraso viaja en la URL y sólo `1` lo pone', () => {
  assert.equal(filtroDesde({ atraso: '1' }).atraso, true)
  assert.equal(filtroDesde({ atraso: 'si' }).atraso, false)
  assert.equal(filtroDesde({}).atraso, false)
  // Y cuenta como filtro puesto: sin esto, «quitar filtros» no aparecería y la cartera acortada se
  // leería como una cartera a la que le faltan obras.
  assert.equal(hayFiltro(filtroDesde({ atraso: '1' })), true)
})

test('sin ninguna de las dos puntas la obra sigue siendo buscable por su nombre', () => {
  const huerfana = [{ nombre: 'Obra suelta', cliente_nombre: null, cliente_texto: null, etapa: null }]
  assert.equal(clienteVisible(huerfana[0]), '')
  assert.equal(filtrar(huerfana, { etapa: null, q: 'suelta' }).length, 1)
})
