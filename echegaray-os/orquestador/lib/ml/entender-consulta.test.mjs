// LO QUE UNA PREGUNTA PIDE, ANTES DE BUSCAR. Cada test afirma algo que, si se rompiera, devolvería
// el documento equivocado con total confianza.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { entenderConsulta, pasaFiltros } from './entender-consulta.mjs'

test('un período se convierte en filtro, no en palabras para el modelo', () => {
  // Es la razón de existir de este archivo: hay 47 volantes de pago que dicen exactamente lo mismo
  // salvo el período. Ningún modelo semántico distingue octubre de noviembre — no es significado,
  // es igualdad.
  const r = entenderConsulta('el volante de pago de octubre de 2023')
  assert.equal(r.tipo, 'vep')
  assert.equal(r.periodo, '2023-10')
  assert.ok(!/octubre|2023/.test(r.resto), 'y esas palabras salen del texto que ve el modelo')
})

test('«setiembre» es septiembre: en Argentina se escribe de las dos formas', () => {
  assert.equal(entenderConsulta('el recibo de sueldo de setiembre de 2025').periodo, '2025-09')
})

test('lo que la pregunta NO nombra no se inventa', () => {
  // Un filtro inventado no devuelve menos resultados: devuelve los EQUIVOCADOS.
  const r = entenderConsulta('¿qué le debemos a DUPEC?')
  assert.equal(r.tipo, null)
  assert.equal(r.periodo, null)
  assert.equal(r.cuit, null)
  assert.equal(r.filtros, 0)
})

test('un número de comprobante no se confunde con un CUIT', () => {
  // «0001-00001181» sin guiones también tiene once dígitos: tomarlo por CUIT devolvería el
  // documento de otro proveedor.
  const r = entenderConsulta('la factura 0001-00001181')
  assert.equal(r.comprobante, '0001-00001181')
  assert.equal(r.cuit, null)
})

test('un CUIT sí se reconoce, escrito como sea', () => {
  assert.equal(entenderConsulta('¿dónde está el CUIT 20-28773782-4?').cuit, '20287737824')
  assert.equal(entenderConsulta('20287737824').cuit, '20287737824')
})

test('el año solo alcanza para filtrar por año, no por mes', () => {
  const r = entenderConsulta('los acuses de 2024')
  assert.equal(r.anio, 2024)
  assert.equal(r.periodo, null, 'sin mes no hay período: no se inventa enero')
})

// ── EL FILTRO SOBRE UN DOCUMENTO ────────────────────────────────────────────────────────────────

const DOC = { tipo: 'vep', campos: { periodo: '2023-10', cuit: '20117932428' } }

test('un filtro que la pregunta no nombró NO restringe', () => {
  // Ausencia no es restricción. Si esto fallara, cualquier documento sin CUIT cargado quedaría
  // excluido de toda búsqueda que no mencione un CUIT — o sea, de casi todas.
  assert.equal(pasaFiltros(DOC, entenderConsulta('el volante de pago')), true)
})

test('el período filtra de verdad', () => {
  assert.equal(pasaFiltros(DOC, entenderConsulta('el volante de pago de octubre de 2023')), true)
  assert.equal(pasaFiltros(DOC, entenderConsulta('el volante de pago de noviembre de 2023')), false)
})

test('el tipo filtra de verdad', () => {
  assert.equal(pasaFiltros(DOC, entenderConsulta('la factura de octubre de 2023')), false)
})

test('el período se puede deducir de la fecha del documento cuando no hay campo propio', () => {
  const d = { tipo: 'factura', campos: { fecha: '2026-03-15' } }
  assert.equal(pasaFiltros(d, entenderConsulta('la factura de marzo de 2026')), true)
  assert.equal(pasaFiltros(d, entenderConsulta('la factura de abril de 2026')), false)
})

test('un CUIT distinto excluye, aunque todo lo demás coincida', () => {
  assert.equal(pasaFiltros(DOC, entenderConsulta('el volante de pago del CUIT 20-28773782-4')), false)
})
