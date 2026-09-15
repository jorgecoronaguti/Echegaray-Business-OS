// EL DESPLEGABLE DE «OBRA»: la lista, dónde empieza la validación y qué cuenta como puesta.
//
// El test NO arma la lista con `opcionesDeObra` para compararla contra `opcionesDeObra`: los rótulos
// esperados están escritos a mano acá. Una lista validada contra la misma función que la produce no
// puede dar rojo.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ALTO_MINIMO_AUX, AUX, celdaPrimerDato, filasDeLaLista, problemaDeCelda, problemasDeLaColumna,
  rangoDeDatos, requestDeLaLista, requestsDeValidacion,
} from './obra-desplegable.mjs'
import { catalogoDeDestinos, opcionesDeObra } from './obra-destino.mjs'
import { INSERCIONES } from '../scripts/sheet-insertar-columna-obra.mjs'

const [COMPRAS, COBRANZAS] = INSERCIONES

test('la lista lleva encabezado, conserva el orden, y saca vacíos y repetidos', () => {
  const filas = filasDeLaLista(['ES-ADM · Estructura – Administración', '', '  ', 'OB-0021 · ME', 'OB-0021 · ME', null])
  assert.deepEqual(filas, [['Obra'], ['ES-ADM · Estructura – Administración'], ['OB-0021 · ME']])
})

test('las opciones son las de la app: fijos, obras vivas por código y «Sin obra – cliente»', () => {
  const obras = [
    { id: 'a', codigo: 'OB-0021', nombre: 'ME - PLAYÓN DE AZUFRE', cliente_texto: 'MINERA', fusionada_en: null },
    { id: 'b', codigo: 'OB-0007', nombre: 'TALLER', cliente_texto: 'MINERA', fusionada_en: null },
    { id: 'c', codigo: 'OB-0003', nombre: 'VIEJA', cliente_texto: 'MINERA', fusionada_en: 'a' },
  ]
  const cat = catalogoDeDestinos({ obras, clienteAlias: new Map([['minera', 'MINERA']]) })
  const filas = filasDeLaLista(opcionesDeObra(cat)).map(([t]) => t)
  assert.deepEqual(filas, [
    'Obra',
    'ES-ADM · Estructura – Administración',
    'ES-TAL · Estructura – Taller',
    'OB-0007 · TALLER',
    'OB-0021 · ME - PLAYÓN DE AZUFRE',
    'Sin obra – MINERA',
  ])
  assert.ok(!filas.includes('OB-0003 · VIEJA'), 'una obra fusionada no se ofrece')
})

test('la escritura de la lista rellena con null hasta el alto mínimo: borra la obra que ya no está', () => {
  const r = requestDeLaLista({ sheetId: 7, filas: filasDeLaLista(['OB-0021 · ME']) })
  assert.equal(r.updateCells.range.endRowIndex, ALTO_MINIMO_AUX)
  assert.equal(r.updateCells.rows.length, ALTO_MINIMO_AUX)
  assert.deepEqual(r.updateCells.rows[1].values[0].userEnteredValue, { stringValue: 'OB-0021 · ME' })
  assert.equal(r.updateCells.rows[2].values[0].userEnteredValue, null)
  assert.equal(r.updateCells.fields, 'userEnteredValue')
})

test('sin sheetId no se escribe la lista a ciegas', () => {
  assert.throws(() => requestDeLaLista({ sheetId: undefined, filas: [['Obra']] }), /sin sheetId/)
})

const FILAS = { Compras: 1262, Cobranzas: 352 }
const validaciones = (ins = INSERCIONES) => requestsDeValidacion(ins, (p) => ({ Compras: 1, Cobranzas: 2 })[p], (p) => FILAS[p])

test('EL DEFECTO: la validación arranca en la fila de DATOS, no en la del rótulo', () => {
  const req = validaciones().filter((r) => r.setDataValidation.range.endRowIndex === undefined)
  const [c, cob] = req.map((r) => r.setDataValidation.range)
  assert.deepEqual(c, { sheetId: 1, startRowIndex: 3, startColumnIndex: 11, endColumnIndex: 12 })   // Compras L4:L
  assert.deepEqual(cob, { sheetId: 2, startRowIndex: 4, startColumnIndex: 7, endColumnIndex: 8 })   // Cobranzas H5:H
  assert.equal(c.startRowIndex, COMPRAS.filaEncabezado, 'el encabezado de Compras queda fuera')
  assert.equal(cob.startRowIndex, COBRANZAS.filaEncabezado, 'el encabezado de Cobranzas queda fuera')
  assert.equal(rangoDeDatos(COMPRAS), 'Compras!L4:L')
  assert.equal(celdaPrimerDato(COBRANZAS), 'Cobranzas!H5')
})

test('la regla es ONE_OF_RANGE contra la auxiliar, con lista visible y NO estricta', () => {
  const [{ setDataValidation: { rule, range } }] = validaciones([COMPRAS])
  assert.equal(rule.condition.type, 'ONE_OF_RANGE')
  assert.equal(rule.condition.values[0].userEnteredValue, `='${AUX}'!$A$2:$A`)
  assert.equal(rule.showCustomUi, true)
  assert.equal(rule.strict, false)
  assert.equal(range.endRowIndex, undefined, 'sin fin: una fila nueva nace con el desplegable')
})

test('sin sheetId, o sin saber cuántas filas tiene la grilla, no se pone el desplegable a ciegas', () => {
  assert.throws(() => requestsDeValidacion(INSERCIONES, () => undefined, () => 100), /sin sheetId/)
  assert.throws(() => requestsDeValidacion(INSERCIONES, () => 1, () => undefined), /cuántas filas/)
  assert.throws(() => requestsDeValidacion([COMPRAS], () => 1, () => 2), /cuántas filas/)
})

test('EL DEFECTO: van DOS requests por columna — el default no pisa la regla heredada de la columna de al lado', () => {
  const req = validaciones([COMPRAS])
  assert.equal(req.length, 2)
  assert.equal(req[0].setDataValidation.range.endRowIndex, undefined, 'primero el default de la columna (filas futuras)')
  assert.equal(req[1].setDataValidation.range.endRowIndex, FILAS.Compras, 'después celda por celda hasta el fin de la grilla')
  assert.equal(req[1].setDataValidation.rule.condition.type, 'ONE_OF_RANGE')
})

// ═══ LA PRUEBA DEL EFECTO: lo que dice la celda releída, no lo que contestó el batchUpdate ═══

const hojaCon = (dv) => ({ properties: { title: 'Compras' }, data: [{ startRow: 3, rowData: [{ values: [dv ? { dataValidation: dv } : {}] }] }] })
const buena = { condition: { type: 'ONE_OF_RANGE', values: [{ userEnteredValue: `='${AUX}'!$A$2:$A` }] }, showCustomUi: true }

test('una celda con la regla puesta no tiene problema', () => {
  assert.deepEqual(problemasDeLaColumna(hojaCon(buena), COMPRAS), [])
})

test('EL DEFECTO: la celda sin validación, con otra condición, apuntando a otro lado o estricta, se nombra', () => {
  assert.match(problemaDeCelda(null, 'Compras!L4'), /sin ninguna validación/)
  assert.match(problemaDeCelda({ condition: { type: 'ONE_OF_LIST', values: [] } }, 'Compras!L4'), /no ONE_OF_RANGE/)
  assert.match(problemaDeCelda({ condition: { type: 'ONE_OF_RANGE', values: [{ userEnteredValue: '=Otra!$A$2:$A' }] } }, 'x'), /no a _OBRAS_OS/)
  assert.match(problemaDeCelda({ ...buena, strict: true }, 'x'), /quedó estricta/)
  assert.match(problemasDeLaColumna(hojaCon(null), COMPRAS).join(' '), /1 de 1 celda\(s\) sin el desplegable/)
  assert.match(problemasDeLaColumna(undefined, COMPRAS).join(' '), /no pude releer/)
})

test('EL DEFECTO QUE COSTÓ UNA CORRIDA: se mira la COLUMNA, no la primera celda', () => {
  // Cobranzas H: 5 filas, la 1ª con el desplegable y dos escondidas por el filtro que quedaron con la
  // lista heredada de la G. Mirando sólo la primera, esto daba verde.
  const heredada = { condition: { type: 'ONE_OF_LIST', values: [{ userEnteredValue: 'Administracion' }] } }
  const hoja = { properties: { title: 'Cobranzas' }, data: [{ startRow: 4, rowData: [buena, buena, heredada, buena, heredada].map((dv) => ({ values: [{ dataValidation: dv }] })) }] }
  const p = problemasDeLaColumna(hoja, COBRANZAS)
  assert.match(p[0], /2 de 5 celda\(s\) sin el desplegable/)
  assert.match(p[1], /Cobranzas!H7/)
  assert.match(p[2], /Cobranzas!H9/)
})
