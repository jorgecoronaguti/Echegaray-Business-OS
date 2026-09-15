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

function dobleDeGoogle({ conAux = false, quedaEnLaHoja = null, validaciones = 'bien' } = {}) {
  const llamadas = []
  const hojas = [{ title: 'Compras', sheetId: 1, rows: 900, cols: 60 }, { title: 'Cobranzas', sheetId: 2, rows: 500, cols: 40 }]
  if (conAux) hojas.push({ title: AUX, sheetId: 9, rows: 300, cols: 1 })
  let escrito = []
  return {
    llamadas,
    async getSheetMeta() { llamadas.push('meta'); return hojas.map((h) => ({ ...h })) },
    async spreadsheetBatchUpdate(_id, requests) {
      for (const r of requests) {
        if (r.addSheet) { llamadas.push('addSheet'); hojas.push({ title: r.addSheet.properties.title, sheetId: 9, rows: 300, cols: 1 }); continue }
        if (r.appendDimension) { llamadas.push('appendDimension'); continue }
        if (r.setDataValidation) { llamadas.push(`validar:${r.setDataValidation.range.sheetId}`); continue }
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
      return INSERCIONES.map((ins) => ({
        properties: { title: ins.pestana },
        data: [{ rowData: [{ values: [validaciones === 'bien' ? { dataValidation: dv } : {}] }] }],
      }))
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

test('EL DEFECTO: la celda relee sin validación → el desplegable NO se da por puesto', async () => {
  const g = dobleDeGoogle({ conAux: true, validaciones: 'faltan' })
  const r = await ponerDesplegable({ google: g, id: 'COPIA', log: mudo })
  assert.equal(r.ok, false)
  assert.equal(r.paso, 'relectura')
  assert.equal(r.detalle.length, 2, 'las dos columnas se nombran')
  assert.match(r.detalle.join(' '), /Compras!L4:L.*no tiene ninguna validación/)
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
