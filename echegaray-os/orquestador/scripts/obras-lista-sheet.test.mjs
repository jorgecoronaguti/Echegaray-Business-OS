// LA LISTA EN EL SHEET, CON UN DOBLE DE GOOGLE: crea la auxiliar, escribe, y sólo cierra si la RELEE.
//
// El doble devuelve lo que "quedó" en la pestaña por separado de lo que se le escribió, para poder
// simular el caso que importa: la API contesta 200 y la celda no quedó. Un verificador que leyera de la
// misma estructura que escribió no podría dar rojo.
import test from 'node:test'
import assert from 'node:assert/strict'
import { ponerDesplegable, refrescarLista, refrescarTodo } from './obras-lista-sheet.mjs'
import { AUX } from '../lib/obra-desplegable.mjs'
import { INSERCIONES } from './sheet-insertar-columna-obra.mjs'

const OPCIONES = ['ES-ADM · Estructura – Administración', 'OB-0021 · ME - PLAYÓN DE AZUFRE']

// LA GRILLA DE COBRANZAS, EN CHIQUITO: filas 5, 6 y 7 con su clave de orden (columna R, índice 17) al
// revés de como la ordenaría el filtro. Es el fixture que deja ver el daño: si algo repone el filtro,
// Google ORDENA y estas tres filas cambian de lugar.
const GRILLA_COBRANZAS = () => [
  { fila: 5, a: '1', b: '01-000048', clave: 46056 },
  { fila: 6, a: '2', b: '01-000049', clave: 46037 },
  { fila: 7, a: '3', b: '01-00000201', clave: 46006 },
]

function dobleDeGoogle({ conAux = false, quedaEnLaHoja = null, validaciones = 'bien', conFiltro = false, fallaElFiltro = false } = {}) {
  const llamadas = []
  let grilla = GRILLA_COBRANZAS()
  const hojas = [{ title: 'Compras', sheetId: 1, rows: 900, cols: 60 }, { title: 'Cobranzas', sheetId: 2, rows: 500, cols: 40 }]
  if (conAux) hojas.push({ title: AUX, sheetId: 9, rows: 300, cols: 1 })
  let escrito = []
  return {
    llamadas,
    /** Lo que se leería en Cobranzas!A5:B7 en este instante. */
    cobranzasA5B7: () => grilla.map((f) => [f.a, f.b]),
    async getSheetMeta() { llamadas.push('meta'); return hojas.map((h) => ({ ...h })) },
    async spreadsheetBatchUpdate(_id, requests) {
      for (const r of requests) {
        if (r.addSheet) { llamadas.push('addSheet'); hojas.push({ title: r.addSheet.properties.title, sheetId: 9, rows: 300, cols: 1 }); continue }
        if (r.appendDimension) { llamadas.push('appendDimension'); continue }
        if (r.setDataValidation) { llamadas.push(`validar:${r.setDataValidation.range.sheetId}`); continue }
        if (r.updateCells?.fields === 'dataValidation') {
          assert.ok(r.updateCells.rows.every((f) => f.values[0].dataValidation), 'cada fila lleva la regla')
          llamadas.push(`validarCeldas:${r.updateCells.range.sheetId}`); continue
        }
        if (r.clearBasicFilter) { llamadas.push(`sacarFiltro:${r.clearBasicFilter.sheetId}`); continue }
        if (r.setBasicFilter) {
          llamadas.push(`devolverFiltro:${r.setBasicFilter.filter.range.sheetId}`)
          // ═══ LO QUE GOOGLE HACE DE VERDAD (medido en la copia, 15/09/2026) ═══
          // `setBasicFilter` con `sortSpecs` no "deja el filtro como estaba": APLICA el orden y mueve
          // las filas FÍSICAMENTE. Sin esto en el doble, el test pasaba con el bug puesto.
          if (r.setBasicFilter.filter?.sortSpecs?.length) {
            const orden = [...grilla].sort((x, y) => x.clave - y.clave)
            grilla = orden.map((f, i) => ({ ...f, fila: grilla[i].fila }))
          }
          if (fallaElFiltro) throw new Error('500 al devolver el filtro')
          continue
        }
        llamadas.push('escribirLista')
        escrito = r.updateCells.rows.map((f) => f.values[0].userEnteredValue?.stringValue ?? '')
      }
      return {}
    },
    async readSheetValues(_id, rango) {
      llamadas.push(`leer:${rango}`)
      const filas = quedaEnLaHoja ?? escrito.slice(1)
      return filas.map((t) => [t])
    },
    async readSheetValidations(_id, rangos) {
      llamadas.push(`leerValidaciones:${rangos.join(',')}`)
      const dv = { condition: { type: 'ONE_OF_RANGE', values: [{ userEnteredValue: `='${AUX}'!$A$2:$A` }] }, showCustomUi: true }
      const heredada = { condition: { type: 'ONE_OF_LIST', values: [{ userEnteredValue: 'Administracion' }] } }
      // Tres filas por columna: la del medio es la que el filtro escondía.
      const celdas = validaciones === 'bien' ? [dv, dv, dv] : [dv, heredada, dv]
      return INSERCIONES.map((ins) => ({
        properties: { title: ins.pestana },
        data: [{ startRow: ins.filaEncabezado, rowData: celdas.map((c) => ({ values: [{ dataValidation: c }] })) }],
      }))
    },
    async apiGetSheets() {
      llamadas.push('leerFiltros')
      return { sheets: hojas.map((h) => ({
        properties: { sheetId: h.sheetId, title: h.title },
        ...(conFiltro && h.title === 'Cobranzas' ? { basicFilter: { range: { sheetId: h.sheetId, startRowIndex: 3, endRowIndex: 352 }, sortSpecs: [{ dimensionIndex: 17 }] } } : {}),
      })) }
    },
  }
}

const mudo = () => {}

test('sin --aplicar no llama a ninguna API de escritura', async () => {
  const g = dobleDeGoogle()
  const r = await refrescarLista({ google: g, id: 'COPIA', opciones: OPCIONES, aplicar: false, log: mudo })
  assert.equal(r.paso, 'dry')
  assert.deepEqual(g.llamadas, [])
})

test('crea la auxiliar oculta si no está, escribe la lista y la relee', async () => {
  const g = dobleDeGoogle()
  const r = await refrescarLista({ google: g, id: 'COPIA', opciones: OPCIONES, aplicar: true, log: mudo })
  assert.equal(r.ok, true, JSON.stringify(r))
  assert.ok(g.llamadas.includes('addSheet'))
  assert.ok(g.llamadas.includes('escribirLista'))
  assert.ok(g.llamadas.includes(`leer:'${AUX}'!A2:A`), 'la prueba es la relectura')
})

test('si la auxiliar ya existe no se vuelve a crear', async () => {
  const g = dobleDeGoogle({ conAux: true })
  await refrescarLista({ google: g, id: 'COPIA', opciones: OPCIONES, aplicar: true, log: mudo })
  assert.ok(!g.llamadas.includes('addSheet'))
})

test('EL DEFECTO: la API contesta bien y la hoja quedó con otra lista → NO cierra', async () => {
  const g = dobleDeGoogle({ quedaEnLaHoja: ['ES-ADM · Estructura – Administración'] })
  const r = await refrescarLista({ google: g, id: 'COPIA', opciones: OPCIONES, aplicar: true, log: mudo })
  assert.equal(r.ok, false)
  assert.equal(r.paso, 'relectura')
  assert.match(r.detalle.join(), /quedó con 1 opción/)
})

test('EL DEFECTO: una celda de la columna sin la regla → el desplegable NO se da por puesto', async () => {
  const g = dobleDeGoogle({ conAux: true, validaciones: 'faltan' })
  const r = await ponerDesplegable({ google: g, id: 'COPIA', log: mudo })
  assert.equal(r.ok, false)
  assert.equal(r.paso, 'relectura')
  assert.match(r.detalle.join(' '), /Compras!L4:L: 1 de 3 celda\(s\) sin el desplegable/)
  assert.match(r.detalle.join(' '), /Compras!L5: la validación es ONE_OF_LIST/)
  assert.match(r.detalle.join(' '), /Cobranzas!H5:H: 1 de 3/)
})

test('EL DEFECTO: NUNCA se toca el filtro de la pestaña — reponerlo con su orden reordena las filas', async () => {
  const g = dobleDeGoogle({ conAux: true, conFiltro: true })
  const r = await ponerDesplegable({ google: g, id: 'COPIA', log: mudo })
  assert.equal(r.ok, true, JSON.stringify(r))
  assert.ok(!g.llamadas.some((x) => /Filtro/.test(x)), 'ni se saca ni se repone ningún filtro')
})

// ═══ EL DEFECTO QUE COSTÓ 2.572 CELDAS (copia de ensayo, 15/09/2026) ═══
//
// Poner el desplegable llegó a hacerse sacando el filtro de Cobranzas y reponiéndolo después, porque
// las filas que el filtro esconde no reciben `setDataValidation`. El filtro de Cobranzas trae
// `sortSpecs` (columna R, después C), y reponerlo NO devuelve la pestaña como estaba: Google ORDENA y
// mueve las filas de lugar. En la copia, la fila 5 pasó a tener la factura 01-00000201 y la 6 la
// 01-000048 que estaba en la 5: 2.572 celdas distintas, un dato de cobranza mudado de fila. Eso es
// EXACTAMENTE el daño que la inserción entera trata de evitar.
//
// El test compara el CONTENIDO de las filas antes y después, no las llamadas: una corrección futura
// que vuelva a tocar el filtro por otro camino también lo pone rojo.
test('EL DEFECTO: después de poner el desplegable, la fila 5 sigue teniendo lo que tenía', async () => {
  const g = dobleDeGoogle({ conAux: true, conFiltro: true })
  const antes = g.cobranzasA5B7()
  assert.deepEqual(antes, [['1', '01-000048'], ['2', '01-000049'], ['3', '01-00000201']])
  await ponerDesplegable({ google: g, id: 'COPIA', log: mudo })
  assert.deepEqual(g.cobranzasA5B7(), antes, 'ninguna fila de Cobranzas puede cambiar de lugar')
})

test('la columna se valida dos veces: default de columna y celda por celda con máscara dataValidation', async () => {
  const g = dobleDeGoogle({ conAux: true })
  await ponerDesplegable({ google: g, id: 'COPIA', log: mudo })
  for (const x of ['validar:1', 'validarCeldas:1', 'validar:2', 'validarCeldas:2']) assert.ok(g.llamadas.includes(x), x)
})

test('el orden es lista → validaciones: la regla necesita que el rango ya exista', async () => {
  const g = dobleDeGoogle()
  const r = await refrescarTodo({ google: g, id: 'COPIA', opciones: OPCIONES, aplicar: true, log: mudo })
  assert.equal(r.ok, true, JSON.stringify(r))
  assert.ok(g.llamadas.indexOf('escribirLista') < g.llamadas.indexOf('validar:1'))
  assert.ok(g.llamadas.includes('validar:1') && g.llamadas.includes('validar:2'))
})

test('si la lista no cierra, las validaciones NO se ponen: apuntarían a un rango vacío', async () => {
  const g = dobleDeGoogle({ quedaEnLaHoja: [] })
  const r = await refrescarTodo({ google: g, id: 'COPIA', opciones: OPCIONES, aplicar: true, log: mudo })
  assert.equal(r.ok, false)
  assert.ok(!g.llamadas.some((x) => x.startsWith('validar:')))
})
