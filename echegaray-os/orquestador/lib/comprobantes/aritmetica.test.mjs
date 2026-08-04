// LOS SIETE COMPROBANTES DEL 04/08, CON LOS NÚMEROS DEL PAPEL.
//
// No son ejemplos: son los siete que el bot cargó ese día en producción, tres de ellos MAL. Los
// importes están copiados del papel, uno por uno. Si alguno de estos tests se pone verde por casualidad
// es porque se cambió un número, no porque el control ande.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  identidadDelComprobante, fueraDeEscala, escalaDeTotales, pesos,
  FACTOR_FUERA_DE_ESCALA, MIN_HISTORIA_ESCALA,
} from './aritmetica.mjs'
import { necesitaRevision } from './vision.mjs'

/**
 * Los siete papeles del 04/08. `total` es el del PAPEL; `leido` (cuando está) es lo que el modelo
 * devolvió en producción — o sea el defecto.
 */
export const PAPELES = {
  alumetal: { neto: 1624951.67, iva: 341239.85, otros: 48748.55, total: 2014940.07, leido: 201494007, numero: '0038-00025942', numeroLeido: '0036-00025942', fecha: '31/07/2026' },
  acsat: { neto: 56031.00, iva: 11766.51, otros: 0, total: 67797.51, numero: '0011-00087469', fecha: '03/08/2026' },
  villaDelPino: { neto: 73458.37, iva: 15426.26, otros: 16116.04, total: 105000.67, leido: 10500067, numero: '00015-00015177', fecha: '01/08/2026' },
  barcelo: { neto: 42901.32, iva: 9009.28, otros: 8089.42, total: 60000.02, numero: '00113-00014272', fecha: '03/08/2026' },
  progreso1: { neto: 29183.12, iva: 6128.45, otros: 0, total: 35311.57, numero: '0006-00003370', fecha: '31/07/2026' },
  progreso2: { neto: 5152.07, iva: 1081.93, otros: 0, total: 6234.00, numero: '0004-00003654', fecha: '03/08/2026' },
  // La nota de crédito va con TODO en negativo: el signo se aplica en `normalizar_lectura`, y la
  // identidad se cumple igual. Contarlas como compras ya costó $41,9M en este repo.
  hormiserv: { neto: -567000, iva: -119070, otros: 0, total: -686070, numero: '00005-00000386', fecha: '29/07/2026' },
}

// ── 1 · LA IDENTIDAD SE CUMPLE EN LOS SIETE ──────────────────────────────────

test('los SIETE papeles del 04/08 cierran: neto + IVA + otros tributos = total', () => {
  for (const [nombre, p] of Object.entries(PAPELES)) {
    const r = identidadDelComprobante(p)
    assert.equal(r.verificable, true, `${nombre}: se puede verificar`)
    assert.equal(r.cierra, true, `${nombre}: ${pesos(r.suma)} contra ${pesos(r.total)}`)
  }
})

// ── 2 · Y LOS TRES ERRORES REALES LA ROMPEN ──────────────────────────────────

test('ALUMETAL ×100: el total leído no cierra con sus propios sumandos', () => {
  const r = identidadDelComprobante({ ...PAPELES.alumetal, total: PAPELES.alumetal.leido })
  assert.equal(r.cierra, false)
  assert.equal(r.suma, 2014940.07, 'los sumandos dan lo que dice el papel')
  assert.equal(r.total, 201494007)
})

test('VILLA DEL PINO ×100: tampoco cierra', () => {
  const r = identidadDelComprobante({ ...PAPELES.villaDelPino, total: PAPELES.villaDelPino.leido })
  assert.equal(r.cierra, false)
  assert.equal(r.suma, 105000.67)
})

test('HORMISERV ÷1000: la nota de crédito leída como $686,07 no cierra contra sus $686.070', () => {
  const r = identidadDelComprobante({ ...PAPELES.hormiserv, total: -686.07 })
  assert.equal(r.cierra, false)
  assert.equal(r.suma, -686070)
})

test('la tolerancia es de CENTAVOS, no de pesos: $0,40 de redondeo cierra, $5 no', () => {
  assert.equal(identidadDelComprobante({ neto: 100, iva: 21, total: 121.4 }).cierra, true)
  assert.equal(identidadDelComprobante({ neto: 100, iva: 21, total: 126 }).cierra, false)
})

test('sin neto NO se puede opinar: un tique sin subtotal no queda bloqueado por un control ciego', () => {
  const r = identidadDelComprobante({ neto: null, iva: 500, total: 3000 })
  assert.equal(r.verificable, false)
  assert.equal(r.cierra, null, '"no sé" no es "está bien" ni "está mal"')
})

// ── 3 · LA MISMA CUENTA LA USA LA VISIÓN PARA PEDIR EL MODELO GRANDE ─────────

test('la lectura que no cierra dispara la segunda opinión, con la MISMA cuenta', () => {
  const crudo = {
    numero: '0038-00025942', fecha: '31/07/2026', anotacion_manuscrita: 'Estrella',
    neto_gravado: '1.624.951,67', iva_21: '341.239,85', otros_tributos: '48.748,55',
    total: '201.494.007,00',
  }
  assert.ok(necesitaRevision(crudo).includes('neto + IVA no cierra con el total'))
  assert.deepEqual(necesitaRevision({ ...crudo, total: '2.014.940,07' }), [])
})

// ── 4 · ORDEN DE MAGNITUD CONTRA LA HISTORIA DEL PROVEEDOR ──────────────────

test('ALUMETAL: $201M contra un máximo histórico de $16,6M cae por escala', () => {
  const escala = escalaDeTotales([16600000, 12000000, 8400000, 5100000, 900000])
  assert.equal(escala.n, 5)
  assert.equal(escala.max, 16600000)
  const r = fueraDeEscala(PAPELES.alumetal.leido, escala)
  assert.equal(r.sospechoso, true)
  assert.equal(r.factor, 12.14)
})

test('VILLA DEL PINO: $10,5M contra un máximo de $114k cae por escala', () => {
  const escala = escalaDeTotales([114000, 105000, 98000, 87000, 60000, 42000])
  const r = fueraDeEscala(PAPELES.villaDelPino.leido, escala)
  assert.equal(r.sospechoso, true)
  assert.ok(r.factor > 90)
})

test('el total BUENO de los dos NO cae: el control no puede sonar en una carga correcta', () => {
  assert.equal(fueraDeEscala(PAPELES.alumetal.total, escalaDeTotales([16600000, 12000000, 8400000, 5100000, 900000])).sospechoso, false)
  assert.equal(fueraDeEscala(PAPELES.villaDelPino.total, escalaDeTotales([114000, 105000, 98000, 87000, 60000, 42000])).sospechoso, false)
})

test('un proveedor NUEVO no se cuestiona: sin historia suficiente, este control NO opina', () => {
  const cuatro = escalaDeTotales([1000, 2000, 3000, 4000])
  assert.equal(cuatro.n, MIN_HISTORIA_ESCALA - 1)
  const r = fueraDeEscala(99_000_000, cuatro)
  assert.equal(r.opina, false, 'con menos de 5 comprobantes no hay con qué comparar')
  assert.equal(r.sospechoso, false)
  assert.equal(fueraDeEscala(99_000_000, escalaDeTotales([])).opina, false)
})

test('crecer NO es sospechoso: 4× el máximo pasa, 6× no', () => {
  const escala = escalaDeTotales([100, 200, 300, 400, 1000])
  assert.equal(fueraDeEscala(4000, escala).sospechoso, false, `${FACTOR_FUERA_DE_ESCALA}× es el corte`)
  assert.equal(fueraDeEscala(6000, escala).sospechoso, true)
})

test('el control mira PARA ARRIBA: un total chiquito no es sospechoso por chiquito', () => {
  // El ÷1000 de HORMISERV lo caza la aritmética, no la escala: comprarle $500 de tornillos a un
  // proveedor cuyo máximo son $10M es completamente normal, y un umbral por abajo sonaría siempre.
  const escala = escalaDeTotales([10_000_000, 8_000_000, 5_000_000, 2_000_000, 1_000_000])
  assert.equal(fueraDeEscala(686.07, escala).sospechoso, false)
})

test('la escala se mide en VALOR ABSOLUTO: una nota de crédito grande también dice el tamaño', () => {
  assert.equal(escalaDeTotales([-686070, 100000]).max, 686070)
})
