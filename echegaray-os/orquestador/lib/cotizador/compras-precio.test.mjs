// LO QUE ESTOS TESTS ATRAPAN: que una factura pagada se convierta en un precio unitario que ECSAS
// nunca pagó.
//
// TODOS los conceptos de acá son texto LITERAL de `public.compra_sheet` al 30/08/2026. No son casos
// inventados para que el parser quede bien: son las filas que el parser tiene que sobrevivir.

import test from 'node:test'
import assert from 'node:assert/strict'
import { cantidadEnTexto, precioUnitarioPagado, casaConRecurso, comprasDeRecurso } from './compras-precio.mjs'

test('cantidadEnTexto · la cantidad NO está siempre al principio del texto', () => {
  assert.equal(cantidadEnTexto('10 M3 - RIPIO').cantidad.valor, 10)
  assert.equal(cantidadEnTexto('Arena 5m3').cantidad.valor, 5)
  assert.equal(cantidadEnTexto('Arena 5m3').cantidad.unidad, 'm3')
  assert.equal(cantidadEnTexto('100 m2 de Porcelanato SMOKE').cantidad.unidad, 'm2')
})

test('cantidadEnTexto · «520 m2» no se lee como 520 metros — se reusa el diccionario de unidades', () => {
  const c = cantidadEnTexto('Porcelanato 520 m2').cantidad
  assert.equal(c.unidad, 'm2')
  assert.notEqual(c.unidad, 'm', 'leer m2 como metros es el error de unidad más caro de un cómputo')
})

test('cantidadEnTexto · la coma decimal del formato argentino sobrevive', () => {
  const c = cantidadEnTexto('Diesel 500 (combustible) 61,6740 u').cantidad
  assert.equal(c.unidad, 'un')
  assert.ok(Math.abs(c.valor - 61.674) < 1e-9, `esperaba 61,674 y dio ${c.valor}`)
})

test('cantidadEnTexto · «x 25 kg» es la PRESENTACIÓN, no lo que se compró', () => {
  const r = cantidadEnTexto('Cemento Holcim x 25 kg [historial: unidad]')
  assert.equal(r.cantidad, null)
  assert.match(r.porQue, /PRESENTACIÓN/)
})

test('cantidadEnTexto · dos cantidades distintas no dan una', () => {
  const r = cantidadEnTexto('Thinner sello oro 1L pintura Brilloplast 4L')
  assert.equal(r.cantidad, null)
  assert.match(r.porQue, /2 cantidades distintas/)
})

test('cantidadEnTexto · sin unidad no hay por qué dividir', () => {
  assert.equal(cantidadEnTexto('Plegado de chapas').cantidad, null)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// LAS CUATRO TRAMPAS
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('precioUnitarioPagado · importe 0 NO es un precio de $0 — 192 filas reales están así', () => {
  const r = precioUnitarioPagado({ concepto: '10 M3 - RIPIO', importe: 0, fecha: '2026-02-21', anulada: false })
  assert.equal(r.sirve, false)
  assert.equal(r.precioUnitario, null, 'SIN_PRECIO nunca es $0, ni siquiera por la puerta de atrás')
  assert.equal(r.motivo, 'IMPORTE_CERO')
})

test('precioUnitarioPagado · un pago PARCIAL no se divide por la cantidad total', () => {
  // Fila real: $2.700.000 son la cuota 2 de 4 de un hormigonado de 600 m². El precio unitario real
  // es ~$18.000/m²; dividir la cuota da $4.500/m², CUATRO VECES más barato.
  const r = precioUnitarioPagado({
    concepto: 'Hormigonado 600 m² — pago 2 de 4 (vence 11/09/2026) · a cuenta',
    importe: 2_700_000, fecha: '2026-08-27', anulada: false,
  })
  assert.equal(r.sirve, false)
  assert.equal(r.motivo, 'PAGO_PARCIAL')
  assert.match(r.porQue, /más barato que el real/)
})

test('precioUnitarioPagado · una fila con varios ítems no le atribuye el importe a ninguno', () => {
  const r = precioUnitarioPagado({
    concepto: 'Ripio común, cemento Loma Negra y flete 10 m3', importe: 102_479.44, fecha: '2026-08-26', anulada: false,
  })
  assert.equal(r.sirve, false)
  assert.equal(r.motivo, 'VARIOS_ITEMS')
})

test('precioUnitarioPagado · una compra anulada no ocurrió', () => {
  const r = precioUnitarioPagado({ concepto: '10 M3 - RIPIO', importe: 500_000, fecha: '2026-02-21', anulada: true })
  assert.equal(r.sirve, false)
  assert.equal(r.motivo, 'ANULADA')
})

test('precioUnitarioPagado · cuando la fila SÍ sirve, sale el precio Y cómo se calculó', () => {
  const r = precioUnitarioPagado({
    fila: 812, concepto: '100 m2 de Porcelanato SMOKE', importe: 1_556_840.94,
    fecha: '2026-06-17', proveedor: 'Corralon Progreso', anulada: false,
  })
  assert.equal(r.sirve, true)
  assert.ok(Math.abs(r.precioUnitario - 15_568.4094) < 1e-6)
  assert.equal(r.unidad, 'm2')
  assert.match(r.porQue, /÷ 100 m2/)
  assert.equal(r.evidencia.tabla, 'public.compra_sheet')
  assert.equal(r.evidencia.fila, 812, 'sin la fila de origen la evidencia no se puede volver a mirar')
})

test('precioUnitarioPagado · TODO descarte sale con motivo: cero es distinto de «no busqué»', () => {
  for (const f of [
    { concepto: 'x', importe: 0 }, { concepto: 'x', importe: null },
    { concepto: 'pago 1 de 3', importe: 10 }, { concepto: 'nada', importe: 10, anulada: true },
  ]) {
    const r = precioUnitarioPagado(f)
    assert.ok(r.motivo, `«${f.concepto}» se descartó sin motivo`)
    assert.ok(r.porQue, `«${f.concepto}» se descartó sin explicación`)
  }
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// EL CRUCE CONCEPTO ↔ RECURSO
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('casaConRecurso · exige TODOS los tokens del recurso, no alguno', () => {
  assert.equal(casaConRecurso({ nombreRecurso: 'CEMENTO PORTLAND', concepto: 'Cemento Holcim x 25 kg' }).casa, false)
  assert.equal(casaConRecurso({ nombreRecurso: 'CEMENTO PORTLAND', concepto: 'Cemento Portland a granel 10 tn' }).casa, true)
})

test('casaConRecurso · el que no casa DICE qué token faltó', () => {
  const r = casaConRecurso({ nombreRecurso: 'CEMENTO PORTLAND', concepto: 'Cemento Holcim' })
  assert.match(r.porQue, /portland/)
  assert.match(r.porQue, /puede ser otro producto/)
})

test('casaConRecurso · un nombre de puro ruido no casa con todo', () => {
  const r = casaConRecurso({ nombreRecurso: 'de la obra', concepto: 'Cemento Holcim' })
  assert.equal(r.casa, false)
  assert.match(r.porQue, /ningún token significativo/)
})

test('comprasDeRecurso · una compra en m2 no le sirve a un recurso que se cotiza en m3', () => {
  const { observaciones, descartes } = comprasDeRecurso({
    recurso: { nombre: 'PORCELANATO SMOKE', unidad: 'm3' },
    filas: [{ concepto: '100 m2 de Porcelanato SMOKE', importe: 1_556_840.94, fecha: '2026-06-17' }],
  })
  assert.equal(observaciones.length, 0)
  assert.equal(descartes[0].motivo, 'UNIDAD_INCOMPATIBLE')
})

test('comprasDeRecurso · devuelve la más reciente primero y con evidencia citable', () => {
  const { observaciones } = comprasDeRecurso({
    recurso: { nombre: 'RIPIO', unidad: 'm3' },
    filas: [
      { fila: 10, concepto: '10 M3 - RIPIO', importe: 400_000, fecha: '2026-02-21' },
      { fila: 55, concepto: '20 M3 - RIPIO', importe: 1_000_000, fecha: '2026-07-15' },
      { fila: 90, concepto: '10 M3 - RIPIO', importe: 0, fecha: '2026-08-01' },
    ],
  })
  assert.equal(observaciones.length, 2)
  assert.equal(observaciones[0].observadoEn, '2026-07-15')
  assert.equal(observaciones[0].precio, 50_000)
  assert.equal(observaciones[1].precio, 40_000)
  assert.equal(observaciones[0].evidencia.fila, 55)
})

test('comprasDeRecurso · nada que casa ⇒ nada que descartar de ESTE recurso', () => {
  const r = comprasDeRecurso({
    recurso: { nombre: 'RIPIO', unidad: 'm3' },
    filas: [{ concepto: 'Grifería monocomando cromo 2 un', importe: 87_958.46, fecha: '2026-08-25' }],
  })
  assert.equal(r.observaciones.length, 0)
  assert.equal(r.descartes.length, 0, 'una compra de otra cosa no es un descarte de este recurso')
})
