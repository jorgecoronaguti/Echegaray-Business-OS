// LOS GRÁFICOS DE CAJA, VERIFICADOS EN FRÍO.
//
// POR QUÉ EXISTE (05/08/2026). La primera corrida real NO dibujó ningún gráfico y el log no dijo una
// palabra: dos de las tres salidas devolvían `[]` en silencio. "No apareció y no sé por qué" es el peor
// estado posible — no se puede arreglar ni descartar.
//
// ═══ ESTE ARCHIVO SE REESCRIBIÓ CON LA PORTADA ═══
//
// Antes había dos gráficos que leían la tabla de CAJA (el combo del calendario y el ranking de
// clientes). Ahora son cuatro y leen `_CAJA_ANEXO`, porque una serie diaria de sesenta puntos es una
// matriz y en la portada no entra una matriz. Los tests de la forma del request se conservan —el
// envoltorio `{ data: … }` que devuelve un 400 sigue siendo el error fácil de cometer—; los que medían
// las columnas del calendario se retiran con el layout que medían.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { graficos, requestsDeGraficos, MARCA, FILA_ANCLA, COL_ANCLA, TITULO_EQUILIBRIO, TITULO_NECESIDAD } from './caja-graficos.mjs'
import { SALIDAS, COL_NECESIDAD, esEjecutado } from './caja-necesidad-baldes.mjs'
import { COL, MESES } from './caja-anexo-series.mjs'

const SERIES = {
  equilibrio: { f0: 26, f1: 37 }, historia: { f0: 40, f1: 99 }, proyeccion: { f0: 101, f1: 160 },
  pagos: { f0: 162, f1: 166 }, cobranzas: { f0: 168, f1: 172 }, necesidad: { f0: 174, f1: 203 },
}
const ANEXO = 99
const fake = (charts) => ({ getCharts: async () => [{ sheetId: 7, title: 'Caja', charts }] })
const equilibrio = (s = SERIES) => graficos(7, ANEXO, s).requests[1].addChart.chart.spec

test('SON TRES Y CADA UNO CONTESTA UNA PREGUNTA DISTINTA', () => {
  // El dueño los eligió: ¿alcanza la caja a treinta días?, ¿el año se paga solo?, ¿cómo viene el saldo
  // a sesenta? Las dos concentraciones las mandó sacar el 20/08 —«gráficos que ya no voy a usar»— y
  // sus series siguen en el anexo: se dejó de dibujarlas, no se borraron.
  const { requests, faltan } = graficos(7, ANEXO, SERIES)
  assert.equal(requests.length, 3)
  assert.deepEqual(faltan, [])
  assert.deepEqual(requests.map((r) => r.addChart.chart.spec.title), [
    TITULO_NECESIDAD, TITULO_EQUILIBRIO, `${MARCA}Proyección de la caja`,
  ])
  const titulos = requests.map((r) => r.addChart.chart.spec.title).join(' ')
  assert.ok(!titulos.includes('Concentración'), 'los rankings los mandó sacar el dueño')
  for (const r of requests) {
    assert.ok(r.addChart.chart.spec.subtitle, 'un gráfico sin la pregunta que contesta es decoración')
  }
})

test('LA NECESIDAD DIARIA VA PRIMERA, A TODO EL ANCHO, Y NO DESALINEA A LOS DEMÁS', () => {
  // El dueño pidió que los gráficos estén ALINEADOS. El defecto que atrapa: calcular el lugar de cada
  // uno por su índice en la lista. Cuando una serie falta —pasa: el ranking se vacía si no hay
  // contrapartes en la ventana— los de atrás se corren y la grilla se desarma.
  const pos = (rs) => rs.map((r) => r.addChart.chart.position.overlayPosition)
  const todos = pos(graficos(7, ANEXO, SERIES).requests)
  assert.equal(todos[0].offsetXPixels, 0, 'la necesidad arranca pegada al margen')
  assert.ok(todos[0].widthPixels > todos[1].widthPixels, 'y ocupa las dos columnas')
  // Los dos de abajo: misma altura, uno al lado del otro.
  assert.equal(todos[1].offsetXPixels, 0)
  assert.ok(todos[2].offsetXPixels > 0)
  assert.equal(todos[1].offsetYPixels, todos[2].offsetYPixels)
  assert.ok(todos[1].offsetYPixels > todos[0].offsetYPixels)

  // Y SIN la necesidad, los dos restantes suben: no queda una fila en blanco arriba.
  const sinNec = pos(graficos(7, ANEXO, { ...SERIES, necesidad: null }).requests)
  assert.equal(sinNec.length, 2)
  assert.equal(sinNec[0].offsetXPixels, 0)
  assert.equal(sinNec[0].offsetYPixels, 0)
  assert.equal(sinNec[0].offsetYPixels, sinNec[1].offsetYPixels)
})

test('LA EVOLUCIÓN DE LA CAJA YA NO SE DIBUJA: el dueño la reemplazó por el equilibrio', () => {
  // El defecto que atrapa: dejar los dos. Serían cinco gráficos en cuatro slots y el quinto taparía al
  // que está debajo, porque las posiciones se calculan de a dos por fila.
  const { requests, faltan } = graficos(7, ANEXO, SERIES)
  const titulos = requests.map((r) => r.addChart.chart.spec.title)
  assert.ok(!titulos.some((t) => /Evoluci[óo]n/i.test(t)), 'el gráfico de la evolución no se dibuja más')
  // Y la serie del pasado sigue en el anexo sin que su ausencia se reporte como una falla: se dejó de
  // DIBUJAR, no se borró — el dato es del dueño.
  assert.ok(!faltan.includes('historia'))
  assert.deepEqual(graficos(7, ANEXO, { ...SERIES, historia: null }).requests.length, 3)
})

test('EL EQUILIBRIO SON DOS SERIES SOBRE LOS DOCE MESES, Y SE CRUZAN', () => {
  // Es el gráfico entero: si le falta una serie no hay nada que cruzar, y si el rango no cubre el año
  // el "punto de equilibrio" se leería sobre medio año sin que nada avise.
  const spec = equilibrio()
  const b = spec.basicChart
  assert.equal(b.chartType, 'LINE', 'un cruce es un hecho de la línea: en columnas hay que buscarlo a ojo')
  assert.equal(b.lineSmoothing, true)
  assert.equal(b.series.length, 2, 'una sola serie no puede cruzarse con nada')
  const [ing, egr] = b.series.map((s) => s.series.sourceRange.sources[0])
  assert.equal(ing.startColumnIndex, COL.importe - 1)
  assert.equal(egr.startColumnIndex, COL.egreso - 1)
  // DOCE PUNTOS DE DATO, más la fila del encabezado que le da el nombre a cada curva.
  for (const s of [ing, egr, b.domains[0].domain.sourceRange.sources[0]]) {
    assert.equal(s.endRowIndex - s.startRowIndex, MESES + 1, 'doce meses y la fila de los rótulos')
    assert.equal(s.startRowIndex, SERIES.equilibrio.f0 - 2, 'el rango arranca en la fila del encabezado')
  }
  assert.equal(b.headerCount, 1, 'sin headerCount la leyenda dice "Series 1" y "Series 2"')
  assert.notEqual(b.legendPosition, 'NO_LEGEND', 'dos curvas sin leyenda no se distinguen')
})

test('EL AZUL ENTRA Y EL ROJO SALE, Y EL SUBTÍTULO LO DICE CON PALABRAS', () => {
  // Si el subtítulo nombra los colores al revés que las series, el gráfico se lee al revés — y un
  // gráfico que se lee al revés es peor que ninguno. Además es la red: si la leyenda fallara, la frase
  // sigue diciendo cuál es cuál.
  const b = equilibrio().basicChart
  const [ing, egr] = b.series.map((s) => s.color)
  assert.ok(ing.blue > ing.red, 'los ingresos van en azul')
  assert.ok(egr.red > egr.blue, 'los egresos van en rojo')
  assert.match(equilibrio().subtitle, /rojo supera al azul/)
  assert.match(equilibrio().title, /punto de equilibrio/)
})

test('LOS DATOS SALEN DEL ANEXO, NUNCA DE UNA SEGUNDA FUENTE', () => {
  // Un gráfico alimentado por su propio cálculo es la forma más elegante de tener dos verdades, y esta
  // pestaña ya pagó $41,7M por tener dos definiciones de lo mismo.
  for (const r of graficos(7, ANEXO, SERIES).requests) {
    const b = r.addChart.chart.spec.basicChart
    for (const s of [...b.series.map((x) => x.series), b.domains[0].domain]) {
      const f = s.sourceRange.sources[0]
      assert.equal(f.sheetId, ANEXO, 'la serie tiene que leer _CAJA_ANEXO, no la propia CAJA')
      // Y EL ENVOLTORIO IMPORTA: en un basicChart la ChartData va directa. Con `{ data: … }` —que es lo
      // que pide un waterfall— la API devuelve 400 "Unknown name data" y no se dibuja nada. Costó una
      // corrida contra el archivo real descubrirlo.
      assert.equal(s.data, undefined, 'en un basicChart la ChartData va SIN envoltorio `data`')
    }
  }
})

test('LAS CURVAS LEEN FECHA CONTRA IMPORTE', () => {
  const [, eq, pr] = graficos(7, ANEXO, SERIES).requests.map((r) => r.addChart.chart.spec.basicChart)
  for (const c of [eq, pr]) {
    assert.equal(c.chartType, 'LINE', 'un saldo diario es una curva: como barras son sesenta barras ilegibles')
    assert.equal(c.domains[0].domain.sourceRange.sources[0].startColumnIndex, COL.fecha - 1)
    assert.equal(c.series[0].series.sourceRange.sources[0].startColumnIndex, COL.importe - 1)
  }
  // La proyección sigue siendo UNA curva de saldo: la leyenda le robaría ancho sin agregar nada.
  assert.equal(pr.series.length, 1)
  assert.equal(pr.legendPosition, 'NO_LEGEND')
})

test('EL DE NECESIDAD SEPARA LAS DOS MAGNITUDES EN DOS EJES', () => {
  // Lo que sale un día se mide en unidades de millón; el saldo acumulado, en decenas. En un solo eje
  // las barras quedan aplastadas contra el piso y el gráfico deja de mostrar QUÉ SALE, que es la
  // mitad de la pregunta que contesta.
  const nec = graficos(7, ANEXO, SERIES).requests[0].addChart.chart.spec.basicChart
  assert.equal(nec.chartType, 'COMBO', 'COLUMN ignora el `type` por serie y dibuja siete barras')
  assert.equal(nec.stackedType, 'STACKED', 'las salidas del día se suman, no se comparan entre sí')
  const barras = nec.series.filter((x) => x.type === 'COLUMN')
  const curvas = nec.series.filter((x) => x.type === 'LINE')
  assert.equal(barras.length, SALIDAS.length, 'lo ya salido + cheques, proveedores, sueldos, cargas e impuestos')
  assert.equal(curvas.length, 4, 'plan previsto, piso sin cobrar, y el plan partido en efectivo y banco')
  assert.ok(barras.every((x) => x.targetAxis === 'LEFT_AXIS'))
  assert.ok(curvas.every((x) => x.targetAxis === 'RIGHT_AXIS'))
  assert.ok(nec.axis.some((a) => a.position === 'RIGHT_AXIS'), 'sin el eje derecho declarado no hay dos escalas')
  // Y la punteada es la del peor caso: si las dos fueran llenas habría que leer la leyenda para
  // saber cuál es el piso, y el piso es el número con el que se decide.
  assert.match(curvas[1].lineStyle.type, /DASH/)
})

test('EL ANCLA CAE DEBAJO DE LA GRILLA, y el generador garantiza esa fila', () => {
  // Los gráficos FLOTAN, pero su ancla es una celda REAL: si la hoja no llega a esa fila, `addChart`
  // devuelve 400 y se cae el lote entero. Y van DEBAJO y no a la derecha: la portada mide veinte filas
  // y tiene que entrar en una pantalla — un gráfico a la derecha obliga a scrollear en horizontal.
  const { requests } = graficos(7, ANEXO, SERIES)
  for (const r of requests) {
    const p = r.addChart.chart.position.overlayPosition
    assert.equal(p.anchorCell.rowIndex, FILA_ANCLA)
    assert.equal(p.anchorCell.columnIndex, COL_ANCLA)
  }
  // La necesidad diaria arriba a todo el ancho; los otros cuatro, dos por fila debajo.
  const xs = requests.map((r) => r.addChart.chart.position.overlayPosition.offsetXPixels)
  const ys = requests.map((r) => r.addChart.chart.position.overlayPosition.offsetYPixels)
  assert.equal(xs[0], 0)
  assert.equal(ys[0], 0)
  assert.ok(ys[1] > 0 && xs[1] === 0, 'el equilibrio abre la segunda fila')
  assert.ok(xs[2] > 0 && ys[2] === ys[1], 'la proyección va a su lado')
  const src = readFileSync(new URL('../scripts/caja-pestana.mjs', import.meta.url), 'utf8')
  assert.match(src, /FILA_ANCLA \+ 4/, 'el generador tiene que extender la hoja hasta pasado el ancla')
  assert.match(src, /gridProperties\.rowCount/, 'y pedirle a la API que cambie el alto, no suponerlo')
})

test('SE BORRAN TODOS LOS DE LA PESTAÑA ANTES DE DIBUJAR, y los borrados van primero', async () => {
  // `addChart` SIEMPRE agrega: sin borrar, la corrida de cada dos horas apila doce por día.
  //
  // LA REGLA CAMBIÓ Y SE DECLARA: antes se borraban sólo los propios, para no tocar el que dibujara el
  // dueño. Ahora se borran TODOS por orden explícita —*"eliminá TODOS los actuales de la pestaña"*— y
  // porque el rediseño lo obliga: cualquier gráfico anterior lee filas de un layout que ya no existe,
  // así que dibujaría una curva perfecta de datos equivocados.
  const reqs = await requestsDeGraficos(fake([
    { chartId: 1, title: `${MARCA}El recorrido de la caja` },
    { chartId: 3, title: 'un gráfico que hizo el dueño sobre el layout viejo' },
  ]), 'file', 7, ANEXO, SERIES)
  assert.deepEqual(reqs.filter((r) => r.deleteEmbeddedObject).map((r) => r.deleteEmbeddedObject.objectId), [1, 3])
  assert.equal(reqs.filter((r) => r.addChart).length, 3)
  assert.ok(reqs.findIndex((r) => r.deleteEmbeddedObject) < reqs.findIndex((r) => r.addChart),
    'al revés se borraría el que se acaba de crear')
})

test('NINGUNA SALIDA SE QUEDA MUDA: si no dibuja, dice por qué', async () => {
  // Es el defecto que este archivo pagó: no se dibujó nada y el log no dijo nada.
  const dichos = []
  const warn = console.warn
  console.warn = (m) => dichos.push(String(m))
  try {
    assert.deepEqual(await requestsDeGraficos(fake([]), 'f', 7, undefined, SERIES), [])
    assert.deepEqual(await requestsDeGraficos({ getCharts: async () => { throw new Error('429') } }, 'f', 7, ANEXO, SERIES), [])
    assert.deepEqual(await requestsDeGraficos(fake([]), 'f', 7, ANEXO, {}), [])
    // Y una serie que falta NO cancela las otras: media portada es mejor que ninguna.
    const parcial = await requestsDeGraficos(fake([]), 'f', 7, ANEXO, { ...SERIES, equilibrio: null })
    assert.equal(parcial.filter((r) => r.addChart).length, 2)
    assert.ok(dichos.some((d) => d.includes('equilibrio')), 'el que no se dibuja se nombra')
  } finally { console.warn = warn }
  assert.ok(dichos.some((d) => d.includes('_CAJA_ANEXO')), 'sin el sheetId del anexo se dice cuál falta')
  assert.ok(dichos.some((d) => d.includes('429')), 'el error de la API se propaga al log, no se traga')
  assert.ok(dichos.some((d) => d.includes('necesidad')), 'la serie que falta se nombra')
})

test('el cliente de Google expone getCharts: sin eso el módulo no puede borrar', () => {
  // Se verifica sobre el FUENTE porque instanciar el cliente pide credenciales. Un método que no existe
  // haría fallar el `catch` genérico y el skip se vería igual que un 429 — dos causas, un solo síntoma.
  const src = readFileSync(new URL('./google.mjs', import.meta.url), 'utf8')
  assert.match(src, /async getCharts\(fileId\)/, 'falta el lector de gráficos en el cliente')
  assert.match(src, /charts\(chartId,spec\(title\)\)/, 'y tiene que traer el título')
})

test('LAS DOS CURVAS DE SALDO NO SE DIBUJAN CON LA COLUMNA DE UNA BARRA', () => {
  // EL DEFECTO QUE ATRAPA (28/08/2026): las columnas del gráfico estaban escritas a mano
  // (`[9,10,11,12,13]` para las barras, 14 y 15 para las curvas). Agregar el balde de «Ya salió»
  // corre todo lo que está a su derecha, así que con los números viejos la curva del saldo se habría
  // dibujado con la columna de impuestos: un gráfico perfecto de otra cosa, sin un solo error. Acá
  // las columnas salen de `COL_NECESIDAD`, que las cuenta sobre la misma lista que las escribe.
  const nec = graficos(7, ANEXO, SERIES).requests[0].addChart.chart.spec.basicChart
  const columnaDe = (serie) => serie.series.sourceRange.sources[0].startColumnIndex + 1
  const barras = nec.series.filter((x) => x.type === 'COLUMN')
  const curvas = nec.series.filter((x) => x.type === 'LINE')
  assert.deepEqual(barras.map(columnaDe), [...COL_NECESIDAD.salidas])
  // Cuatro curvas desde el 01/09/2026: el plan, el piso, y el plan partido en efectivo y banco.
  assert.deepEqual(curvas.map(columnaDe), [
    COL_NECESIDAD.saldoCobrando, COL_NECESIDAD.saldoSinCobrar,
    COL_NECESIDAD.saldoEfectivo, COL_NECESIDAD.saldoBanco,
  ])
  assert.equal(nec.domains[0].domain.sourceRange.sources[0].startColumnIndex + 1, COL_NECESIDAD.dia)
  // Y ninguna columna se dibuja dos veces: dos series sobre el mismo rango es una que falta.
  const todas = [...barras, ...curvas].map(columnaDe)
  assert.equal(new Set(todas).size, todas.length)
})

test('LO QUE YA SALIÓ VA AL PIE DE LA PILA Y CON OTRO COLOR', () => {
  // La pregunta del gráfico es cuánta plata hay que CONSEGUIR. Si lo ya ejecutado se pinta con la
  // misma paleta que los cinco rubros pendientes, la pila se lee como una sola necesidad y el dueño
  // vuelve a ver $4,2M de «Proveedores» que ya se pagaron. Va primero (abajo) y en gris claro.
  const nec = graficos(7, ANEXO, SERIES).requests[0].addChart.chart.spec.basicChart
  assert.ok(esEjecutado(SALIDAS[0]), 'el balde de lo ejecutado es el primero de la pila')
  const barras = nec.series.filter((x) => x.type === 'COLUMN')
  const claridad = (c) => c.red + c.green + c.blue
  assert.ok(barras.slice(1).every((x) => claridad(x.color) < claridad(barras[0].color)),
    'la barra de lo ya pagado es la más clara de la pila: no compite con lo que hay que decidir')
})

test('EL SUBTÍTULO DICE CON PALABRAS CUÁL ES CUÁL, y nombra las dos mitades', () => {
  // La leyenda nombra las series; el subtítulo tiene que decir cuál de las dos mitades hay que ir a
  // conseguir. El dueño pidió *"que el gráfico muestre la información tal cual es"*: si la frase no
  // está, el gráfico separa los datos y no explica la separación.
  const spec = graficos(7, ANEXO, SERIES).requests[0].addChart.chart.spec
  assert.match(spec.subtitle, /YA SALIÓ/)
  assert.match(spec.subtitle, /FALTA PAGAR/)
  assert.match(spec.subtitle, /descontado del saldo/, 'dice POR QUÉ lo ya salido no es necesidad')
})
