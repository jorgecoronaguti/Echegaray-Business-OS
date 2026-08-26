import test from 'node:test'
import assert from 'node:assert/strict'
import { propiedadesDe, reclamoDe } from '../services/panelCompraSheet.ts'
import type { FilaConPapel } from '../services/comprasSheetService.ts'

// LAS DOS FUNCIONES PURAS DEL PANEL. Se prueban sin montar React porque lo que se protege es lo que
// el panel AFIRMA sobre una fila —qué falta, con qué palabra y en qué color—, no cómo lo dibuja.
// «NULL nunca es cero» es un invariante del Design System y acá es donde se puede romper sin que
// nadie lo note: un `saldo_pendiente` en 0 dibujado como «debe $0» diría lo contrario de la verdad.

const fila = (p: Partial<FilaConPapel> = {}): FilaConPapel => ({
  fila: 892, sheet_id: null, clave: 'k', fecha: '2026-08-25', proveedor: 'Corralon Progreso',
  tipo: 'A', comprobante: '0004-00003745', concepto: 'Grifería', detalle_obra: null,
  obra_texto: 'LA ESTRELLA', unidad_negocio: 'Civil', categoria: 'Directo', importe: 251666,
  iva: 52849, total: 304515.98, estado: 'Pendiente', estado_pago: null, tipo_pago: 'Echeq',
  modalidad: null, fecha_prevista: null, monto_pagado: 0, saldo_pendiente: 0, cuit: null,
  anulada: false, adjuntos: [],
  ...p,
} as unknown as FilaConPapel)

const valor = (f: FilaConPapel, k: string) => propiedadesDe(f).find((p) => p.k === k)

test('las ocho propiedades de la v2 están y en su orden', () => {
  assert.deepEqual(propiedadesDe(fila()).map((p) => p.k), [
    'Fecha', 'Comprobante', 'Destino', 'Unidad', 'Tipo de costo', 'Forma de pago',
    'Deuda parcial', 'Origen',
  ])
})

test('la forma de pago y el tipo de costo son los del Sheet, no un invento', () => {
  assert.equal(valor(fila(), 'Forma de pago')?.v, 'Echeq')
  assert.equal(valor(fila(), 'Tipo de costo')?.v, 'Directo')
  assert.equal(valor(fila(), 'Unidad')?.v, 'Civil')
})

test('deuda en 0 dice «sin deuda» en verde, NUNCA «debe $0»', () => {
  const p = valor(fila({ saldo_pendiente: 0 }), 'Deuda parcial')
  assert.equal(p?.v, 'sin deuda')
  assert.equal(p?.tono, 'ok')
})

test('deuda mayor que cero se nombra y va en ámbar', () => {
  const p = valor(fila({ saldo_pendiente: 304515.98 }), 'Deuda parcial')
  // `pesos()` escribe el peso entero: es la escala que el canon fija para las pantallas
  // transaccionales (`24` Compras). El centavo vive en el Sheet, no en la pantalla.
  assert.equal(p?.v, '$ 304.516')
  assert.equal(p?.tono, 'falta')
})

test('una asignación de estructura no se pinta como obra', () => {
  assert.equal(valor(fila({ obra_texto: 'Taller' }), 'Destino')?.tono, 'apagado')
  assert.equal(valor(fila({ obra_texto: 'LA ESTRELLA' }), 'Destino')?.tono, undefined)
})

test('sin tipo de costo, una fila de estructura lo explica y una de obra dice que falta', () => {
  assert.equal(valor(fila({ categoria: null, obra_texto: 'F931' }), 'Tipo de costo')?.v, 'Estructura · no de obra')
  assert.equal(valor(fila({ categoria: null, obra_texto: 'MESSINA' }), 'Tipo de costo')?.v, 'sin clasificar')
})

test('sin comprobante va en ámbar: es trabajo pendiente, no un dato ausente cualquiera', () => {
  const p = valor(fila({ comprobante: null }), 'Comprobante')
  assert.equal(p?.v, 'sin comprobante')
  assert.equal(p?.tono, 'falta')
})

test('el reclamo prioriza lo que bloquea más: sin obra antes que sin comprobante', () => {
  const r = reclamoDe(fila({ obra_texto: null, comprobante: null, saldo_pendiente: 5000 }))
  assert.equal(r?.filtro, 'sinObra')
  assert.match(String(r?.texto), /no impacta en ninguna obra/)
})

test('cada reclamo trae su verbo y el filtro que junta a todas las iguales', () => {
  assert.equal(reclamoDe(fila({ comprobante: null }))?.filtro, 'sinComprobante')
  assert.equal(reclamoDe(fila({ saldo_pendiente: 5000 }))?.filtro, 'aPagar')
})

test('una fila completa no reclama nada — la banda ámbar no se dibuja', () => {
  assert.equal(reclamoDe(fila()), null)
})
