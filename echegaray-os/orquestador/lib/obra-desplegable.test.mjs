// EL DESPLEGABLE DE «OBRA»: la lista, dónde empieza la validación y qué cuenta como puesta.
//
// El test NO arma la lista con `opcionesDeObra` para compararla contra `opcionesDeObra`: los rótulos
// esperados están escritos a mano acá. Una lista validada contra la misma función que la produce no
// puede dar rojo.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ALTO_MINIMO_AUX, AUX, celdaPrimerDato, filasDeLaLista, problemaDeValidacion,
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

test('EL DEFECTO: la validación arranca en la fila de DATOS, no en la del rótulo', () => {
  const req = requestsDeValidacion(INSERCIONES, (p) => ({ Compras: 1, Cobranzas: 2 })[p])
  const [c, cob] = req.map((r) => r.setDataValidation.range)
  assert.deepEqual(c, { sheetId: 1, startRowIndex: 3, startColumnIndex: 11, endColumnIndex: 12 })   // Compras L4:L
  assert.deepEqual(cob, { sheetId: 2, startRowIndex: 4, startColumnIndex: 7, endColumnIndex: 8 })   // Cobranzas H5:H
  assert.equal(c.startRowIndex, COMPRAS.filaEncabezado, 'el encabezado de Compras queda fuera')
  assert.equal(cob.startRowIndex, COBRANZAS.filaEncabezado, 'el encabezado de Cobranzas queda fuera')
  assert.equal(rangoDeDatos(COMPRAS), 'Compras!L4:L')
  assert.equal(celdaPrimerDato(COBRANZAS), 'Cobranzas!H5')
})

test('la regla es ONE_OF_RANGE contra la auxiliar, con lista visible y NO estricta', () => {
  const [{ setDataValidation: { rule, range } }] = requestsDeValidacion([COMPRAS], () => 1)
  assert.equal(rule.condition.type, 'ONE_OF_RANGE')
  assert.equal(rule.condition.values[0].userEnteredValue, `='${AUX}'!$A$2:$A`)
  assert.equal(rule.showCustomUi, true)
  assert.equal(rule.strict, false)
  assert.equal(range.endRowIndex, undefined, 'sin fin: una fila nueva nace con el desplegable')
})

test('sin sheetId no se pone el desplegable a ciegas', () => {
  assert.throws(() => requestsDeValidacion(INSERCIONES, () => undefined), /sin sheetId/)
})

// ═══ LA PRUEBA DEL EFECTO: lo que dice la celda releída, no lo que contestó el batchUpdate ═══

const hojaCon = (dv) => ({ properties: { title: 'Compras' }, data: [{ rowData: [{ values: [dv ? { dataValidation: dv } : {}] }] }] })
const buena = { condition: { type: 'ONE_OF_RANGE', values: [{ userEnteredValue: `='${AUX}'!$A$2:$A` }] }, showCustomUi: true }

test('una celda con la regla puesta no tiene problema', () => {
  assert.equal(problemaDeValidacion(hojaCon(buena), COMPRAS), null)
})

test('EL DEFECTO: la celda sin validación, con otra condición, apuntando a otro lado o estricta, se nombra', () => {
  assert.match(problemaDeValidacion(hojaCon(null), COMPRAS), /no tiene ninguna validación/)
  assert.match(problemaDeValidacion(undefined, COMPRAS), /no tiene ninguna validación/)
  assert.match(problemaDeValidacion(hojaCon({ condition: { type: 'ONE_OF_LIST', values: [] } }), COMPRAS), /no ONE_OF_RANGE/)
  assert.match(problemaDeValidacion(hojaCon({ condition: { type: 'ONE_OF_RANGE', values: [{ userEnteredValue: '=Otra!$A$2:$A' }] } }), COMPRAS), /no a _OBRAS_OS/)
  assert.match(problemaDeValidacion(hojaCon({ ...buena, strict: true }), COMPRAS), /quedó estricta/)
})
