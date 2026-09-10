// Qué defiende este archivo: que fusionar dos obras NO pueda perder una fila ni inventar un número.
// Cada test revierte a rojo si se saca la regla que prueba (se comprobó sacándolas de a una).
import test from 'node:test'
import assert from 'node:assert/strict'
import { REFERENCIAS_EXCLUSIVAS, lineasDelPlan, planificarFusion } from './obras-fusion.mjs'

const OBRAS = [
  { id: 'bsa-planta', nombre: 'BSA - Planta' },
  { id: 'messina-bsa', nombre: 'ME - BSA' },
]
const REFS = [
  { tabla: 'cliente_orden', col: 'obra_id', filasDe: 3, filasEn: 0 },
  { tabla: 'documento_cliente', col: 'obra_id', filasDe: 11, filasEn: 0 },
  { tabla: 'registros_hh', col: 'obra_canonica_id', filasDe: 0, filasEn: 18 },
]
const plan = (extra = {}) => planificarFusion({ de: 'bsa-planta', en: 'messina-bsa', obras: OBRAS, referencias: REFS, ...extra })

test('no fusiona si el destino no existe', () => {
  assert.throws(
    () => planificarFusion({ de: 'bsa-planta', en: 'obra-que-no-existe', obras: OBRAS, referencias: REFS }),
    /destino "obra-que-no-existe" no existe/,
  )
})

test('no fusiona si el origen no existe, ni una obra consigo misma', () => {
  assert.throws(() => planificarFusion({ de: 'fantasma', en: 'messina-bsa', obras: OBRAS, referencias: REFS }), /origen/)
  assert.throws(() => planificarFusion({ de: 'messina-bsa', en: 'messina-bsa', obras: OBRAS, referencias: REFS }), /consigo misma/)
})

test('no pierde filas: el conteo antes es igual al de después', () => {
  const p = plan()
  assert.equal(p.antes, 32)
  assert.equal(p.despues, p.antes)
  // Lo que se mueve es exactamente lo que apuntaba al slug viejo, ni una fila más.
  assert.equal(p.filasQueSeMueven, 14)
  assert.deepEqual(p.movimientos.map((m) => m.tabla), ['cliente_orden', 'documento_cliente'])
})

test('la tabla sin filas del origen no se toca (no hay UPDATE de adorno)', () => {
  assert.ok(!plan().movimientos.some((m) => m.tabla === 'registros_hh'))
})

test('economía publicada por las dos obras es CONFLICTO, no una suma', () => {
  const refs = [...REFS, { tabla: 'obra_economia_sheet', col: 'obra_canonica_id', filasDe: 1, filasEn: 1 }]
  const p = plan({ referencias: refs })
  assert.equal(p.conflictos.length, 1)
  assert.match(p.conflictos[0].motivo, /no se suma a ciegas/)
  assert.ok(!p.movimientos.some((m) => m.tabla === 'obra_economia_sheet'))
  assert.ok(REFERENCIAS_EXCLUSIVAS.has('obra_economia_sheet.obra_canonica_id'))
})

test('si sólo el origen publica economía, la fila se mueve (no hay nada que pisar)', () => {
  const refs = [{ tabla: 'obra_economia_sheet', col: 'obra_canonica_id', filasDe: 1, filasEn: 0 }]
  const p = plan({ referencias: refs })
  assert.equal(p.conflictos.length, 0)
  assert.equal(p.filasQueSeMueven, 1)
})

test('el nombre viejo queda como alias del slug activo', () => {
  const a = plan().aliasNuevos
  assert.deepEqual(a.map((x) => x.alias).sort(), ['bsa planta'])
  assert.equal(a[0].obra_id, 'messina-bsa')
})

test('es idempotente: con el alias ya escrito no propone nada', () => {
  const p = plan({ alias: [{ alias: 'bsa planta', obra_id: 'messina-bsa' }] })
  assert.deepEqual(p.aliasNuevos, [])
})

test('un alias de una TERCERA obra no se roba', () => {
  const p = plan({ alias: [{ alias: 'bsa planta', obra_id: 'bsa-adicional' }] })
  assert.deepEqual(p.aliasNuevos, [])
})

test('el slug y el nombre dan dos alias cuando difieren', () => {
  const obras = [{ id: 'pisos-120m2', nombre: 'Pisos 120 m2' }, { id: 'messina-pisos', nombre: 'ME - PISOS' }]
  const p = planificarFusion({ de: 'pisos-120m2', en: 'messina-pisos', obras, referencias: [] })
  assert.deepEqual(p.aliasNuevos.map((x) => x.alias).sort(), ['pisos 120 m2', 'pisos 120m2'])
})

test('las líneas del plan nombran cada tabla y el conflicto', () => {
  const refs = [...REFS, { tabla: 'obra_economia_sheet', col: 'obra_canonica_id', filasDe: 1, filasEn: 1 }]
  const l = lineasDelPlan(plan({ referencias: refs })).join('\n')
  assert.match(l, /cliente_orden\.obra_id: 3/)
  assert.match(l, /CONFLICTO/)
  assert.match(l, /alias nuevo/)
})
