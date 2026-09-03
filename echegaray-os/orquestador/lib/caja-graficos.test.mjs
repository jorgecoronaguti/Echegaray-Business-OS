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
import {
  graficos, requestsDeGraficos, MARCA, FILA_ANCLA, COL_ANCLA, FILA_FINAL_DE_GRAFICOS,
  TITULO_EQUILIBRIO, TITULO_NECESIDAD, TITULO_EFECTIVO_BANCO, TITULO_PROYECCION,
  layoutEsperado, verificarLayoutGraficos, requestDeAltoMinimo,
} from './caja-graficos.mjs'
import { CLASE, clasificarRequest } from './clasificar-request.mjs'
import { SALIDAS, COL_NECESIDAD, esEjecutado } from './caja-necesidad-baldes.mjs'
import { COL, MESES } from './caja-anexo-series.mjs'

const SERIES = {
  equilibrio: { f0: 26, f1: 37 }, historia: { f0: 40, f1: 99 }, proyeccion: { f0: 101, f1: 160 },
  pagos: { f0: 162, f1: 166 }, cobranzas: { f0: 168, f1: 172 }, necesidad: { f0: 174, f1: 203 },
}
const ANEXO = 99
const fake = (charts) => ({ getCharts: async () => [{ sheetId: 7, title: 'Caja', charts }] })
// Por TÍTULO, no por posición: desde que el reparto efectivo/banco es su propio gráfico, el equilibrio
// dejó de estar en un índice fijo. Ubicarlo por lo que ES lo hace inmune al orden de la lista.
const porTitulo = (t, s = SERIES) => graficos(7, ANEXO, s).requests.find((r) => r.addChart.chart.spec.title === t).addChart.chart.spec
const equilibrio = (s = SERIES) => porTitulo(TITULO_EQUILIBRIO, s)

test('SON CUATRO Y CADA UNO CONTESTA UNA PREGUNTA DISTINTA', () => {
  // El dueño los eligió: ¿alcanza la caja a treinta días?, ¿dónde va a estar la plata (efectivo vs
  // banco)?, ¿el año se paga solo?, ¿cómo viene el saldo a sesenta? El reparto efectivo/banco nació el
  // 01/09 en su propio gráfico: apilado en el de «¿alcanza?» eran cuatro curvas entre seis barras y no
  // se leía. Las dos concentraciones las mandó sacar el 20/08 y sus series siguen en el anexo.
  const { requests, faltan } = graficos(7, ANEXO, SERIES)
  assert.equal(requests.length, 4)
  assert.deepEqual(faltan, [])
  assert.deepEqual(requests.map((r) => r.addChart.chart.spec.title), [
    TITULO_NECESIDAD, TITULO_EFECTIVO_BANCO, TITULO_EQUILIBRIO, `${MARCA}Proyección de la caja`,
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
  assert.ok(todos[0].widthPixels > todos[2].widthPixels, 'y ocupa las dos columnas')
  // El reparto efectivo/banco: también a todo el ancho, en su propia fila debajo de la necesidad.
  assert.equal(todos[1].offsetXPixels, 0, 'el reparto arranca pegado al margen')
  assert.ok(todos[1].widthPixels > todos[2].widthPixels, 'y también ocupa las dos columnas')
  // La separación vertical la da la FILA-ANCLA (cada bloque en su celda), no el offset: apilar
  // full-width por offsetY hacía que el editor vivo de Google colapsara el de abajo y no se viera.
  const filaDe = (p) => p.anchorCell.rowIndex
  assert.ok(filaDe(todos[1]) > filaDe(todos[0]), 'el reparto cuelga de una fila-ancla debajo de la necesidad')
  // Los dos de abajo (equilibrio y proyección): misma fila-ancla, uno al lado del otro.
  assert.equal(todos[2].offsetXPixels, 0)
  assert.ok(todos[3].offsetXPixels > 0)
  assert.equal(filaDe(todos[2]), filaDe(todos[3]), 'equilibrio y proyección comparten fila-ancla')
  assert.ok(filaDe(todos[2]) > filaDe(todos[1]), 'y van debajo del reparto')

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
  assert.deepEqual(graficos(7, ANEXO, { ...SERIES, historia: null }).requests.length, 4)
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
  const eq = porTitulo(TITULO_EQUILIBRIO).basicChart
  const pr = porTitulo(`${MARCA}Proyección de la caja`).basicChart
  for (const c of [eq, pr]) {
    assert.equal(c.chartType, 'LINE', 'un saldo diario es una curva: como barras son sesenta barras ilegibles')
    assert.equal(c.domains[0].domain.sourceRange.sources[0].startColumnIndex, COL.fecha - 1)
    assert.equal(c.series[0].series.sourceRange.sources[0].startColumnIndex, COL.importe - 1)
  }
  // La proyección sigue siendo UNA curva de saldo: la leyenda le robaría ancho sin agregar nada.
  assert.equal(pr.series.length, 1)
  assert.equal(pr.legendPosition, 'NO_LEGEND')
})

test('EL DE EFECTIVO/BANCO MUESTRA LOS EGRESOS, NO SÓLO LOS DOS SALDOS', () => {
  // El dueño rechazó la versión de dos líneas solas: *"no me sirve si no veo los egresos también"*.
  // Ahora es un COMBO: los egresos del día apilados por rubro (barras, eje izq.) y el saldo partido en
  // efectivo/banco (líneas, eje der.). El defecto que atrapa: volver a la versión de sólo dos líneas.
  const efb = porTitulo(TITULO_EFECTIVO_BANCO).basicChart
  assert.equal(efb.chartType, 'COMBO', 'sin COMBO no hay barras de egreso y líneas de saldo a la vez')
  assert.equal(efb.stackedType, 'STACKED', 'los egresos del día se apilan')
  const barras = efb.series.filter((x) => x.type === 'COLUMN')
  const curvas = efb.series.filter((x) => x.type === 'LINE')
  const columnaDe = (s) => s.series.sourceRange.sources[0].startColumnIndex + 1
  assert.deepEqual(barras.map(columnaDe), [...COL_NECESIDAD.salidas], 'los egresos son las mismas columnas que la necesidad')
  assert.deepEqual(curvas.map(columnaDe), [COL_NECESIDAD.saldoEfectivo, COL_NECESIDAD.saldoBanco], 'las dos líneas son efectivo y banco')
  assert.ok(barras.every((x) => x.targetAxis === 'LEFT_AXIS'), 'los egresos, en la escala del día (izq.)')
  assert.ok(curvas.every((x) => x.targetAxis === 'RIGHT_AXIS'), 'los saldos, en la escala acumulada (der.)')
  assert.ok(efb.axis.some((a) => a.position === 'RIGHT_AXIS'), 'sin el eje derecho declarado no hay dos escalas')
  // El verde es el efectivo y el celeste el banco: verde = más verde que rojo/azul; celeste = más azul.
  const [ef, bco] = curvas.map((x) => x.color)
  assert.ok(ef.green >= ef.red && ef.green >= ef.blue, 'el efectivo va en verde')
  assert.ok(bco.blue > bco.red, 'el banco va en celeste')
  assert.match(porTitulo(TITULO_EFECTIVO_BANCO).subtitle, /SALE cada día/, 'el subtítulo nombra los egresos')
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
  assert.equal(curvas.length, 2, 'el saldo cobrando lo previsto y el saldo sin cobrar un peso')
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
    // Cada bloque cuelga de su PROPIA fila-ancla (no se apilan por offset): el primero en FILA_ANCLA.
    assert.ok(p.anchorCell.rowIndex >= FILA_ANCLA, 'ningún bloque cuelga por encima del ancla base')
    assert.equal(p.anchorCell.columnIndex, COL_ANCLA)
  }
  // La necesidad arriba a todo el ancho; el reparto en su fila debajo; equilibrio y proyección, dos
  // por fila más abajo todavía. La separación vertical es por FILA-ANCLA, no por offsetY.
  const fila = (r) => r.addChart.chart.position.overlayPosition.anchorCell.rowIndex
  const xs = requests.map((r) => r.addChart.chart.position.overlayPosition.offsetXPixels)
  assert.equal(xs[0], 0)
  assert.equal(fila(requests[0]), FILA_ANCLA, 'la necesidad ancla en la fila base')
  assert.ok(fila(requests[1]) > fila(requests[0]) && xs[1] === 0, 'el reparto efectivo/banco abre la segunda fila, a todo el ancho')
  assert.ok(fila(requests[2]) > fila(requests[1]) && xs[2] === 0, 'el equilibrio abre la tercera fila')
  assert.ok(xs[3] > 0 && fila(requests[3]) === fila(requests[2]), 'la proyección va a su lado, misma fila')
  const src = readFileSync(new URL('../scripts/caja-pestana.mjs', import.meta.url), 'utf8')
  // CAMBIO DE CONTRATO (02/09/2026): llegar a la última ANCLA no alcanza — el editor vivo encoge
  // el gráfico que se pasa del borde de la hoja y lo sube tapando al de arriba (visto por el dueño:
  // el bloque 3 anclado en 52 de una hoja de 53 se dibujaba en la 39). La hoja llega al FINAL del
  // último bloque.
  assert.match(src, /FILA_FINAL_DE_GRAFICOS \+ 1/, 'el generador tiene que extender la hoja hasta el FINAL del último bloque, no hasta su ancla')
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
  assert.equal(reqs.filter((r) => r.addChart).length, 4)
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
    assert.equal(parcial.filter((r) => r.addChart).length, 3)
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
  assert.deepEqual(curvas.map(columnaDe), [COL_NECESIDAD.saldoCobrando, COL_NECESIDAD.saldoSinCobrar])
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

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// EL LAYOUT VERIFICADO CONTRA LO QUE DEVUELVE LA API — Y QUE EL CONTROL PUEDA DAR ROJO
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// EL DEFECTO QUE ATRAPAN, MEDIDO EN EL ARCHIVO REAL EL 03/09/2026 A LAS 08:25: CAJA tenía 55 filas (la
// fórmula vieja `filas + 20`) con los cuatro gráficos anclados donde corresponde. El request estaba
// bien y la pestaña estaba rota: el editor vivo de Google sube el bloque anclado en la fila 52 hasta
// que entre en una hoja de 55, y lo dibuja encima del bloque 2. El fix del 02/09 se cerró mirando el
// request y no la hoja — evidencia del intento, no del efecto. Estos tests miden lo LEÍDO.

// Lo que devuelve `charts(chartId,position(overlayPosition),spec(title))` cuando todo está en su lugar.
const leidoOk = () => layoutEsperado().map((e, i) => ({
  chartId: 100 + i,
  // La API omite los ceros: se los omite acá también, para medir lo que de verdad llega.
  position: { overlayPosition: { anchorCell: { sheetId: 7, rowIndex: e.fila }, ...(e.x ? { offsetXPixels: e.x } : {}) } },
  spec: { title: e.titulo },
}))

test('VERDE: 68 filas y los cuatro gráficos en su ancla', () => {
  const v = verificarLayoutGraficos({ rows: FILA_FINAL_DE_GRAFICOS + 1, charts: leidoOk() })
  assert.deepEqual(v.problemas, [])
  assert.equal(v.ok, true)
})

test('ROJO: la hoja quedó en 55 filas — el estado real del 03/09', () => {
  // La mutación es la hoja, no los gráficos: las cuatro anclas están perfectas y el layout igual está
  // roto. Si este test pasa a verde, el control dejó de mirar el alto de la grilla.
  const v = verificarLayoutGraficos({ rows: 55, charts: leidoOk() })
  assert.equal(v.ok, false)
  assert.match(v.problemas[0], /55 filas y necesita 68/)
})

test('ROJO: una fila de menos que el mínimo, y una de más ya es verde', () => {
  // El borde exacto: 67 no alcanza (el último bloque termina en la fila 67 y necesita existir entera).
  assert.equal(verificarLayoutGraficos({ rows: FILA_FINAL_DE_GRAFICOS, charts: leidoOk() }).ok, false)
  assert.equal(verificarLayoutGraficos({ rows: FILA_FINAL_DE_GRAFICOS + 2, charts: leidoOk() }).ok, true)
})

test('ROJO: falta un gráfico', () => {
  const charts = leidoOk().filter((c) => c.spec.title !== TITULO_EFECTIVO_BANCO)
  const v = verificarLayoutGraficos({ rows: 68, charts })
  assert.equal(v.ok, false)
  assert.match(v.problemas.join(' | '), /falta el gráfico «⟡ Dónde va a estar la plata/)
})

test('ROJO: un ancla corrida — el bloque 3 dibujado en la fila 39, encima del 2', () => {
  // Es literalmente lo que hace el editor vivo cuando la hoja es corta: no borra el gráfico, lo SUBE.
  // Un control que sólo contara los gráficos lo daría por bueno.
  const charts = leidoOk()
  const i = charts.findIndex((c) => c.spec.title === TITULO_EQUILIBRIO)
  charts[i].position.overlayPosition.anchorCell.rowIndex = 38
  const v = verificarLayoutGraficos({ rows: 68, charts })
  assert.equal(v.ok, false)
  assert.match(v.problemas.join(' | '), /punto de equilibrio» ancla en la fila 39 y le corresponde la 53/)
})

test('ROJO: los dos de media anchura, uno encima del otro (misma fila, mismo x)', () => {
  const charts = leidoOk()
  const i = charts.findIndex((c) => c.spec.title === TITULO_PROYECCION)
  delete charts[i].position.overlayPosition.offsetXPixels
  const v = verificarLayoutGraficos({ rows: 68, charts })
  assert.equal(v.ok, false)
  assert.match(v.problemas.join(' | '), /Proyección de la caja» arranca en x=0px/)
})

test('ROJO: el mismo gráfico dos veces — el apilado que no se ve', () => {
  const charts = leidoOk()
  charts.push({ ...charts[0], chartId: 999 })
  const v = verificarLayoutGraficos({ rows: 68, charts })
  assert.equal(v.ok, false)
  assert.match(v.problemas.join(' | '), /está 2 veces/)
})

test('EL LAYOUT ESPERADO SALE DEL GENERADOR, no de una tabla escrita al lado', () => {
  // Si mañana cambia FILAS_POR_BLOQUE, el control tiene que moverse solo. Se compara contra los
  // requests que el generador produce para las series REALES del anexo.
  const pedido = graficos(7, ANEXO, SERIES).requests.map((r) => ({
    titulo: r.addChart.chart.spec.title,
    fila: r.addChart.chart.position.overlayPosition.anchorCell.rowIndex,
    x: r.addChart.chart.position.overlayPosition.offsetXPixels ?? 0,
  }))
  assert.deepEqual(layoutEsperado(), pedido)
  // Y la última fila que ocupa el layout es la que el generador tiene que garantizar.
  assert.equal(Math.max(...pedido.map((p) => p.fila)) + 15, FILA_FINAL_DE_GRAFICOS)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// EL REQUEST DE ALTO MÍNIMO PASA LA GUARDA
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('LA GUARDA DEJA PASAR EL RESIZE QUE AGRANDA, en el mismo lote que los gráficos', () => {
  // Sin esto, meter el `updateSheetProperties` adentro del lote de los gráficos podría hacer que la
  // guarda descartara el request —y los `addChart` se dibujarían igual sobre la hoja corta—.
  const dims = new Map([[7, { rows: 55, cols: 10 }]])
  const req = requestDeAltoMinimo(7, 55)
  assert.equal(req.updateSheetProperties.properties.gridProperties.rowCount, 68)
  assert.equal(clasificarRequest(req, dims).clase, CLASE.INOCUO)
})

test('NO ACHICA NUNCA: si la hoja ya es más alta, el request pide el alto que ya tiene', () => {
  // La mutación que este test prohíbe: declarar `FILA_FINAL_DE_GRAFICOS + 1` a secas. Sobre una hoja
  // de 200 filas eso borra 132 filas con lo que tengan adentro, y la guarda lo clasifica destructivo.
  const dims = new Map([[7, { rows: 200, cols: 10 }]])
  const req = requestDeAltoMinimo(7, 200)
  assert.equal(req.updateSheetProperties.properties.gridProperties.rowCount, 200)
  assert.equal(clasificarRequest(req, dims).clase, CLASE.INOCUO)
  // Y la prueba de que la guarda SÍ sabe decir que no: el request ingenuo sobre la misma hoja.
  const ingenuo = { updateSheetProperties: { properties: { sheetId: 7, gridProperties: { rowCount: 68 } }, fields: 'gridProperties.rowCount' } }
  assert.equal(clasificarRequest(ingenuo, dims).clase, CLASE.DESTRUCTIVO)
})
