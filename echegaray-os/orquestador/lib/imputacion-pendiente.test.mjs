import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  agruparPendientes, estadoDeFila, historialDeRecurso, indexarAlias, resumirPorTipo, sugerirObra,
} from './imputacion-pendiente.mjs'

// Cada prueba de acá describe una forma concreta de fabricar plata en la obra equivocada. Si se
// revierte la regla que la impide, la prueba se pone roja.

const ALIAS = [
  { alias: 'san francisco', obra_id: 'san-francisco', clasificacion: 'obra', ejemplo_raw: 'SAN FRANCISCO' },
  { alias: 'estrella', obra_id: 'la-estrella', clasificacion: 'obra', ejemplo_raw: 'LA ESTRELLA' },
  { alias: 'administracion', obra_id: null, clasificacion: 'indirecto', ejemplo_raw: 'Administración' },
  { alias: 'quattropani', obra_id: 'quattropani', clasificacion: 'obra', ejemplo_raw: 'Quattropani (pestaña del tracker)' },
]
const indice = indexarAlias(ALIAS)

const compra = (over = {}) => ({
  tipo: 'compra', id: over.id ?? 'c1', tabla: 'costos_obra', referencia: 'FA-0001', fuente: 'compras_sheet',
  fecha: '2026-05-01', descripcion: 'Hierro', importe: 100, recurso: 'FERRETEC', texto: 'SAN FRANCISCO', ...over,
})

test('el texto ya resuelto no es pendiente, y el de estructura tampoco', () => {
  assert.equal(estadoDeFila('SAN FRANCISCO', indice), 'obra')
  assert.equal(estadoDeFila('Administración', indice), 'estructura')
  assert.equal(estadoDeFila('SERV. TECNICO', indice), 'pendiente')
  assert.equal(estadoDeFila('   ', indice), 'sin_texto')
})

test('una ubicación vacía se cuenta aparte: ningún alias puede resolver un texto que no existe', () => {
  const filas = [compra({ texto: '' }), compra({ id: 'c2', texto: 'SERV. TECNICO' })]
  assert.equal(agruparPendientes(filas, indice).length, 1, 'la fila sin texto entró a la cola')
  assert.equal(resumirPorTipo(filas, indice).compra.sin_texto, 1)
})

test('el resumen separa imputado de estructura: 533/845 no son 312 pendientes', () => {
  const filas = [
    compra({ id: 'a', texto: 'SAN FRANCISCO' }),
    compra({ id: 'b', texto: 'Administración' }),
    compra({ id: 'c', texto: 'SERV. TECNICO' }),
  ]
  assert.deepEqual(resumirPorTipo(filas, indice).compra,
    { total: 3, obra: 1, estructura: 1, pendiente: 1, sin_texto: 0 })
})

test('las filas se agrupan por la clave exacta y el grupo ordena por plata', () => {
  const filas = [
    compra({ id: 'a', texto: 'SERV. TECNICO', importe: 10 }),
    compra({ id: 'b', texto: 'Serv Tecnico', importe: 5 }),
    compra({ id: 'c', texto: 'TALLER NUEVO', importe: 900 }),
    { tipo: 'herramienta', id: 'h1', tabla: 'herramientas', referencia: '5a432e23', fuente: 'appsheet_sheet',
      fecha: null, descripcion: 'ESSAB', importe: null, recurso: '5a432e23', texto: 'SERV. TECNICO' },
  ]
  const grupos = agruparPendientes(filas, indice)
  assert.deepEqual(grupos.map((g) => g.clave), ['taller nuevo', 'serv tecnico'])
  const serv = grupos[1]
  assert.equal(serv.cantidad, 3, 'las tres filas del mismo texto tienen que resolverse juntas')
  assert.deepEqual(serv.textos, ['SERV. TECNICO', 'Serv Tecnico'])
  assert.deepEqual(serv.origenes, ['costos_obra', 'herramientas'])
  assert.equal(serv.importe, 15)
})

test('NUNCA se sugiere por parecido de nombre: «Estrella Norte» no es «La Estrella»', () => {
  const g = agruparPendientes([compra({ texto: 'Estrella Norte' })], indice)[0]
  assert.equal(sugerirObra(g, { aliasFilas: ALIAS }), null)
})

test('el texto idéntico ya resuelto SÍ es evidencia, y se preselecciona', () => {
  // Caso real: el alias quedó bajo `quattropani` pero el ejemplo crudo normaliza distinto, así que
  // el mismo texto vuelve a aparecer como pendiente.
  const g = agruparPendientes([compra({ texto: 'Quattropani (pestaña del tracker)' })], indice)[0]
  const s = sugerirObra(g, { aliasFilas: ALIAS })
  assert.equal(s.obra_id, 'quattropani')
  assert.equal(s.evidencia, 'texto_identico')
  assert.equal(s.preseleccionar, true)
})

test('dos personas que resolvieron el mismo texto distinto no producen sugerencia', () => {
  const enConflicto = [
    ...ALIAS,
    { alias: 'otra clave', obra_id: 'la-estrella', clasificacion: 'obra', ejemplo_raw: 'Quattropani (pestaña del tracker)' },
  ]
  const g = agruparPendientes([compra({ texto: 'Quattropani (pestaña del tracker)' })], indice)[0]
  assert.equal(sugerirObra(g, { aliasFilas: enConflicto }), null)
})

test('el historial de un recurso sólo cuenta compras que resolvieron a una obra', () => {
  const h = historialDeRecurso([
    compra({ id: '1', recurso: 'FERRETEC', texto: 'SAN FRANCISCO' }),
    compra({ id: '2', recurso: 'ferretec', texto: 'SAN FRANCISCO' }),
    compra({ id: '3', recurso: 'FERRETEC', texto: 'Administración' }),
    compra({ id: '4', recurso: 'FERRETEC', texto: 'SERV. TECNICO' }),
  ], indice)
  assert.equal(h.get('FERRETEC').filas, 2, 'contó una compra de estructura o una pendiente')
  assert.deepEqual([...h.get('FERRETEC').obras], ['san-francisco'])
})

test('un proveedor unánime sugiere, pero NO preselecciona: es inferencia, no hecho', () => {
  const resueltas = ['a', 'b', 'c'].map((id) => compra({ id, recurso: 'FERRETEC', texto: 'SAN FRANCISCO' }))
  const historial = historialDeRecurso(resueltas, indice)
  const g = agruparPendientes([compra({ id: 'x', recurso: 'FERRETEC', texto: 'DEPOSITO NUEVO' })], indice)[0]
  const s = sugerirObra(g, { aliasFilas: ALIAS, historial })
  assert.equal(s.obra_id, 'san-francisco')
  assert.equal(s.preseleccionar, false, 'una inferencia preseleccionada se confirma sin leerla')
})

test('un proveedor que compró para dos obras no es evidencia de ninguna', () => {
  const historial = historialDeRecurso([
    compra({ id: 'a', recurso: 'FERRETEC', texto: 'SAN FRANCISCO' }),
    compra({ id: 'b', recurso: 'FERRETEC', texto: 'SAN FRANCISCO' }),
    compra({ id: 'c', recurso: 'FERRETEC', texto: 'LA ESTRELLA' }),
  ], indice)
  const g = agruparPendientes([compra({ id: 'x', recurso: 'FERRETEC', texto: 'DEPOSITO NUEVO' })], indice)[0]
  assert.equal(sugerirObra(g, { aliasFilas: ALIAS, historial }), null)
})

test('dos compras del mismo proveedor no alcanzan: la unanimidad de casualidad no es evidencia', () => {
  const historial = historialDeRecurso([
    compra({ id: 'a', recurso: 'FERRETEC', texto: 'SAN FRANCISCO' }),
    compra({ id: 'b', recurso: 'FERRETEC', texto: 'SAN FRANCISCO' }),
  ], indice)
  const g = agruparPendientes([compra({ id: 'x', recurso: 'FERRETEC', texto: 'DEPOSITO NUEVO' })], indice)[0]
  assert.equal(sugerirObra(g, { aliasFilas: ALIAS, historial }), null)
})

test('LA TRAMPA MEDIDA: el historial de una herramienta NO sugiere adónde va el texto', () => {
  // 18/08/2026, filas reales: la herramienta 5a432e23 tuvo un movimiento a SAN FRANCISCO y después
  // uno a SERV. TECNICO. Sugerir San Francisco mandaría a esa obra TODO lo que diga «SERV. TECNICO».
  const historial = historialDeRecurso([
    { tipo: 'movimiento', id: 'm0', tabla: 'movimientos_herramienta', referencia: 'x', fuente: 'appsheet_sheet',
      fecha: null, descripcion: 'ESSAB', importe: null, recurso: '5a432e23', texto: 'SAN FRANCISCO' },
  ], indice)
  const g = agruparPendientes([
    { tipo: 'movimiento', id: 'm1', tabla: 'movimientos_herramienta', referencia: 'c186e09f', fuente: 'appsheet_sheet',
      fecha: null, descripcion: 'ESSAB', importe: null, recurso: '5a432e23', texto: 'SERV. TECNICO' },
  ], indice)[0]
  assert.equal(sugerirObra(g, { aliasFilas: ALIAS, historial }), null)
})

test('un grupo con dos proveedores distintos no tiene recurso unánime', () => {
  const historial = historialDeRecurso(
    ['a', 'b', 'c'].map((id) => compra({ id, recurso: 'FERRETEC', texto: 'SAN FRANCISCO' })), indice)
  const g = agruparPendientes([
    compra({ id: 'x', recurso: 'FERRETEC', texto: 'DEPOSITO NUEVO' }),
    compra({ id: 'y', recurso: 'METALIS', texto: 'DEPOSITO NUEVO' }),
  ], indice)[0]
  assert.equal(sugerirObra(g, { aliasFilas: ALIAS, historial }), null)
})
