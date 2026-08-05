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

test('EL WATERFALL ARRANCA EN UN NIVEL Y SIGUE EN DELTAS: dos rangos, no uno', () => {
  // La primera barra es la CAJA DE HOY (un nivel) y las seis siguientes son los netos de cada tramo
  // (deltas). Por eso el dominio y la serie se arman con dos rangos NO CONTIGUOS. Sin
  // `firstValueIsTotal` el recorrido arrancaría en cero y el gráfico mostraría un pozo que no existe.
  const w = graficoRecorrido(7, G).addChart.chart.spec.waterfallChart
  assert.equal(w.firstValueIsTotal, true)
  const dom = w.domain.data.sourceRange.sources
  const ser = w.series[0].data.sourceRange.sources
  assert.equal(dom.length, 2)
  assert.equal(ser.length, 2)
  // El primero es la fila del total de disponibilidades; el segundo, los seis tramos del calendario.
  assert.equal(dom[0].startRowIndex, G.fTotal - 1)
  assert.equal(dom[1].startRowIndex, G.cal0 - 1)
  assert.equal(dom[1].endRowIndex, G.cal1)
  // Y la serie lee la MISMA plata que la tabla: columna E (índice 4) en las mismas filas.
  for (const s of ser) assert.equal(s.startColumnIndex, 4)
  for (const d of dom) assert.equal(d.startColumnIndex, 0)
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
