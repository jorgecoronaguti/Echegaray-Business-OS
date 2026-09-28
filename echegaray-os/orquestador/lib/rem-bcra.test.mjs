import { test } from 'node:test'
import assert from 'node:assert/strict'
import { linkDeTablas, variacionesDelCuadro, leerRemBcra } from './rem-bcra.mjs'

// Filas reales de la planilla de agosto 2026 (hoja «Cuadros de resultados»).
const FILAS = [
  ['Relevamiento de Expectativas de Mercado (REM)  - BCRA - Agosto 2026'], [], [],
  ['Precios minoristas (IPC nivel general-Nacional; INDEC)'],
  ['Período', 'Referencia', 'Mediana', 'Promedio'],
  ['Aug-26', 'var. % mensual', '1.7', '1.8'],
  ['Sep-26', 'var. % mensual', '1.8', '1.8'],
  ['Dec-26', 'var. % mensual', '1.8', '1.7'],
  ['Jan-27', 'var. % mensual', '1.6', '1.6'],
  ['próx. 12 meses', 'var. % i.a.; ago-27', '21.0', '20.9'],
  ['2026', 'var. % i.a.; dic-26', '30.0', '29.9'],
  [], [],
  ['Precios minoristas (IPC núcleo-Nacional; INDEC)'],
  ['Aug-26', 'var. % mensual', '9.9', '9.9'],
]

test('toma la mediana mensual del IPC nivel general, con el año de cada fila', () => {
  assert.deepEqual(variacionesDelCuadro(FILAS), [
    { periodo: '2026-08', variacion: 0.017 },
    { periodo: '2026-09', variacion: 0.018 },
    { periodo: '2026-12', variacion: 0.018 },
    { periodo: '2027-01', variacion: 0.016 },
  ])
})

test('no mezcla el IPC núcleo ni los interanuales', () => {
  assert.ok(!variacionesDelCuadro(FILAS).some((v) => v.variacion > 0.05))
})

test('sin filas vacías entre bloques, el IPC núcleo no se cuela', () => {
  const pegadas = FILAS.filter((f) => f.length)
  assert.deepEqual(variacionesDelCuadro(pegadas).map((v) => v.periodo), ['2026-08', '2026-09', '2026-12', '2027-01'])
})

test('un mes repetido o una columna sin «Mediana» invalidan todo', () => {
  const rep = FILAS.slice(0, 6).concat([['Aug-26', 'var. % mensual', '1.9', '1.9']])
  assert.deepEqual(variacionesDelCuadro(rep), [])
  const sinMediana = FILAS.map((f, i) => (i === 4 ? ['Período', 'Referencia', 'Promedio', 'Mediana'] : f))
  assert.equal(variacionesDelCuadro(sinMediana)[0].variacion, 0.018)
  const sinEncabezado = FILAS.map((f, i) => (i === 4 ? ['Período', 'Referencia', 'Promedio'] : f))
  assert.deepEqual(variacionesDelCuadro(sinEncabezado), [])
})

test('sin el bloque del IPC nivel general no devuelve nada', () => {
  assert.deepEqual(variacionesDelCuadro([['Tasa de interés (TAMAR)'], ['Sep-26', 'TNA; %', '24.1']]), [])
})

test('elige la planilla de tablas más reciente de la página', () => {
  const html = `<a href="/archivos/Pdfs/x/relevamiento-expectativas-mercado-tablas-2026-07.xlsx">j</a>
    <a href="/archivos/Pdfs/x/relevamiento-expectativas-mercado-tablas-2026-08.xlsx">a</a>
    <a href="/archivos/Pdfs/x/relevamiento-expectativas-mercado-2026-08.pdf">pdf</a>`
  assert.deepEqual(linkDeTablas(html), { url: 'https://www.bcra.gob.ar/archivos/Pdfs/x/relevamiento-expectativas-mercado-tablas-2026-08.xlsx', edicion: '2026-08' })
  assert.equal(linkDeTablas('<html></html>'), null)
})

test('página sin planilla: error, no un número inventado', async () => {
  const bajar = async () => ({ ok: true, text: async () => '<html>sin links</html>' })
  await assert.rejects(leerRemBcra({ bajar }), /no trae la planilla/)
})
