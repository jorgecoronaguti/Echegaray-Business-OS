// LOS GRÁFICOS DE CAJA, VERIFICADOS EN FRÍO.
//
// POR QUÉ EXISTE (05/08/2026). La primera corrida real NO dibujó ningún gráfico y el log no dijo una
// palabra: dos de las tres salidas de `requestsDeGraficos` devolvían `[]` en silencio. "No apareció y
// no sé por qué" es el peor estado posible — no se puede arreglar ni descartar. Estos tests cubren lo
// que se puede verificar sin la API: la forma del request, la celda de ancla y que ninguna salida
// pueda quedarse muda.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { graficoRecorrido, graficoConcentracion, requestsDeGraficos, MARCA, COL_ANCLA } from './caja-graficos.mjs'
import { ANCHO } from './caja-grilla.mjs'

const G = { fTotal: 12, cal0: 19, cal1: 24, fCli0: 36, fCli1: 40 }
const fake = (charts) => ({ getCharts: async () => [{ sheetId: 7, title: 'Caja', charts }] })

test('EL ANCLA CAE DENTRO DE LA GRILLA QUE EL GENERADOR GARANTIZA', () => {
  // Los gráficos FLOTAN, pero su ancla es una celda REAL: si la hoja no llega a esa columna, `addChart`
  // devuelve 400 y se cae el lote entero. El generador aseguraba el ALTO desde julio y el ANCHO nunca —
  // y el ancho no se nota hasta que algo lo pide. Es el sospechoso número uno de la corrida muda.
  for (const c of [graficoRecorrido(7, G), graficoConcentracion(7, G)]) {
    const a = c.addChart.chart.position.overlayPosition.anchorCell
    assert.equal(a.columnIndex, COL_ANCLA)
    assert.ok(a.columnIndex >= ANCHO, 'el gráfico no puede anclarse encima de una columna de datos')
  }
  // Y el script tiene que ASEGURAR esa columna antes de pedir el gráfico, no suponerla.
  const src = readFileSync(new URL('../scripts/caja-pestana.mjs', import.meta.url), 'utf8')
  assert.match(src, /COL_ANCLA \+ 2/, 'el generador tiene que extender la hoja hasta pasado el ancla')
  assert.match(src, /gridProperties\.columnCount/, 'y pedirle a la API que cambie el ancho, no sólo el alto')
})

test('LA CURVA DE LIQUIDEZ LEE LAS TRES COLUMNAS DEL CALENDARIO Y NADA MÁS', () => {
  // ═══ POR QUÉ YA NO ES UN WATERFALL ═══
  //
  // Este test exigía un waterfall y llegó a exigir DOS rangos no contiguos por eje — algo que la API
  // rechaza—, así que pasaba en verde mientras el gráfico no se dibujaba en el archivo. Después el
  // dueño borró el waterfall que sí llegó a dibujarse. La forma correcta para *¿en qué semana me
  // quedo corto?* es un COMBO: barras del movimiento del tramo y una línea con la posición acumulada.
  //
  // Lo que este test protege es lo único que puede romperse en frío: que las tres series salgan de las
  // columnas C, D y E del CALENDARIO —las mismas celdas que la tabla— y de ninguna otra parte. Un
  // gráfico con datos propios es la forma más elegante de tener dos verdades.
  const b = graficoRecorrido(7, G).addChart.chart.spec.basicChart
  assert.equal(b.chartType, 'COMBO')
  assert.equal(b.legendPosition, 'BOTTOM_LEGEND', 'con tres series, sin leyenda no se puede leer')
  const dom = b.domains[0].domain.sourceRange.sources
  assert.equal(dom.length, 1)
  assert.equal(dom[0].startColumnIndex, 0, 'el dominio es el rótulo del tramo, columna A')
  // Y EL ENVOLTORIO IMPORTA: en un basicChart la ChartData va directa. Con `{ data: … }` —que es lo
  // que pide un waterfall— la API devuelve 400 "Unknown name data" y no se dibuja nada. Leerlo así
  // desde el test es lo que fija la forma correcta.
  assert.equal(b.domains[0].domain.data, undefined, 'en un basicChart la ChartData va SIN envoltorio `data`')
  assert.deepEqual(b.series.map((s) => s.series.sourceRange.sources[0].startColumnIndex), [2, 3, 4],
    'Entra (C), Sale (D) y Queda después (E) — el contrato de columnas de la pestaña')
  assert.deepEqual(b.series.map((s) => s.type), ['COLUMN', 'COLUMN', 'LINE'],
    'el acumulado es una LÍNEA: dibujado como barra se lee como si fuera un movimiento más')
  // LA LEYENDA SALE DEL ENCABEZADO DE LA TABLA: el rango arranca UNA fila antes que los datos y
  // `headerCount: 1` le dice a Sheets que esa fila son los nombres. Sin eso la leyenda dibuja tres
  // cuadraditos sin texto — tres series indistinguibles, peor que no tener leyenda.
  assert.equal(b.headerCount, 1, 'sin headerCount la leyenda sale sin nombres')
  for (const s of [...b.series, b.domains[0].domain]) {
    const f = (s.series ?? s).sourceRange.sources[0]
    assert.equal(f.startRowIndex, G.cal0 - 2, 'el rango incluye la fila de encabezado, que es de donde salen los nombres')
    assert.equal(f.endRowIndex, G.cal1)
  }
})

// La CONCENTRACIÓN POR CLIENTE se fue de CAJA (05/08): el dueño la quiere fuera —'no quiero nada
// de cobranza en caja, sólo datos de caja'— y con ella se fue su gráfico. Vive en el Cash Flow
// Semanal, que es el cuadro que proyecta el ingreso.

test('SE BORRAN LOS PROPIOS ANTES DE DIBUJAR, y sólo los propios', async () => {
  // `addChart` SIEMPRE agrega: no existe "crear o actualizar". Sin borrar primero, la corrida de cada
  // dos horas apila doce gráficos por día sobre la misma celda y sólo se ve el último.
  const reqs = await requestsDeGraficos(fake([
    { chartId: 1, title: `${MARCA}El recorrido de la caja, tramo por tramo` },
    { chartId: 3, title: 'un gráfico que hizo el dueño' },
  ]), 'file', 7, G)
  const borrados = reqs.filter((r) => r.deleteEmbeddedObject).map((r) => r.deleteEmbeddedObject.objectId)
  assert.deepEqual(borrados, [1], 'si el dueño dibuja el suyo, es suyo: no se toca')
  assert.equal(reqs.filter((r) => r.addChart).length, 1)
  // Y los borrados van PRIMERO: al revés se borraría el que se acaba de crear.
  assert.ok(reqs.findIndex((r) => r.deleteEmbeddedObject) < reqs.findIndex((r) => r.addChart))
})

test('NINGUNA SALIDA SE QUEDA MUDA: si no dibuja, dice por qué', async () => {
  // Es el defecto que este archivo pagó: no se dibujó nada y el log no dijo nada.
  const dichos = []
  const warn = console.warn
  console.warn = (m) => dichos.push(String(m))
  try {
    assert.deepEqual(await requestsDeGraficos(fake([]), 'file', 7, { ...G, cal1: 0 }), [])
    assert.deepEqual(await requestsDeGraficos({ getCharts: async () => { throw new Error('429') } }, 'f', 7, G), [])
  } finally { console.warn = warn }
  assert.equal(dichos.length, 3, 'cada salida sin dibujo tiene que dejar su motivo escrito')
  assert.ok(dichos.some((d) => d.includes('cal1')), 'la grilla incompleta se nombra con el campo que falta')
  assert.ok(dichos.some((d) => d.includes('429')), 'el error de la API se propaga al log, no se traga')
})

test('el cliente de Google expone getCharts: sin eso el módulo no puede borrar los suyos', () => {
  // Se verifica sobre el FUENTE porque instanciar el cliente pide credenciales. Un método que no existe
  // haría fallar el `catch` genérico y el skip se vería igual que un 429 — dos causas, un solo síntoma.
  const src = readFileSync(new URL('./google.mjs', import.meta.url), 'utf8')
  assert.match(src, /async getCharts\(fileId\)/, 'falta el lector de gráficos en el cliente')
  assert.match(src, /charts\(chartId,spec\(title\)\)/, 'y tiene que traer el título, que es cómo se reconoce el propio')
})
