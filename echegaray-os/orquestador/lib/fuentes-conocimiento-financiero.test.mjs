import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CATALOGO, MINIMO_EXIGIDO, coberturaDeFuentes, fuentesParaDecision,
} from './fuentes-conocimiento-financiero.mjs'

test('el catálogo cubre TODAS las fuentes que el dueño exige como mínimo', () => {
  // supabase/sheets están implícitas (la mayoría de las estructuradas viven ahí); el resto son claves.
  const claves = new Set(CATALOGO.map((f) => f.clave))
  for (const req of ['banco', 'arca', 'compras', 'obras', 'certificaciones', 'contratos', 'facturas', 'creditos', 'descubierto', 'cronogramas']) {
    assert.ok(claves.has(req), `falta la fuente exigida: ${req}`)
  }
  assert.ok(MINIMO_EXIGIDO.length >= 12)
})

test('LA REGLA DE ORO: Drive es CONOCIMIENTO, nunca VERDAD', () => {
  for (const f of CATALOGO) {
    if (f.fuente.startsWith('Drive')) assert.equal(f.naturaleza, 'conocimiento', `${f.clave} en Drive no puede ser 'verdad'`)
  }
  assert.equal(coberturaDeFuentes().drive_es_conocimiento, true)
})

test('contratos y documentación técnica son conocimiento en Drive (no estructurados)', () => {
  const contratos = CATALOGO.find((f) => f.clave === 'contratos')
  assert.equal(contratos.naturaleza, 'conocimiento')
  assert.equal(contratos.estructurada, false)
  assert.match(contratos.fuente, /Drive/)
})

test('las fuentes de verdad son estructuradas y apuntan a una fuente única existente (no se duplica)', () => {
  const verdad = CATALOGO.filter((f) => f.naturaleza === 'verdad')
  for (const f of verdad) {
    assert.equal(f.estructurada, true)
    assert.ok(f.fuente && !f.fuente.startsWith('Drive'), `${f.clave} verdad debe tener fuente única estructurada`)
    assert.ok(f.aporte && f.aporte.length > 10, `${f.clave} debe declarar qué aporta a una decisión`)
  }
})

test('coberturaDeFuentes cuenta verdad estructurada + conocimiento en Drive = total', () => {
  const c = coberturaDeFuentes()
  assert.equal(c.verdad_estructurada + c.conocimiento_en_drive, c.total)
  assert.ok(c.verdad_estructurada >= 10, 'la mayoría del universo ya es verdad estructurada consumible')
})

test('para cobrar, el razonamiento debe mirar certificaciones, facturas, obras y contratos', () => {
  const claves = fuentesParaDecision('cobrar').map((f) => f.clave)
  for (const req of ['certificaciones', 'facturas', 'obras', 'contratos']) assert.ok(claves.includes(req), `cobrar debe considerar ${req}`)
})

test('para financiar, el razonamiento debe mirar créditos y descubierto', () => {
  const claves = fuentesParaDecision('financiar').map((f) => f.clave)
  assert.ok(claves.includes('creditos') && claves.includes('descubierto'))
})

test('una decisión desconocida cae al universo completo del plan (no se olvida nada)', () => {
  assert.equal(fuentesParaDecision('cualquier-cosa').length, fuentesParaDecision('plan').length)
})
