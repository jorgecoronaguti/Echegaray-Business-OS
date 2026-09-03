// EL LOTE DE LOS GRÁFICOS DE CAJA, MEDIDO SIN RED — Y LA RELECTURA QUE PRUEBA EL EFECTO.
//
// EL DEFECTO QUE ATRAPA, MEDIDO EN EL ARCHIVO REAL EL 03/09/2026 A LAS 08:25. La pestaña CAJA tenía 55
// filas y los cuatro gráficos anclados donde correspondía (23, 38, 53 y 53). El request estaba bien y
// la pestaña estaba rota: con 55 filas el editor vivo de Google sube el bloque anclado en la 53 hasta
// que entre y lo dibuja encima del anterior. El generador garantizaba el alto AL PRINCIPIO de la
// corrida —veinte llamadas antes del `addChart`— y nadie volvía a mirar la hoja después de escribirla.
//
// Estos tests miden las dos cosas que arreglan eso: que el resize viaje en el MISMO lote que los
// gráficos y ANTES de ellos, y que el generador RELEA la hoja y se ponga rojo si no quedó bien.
import test from 'node:test'
import assert from 'node:assert/strict'
import { grilla, formatear } from './caja-pestana.mjs'
import { ROTULOS, LARGO } from '../lib/caja-anexo-series.mjs'
import { FILA_FINAL_DE_GRAFICOS, layoutEsperado } from '../lib/caja-graficos.mjs'

const SHEET = 7
const TITULO = 'CAJA'
const REFS = {
  bancoRaw: '_BANCO_RAW', cheques: 'Cheques Emitidos', tarjeta: 'Tarjeta de Credito',
  chequesRaw: '_CHEQUES_RAW', filasCal: { iva: 18, iibb: 19 },
}

/** La columna A del anexo con los rótulos de las tres series que se dibujan y sus filas debajo. */
function colaDelAnexo() {
  const filas = []
  for (const clave of ['equilibrio', 'proyeccion', 'necesidad']) {
    filas.push([ROTULOS[clave]])
    for (let i = 0; i < LARGO[clave]; i++) filas.push([`${i + 1}`])
  }
  while (filas.length < 600) filas.push([''])
  return filas
}

/**
 * El cliente que no escribe: junta los LOTES (no los requests sueltos — acá lo que se mide es qué
 * viaja junto con qué) y devuelve la hoja que se le diga al releer.
 */
function clienteFalso({ rows = 55, alReleer, romperRelectura = false, sinMeta = false } = {}) {
  const lotes = []
  const rangosLeidos = []
  return {
    lotes,
    rangosLeidos,
    google: {
      async spreadsheetBatchUpdate(_id, rs) {
        lotes.push(rs)
        // Los replies vienen en el MISMO orden que los requests: es lo que usa reafirmarEspecificaciones.
        return { replies: (rs || []).map((r, i) => (r.addChart ? { addChart: { chart: { chartId: 100 + i } } } : {})) }
      },
      async getRowGroups() { return [] },
      async getConditionalFormats() { return [] },
      async readSheetValues() { return colaDelAnexo() },
      async getCharts() { return [{ sheetId: SHEET, title: TITULO, charts: [] }] },
      async getSheetMeta() {
        if (sinMeta) throw new Error('429')
        return [{ sheetId: SHEET, title: TITULO, rows, cols: 10 }]
      },
      async getGridData(_id, rango) {
        rangosLeidos.push(rango)
        if (romperRelectura) throw new Error('429')
        const l = alReleer ?? { rows: FILA_FINAL_DE_GRAFICOS + 1, charts: layoutEsperado() }
        return {
          sheets: [{
            properties: { title: TITULO, gridProperties: { rowCount: l.rows } },
            charts: l.charts.map((c, i) => ({
              chartId: 100 + i,
              position: { overlayPosition: { anchorCell: { sheetId: SHEET, rowIndex: c.fila }, ...(c.x ? { offsetXPixels: c.x } : {}) } },
              spec: { title: c.titulo },
            })),
          }],
        }
      },
    },
  }
}

/** Corre `formatear` con la consola tapada y el exitCode aislado: un test no cambia el del proceso. */
async function correr(opciones) {
  const { lotes, rangosLeidos, google } = clienteFalso(opciones)
  const dicho = []
  const { log, warn } = console
  const antes = process.exitCode
  console.log = (...a) => dicho.push(a.join(' '))
  console.warn = (...a) => dicho.push(a.join(' '))
  process.exitCode = 0
  try {
    await formatear(google, SHEET, grilla(new Map(), REFS), { sheetId: 99, title: '_CAJA_ANEXO' }, TITULO)
    return { lotes, rangosLeidos, dicho, exitCode: process.exitCode }
  } finally {
    console.log = log; console.warn = warn; process.exitCode = antes
  }
}

/** El lote de los gráficos es el que trae los `addChart`. */
const loteDeGraficos = (lotes) => lotes.find((l) => l.some((r) => r.addChart))

test('EL RESIZE VIAJA EN EL MISMO LOTE QUE LOS GRÁFICOS, Y PRIMERO', () => {
  // La mutación que este test prohíbe: mandar `charts` a secas y confiar en el resize del principio de
  // la corrida. Entre uno y otro hay veinte llamadas a la API; lo que achique la hoja en el medio deja
  // los gráficos sobre una hoja corta y el editor los apila.
  return correr({ rows: 55 }).then(({ lotes }) => {
    const lote = loteDeGraficos(lotes)
    const iResize = lote.findIndex((r) => r.updateSheetProperties?.properties?.gridProperties?.rowCount)
    const iPrimerChart = lote.findIndex((r) => r.addChart)
    assert.ok(iResize >= 0, 'el lote de los gráficos garantiza el alto de la hoja')
    assert.ok(iResize < iPrimerChart, 'el resize va ANTES del primer addChart: Google aplica en orden')
    assert.equal(lote[iResize].updateSheetProperties.properties.gridProperties.rowCount, FILA_FINAL_DE_GRAFICOS + 1)
    assert.equal(lote[iResize].updateSheetProperties.fields, 'gridProperties.rowCount')
  })
})

test('EL RESIZE NUNCA ACHICA: sobre una hoja de 200 filas pide 200', async () => {
  // Declarar `FILA_FINAL_DE_GRAFICOS + 1` a secas borraría 132 filas con lo que tengan adentro. Un
  // request de tamaño que achica es un deleteDimension con otro nombre.
  const { lotes } = await correr({ rows: 200 })
  const resize = loteDeGraficos(lotes).find((r) => r.updateSheetProperties)
  assert.equal(resize.updateSheetProperties.properties.gridProperties.rowCount, 200)
})

test('CADA updateChartSpec LLEVA EL TÍTULO DEL GRÁFICO CUYO ID USA', async () => {
  // El emparejamiento ya no es por posición (límite L2 de la auditoría): la guarda descarta requests
  // en silencio y los replies vuelven alineados a la lista FILTRADA, así que un índice no identifica
  // nada. Se mide contra lo que la HOJA dijo que tiene: id ↔ título.
  const { lotes } = await correr({ rows: 55 })
  const reafirmar = lotes.find((l) => l.some((r) => r.updateChartSpec))
  const enLaHoja = new Map(layoutEsperado().map((c, i) => [100 + i, c.titulo]))
  assert.equal(reafirmar.length, 4)
  for (const r of reafirmar) {
    assert.equal(enLaHoja.get(r.updateChartSpec.chartId), r.updateChartSpec.spec.title)
  }
})

test('ROJO SI LA HOJA NO QUEDÓ BIEN: se relee, y 55 filas terminan en exit 1', async () => {
  // Es el estado real del 03/09: cuatro gráficos dibujados, cuatro anclas correctas, y la hoja corta.
  // Sin esta relectura el generador imprimía «4 gráfico(s) dibujados» y se iba con exit 0.
  const { dicho, exitCode } = await correr({ alReleer: { rows: 55, charts: layoutEsperado() } })
  assert.equal(exitCode, 1)
  assert.match(dicho.join('\n'), /✗ el layout de gráficos NO quedó bien/)
  assert.match(dicho.join('\n'), /55 filas y necesita 68/)
})

test('ROJO TAMBIÉN SI FALTA UN GRÁFICO, con la hoja del alto correcto', async () => {
  const charts = layoutEsperado().slice(0, 3)
  const { dicho, exitCode } = await correr({ alReleer: { rows: FILA_FINAL_DE_GRAFICOS + 1, charts } })
  assert.equal(exitCode, 1)
  assert.match(dicho.join('\n'), /falta el gráfico/)
})

test('VERDE: 68 filas y los cuatro en su ancla — y lo dice con los números leídos', async () => {
  const { dicho, exitCode } = await correr({})
  assert.equal(exitCode, 0)
  assert.match(dicho.join('\n'), /✓ layout verificado sobre la hoja: 68 filas y 4 gráfico\(s\)/)
})

test('NO PODER RELEER NO ES «QUEDÓ BIEN»: exit 1, no verde', async () => {
  // LÍMITE L1 DE LA AUDITORÍA (03/09). Antes esto imprimía el aviso y salía con exit 0 — «verde sin
  // haber mirado», que es el modo de falla exacto que esta rama existe para cerrar. Un 429 en la
  // relectura no dice que la pestaña quedó bien: dice que no se sabe, y eso se informa como rojo.
  const { dicho, exitCode } = await correr({ romperRelectura: true })
  assert.equal(exitCode, 1)
  assert.match(dicho.join('\n'), /no pude verificar el efecto/)
  assert.doesNotMatch(dicho.join('\n'), /✓ layout verificado/)
})

test('SI SE PUDO LEER, SE REAFIRMAN LOS EJES CONTRA LOS ID DE LA HOJA', async () => {
  // El emparejamiento dejó de ser por posición (ver caja-pestana-reafirmar.test.mjs): acá se mide que
  // el lote de updateChartSpec use los chartId que devolvió LA HOJA y no los índices del batch.
  const { lotes } = await correr({})
  const reafirmar = lotes.find((l) => l.some((r) => r.updateChartSpec))
  assert.equal(reafirmar.length, 4)
  assert.deepEqual(reafirmar.map((r) => r.updateChartSpec.chartId), [100, 101, 102, 103])
})

test('SIN getSheetMeta, LA RELECTURA USA EL NOMBRE REAL DE LA PESTAÑA', async () => {
  // LÍMITE L4 DE LA AUDITORÍA (03/09). El fallback era la constante PESTAÑA = 'Caja', que es la CLAVE
  // con la que se busca la pestaña —`hallarPestana` no distingue mayúsculas—, no su nombre: la pestaña
  // se llama 'CAJA'. Un rango con el nombre equivocado no lee de menos: lee otra cosa, o 400.
  const { rangosLeidos } = await correr({ sinMeta: true })
  assert.deepEqual(rangosLeidos, [`'${TITULO}'`])
})
