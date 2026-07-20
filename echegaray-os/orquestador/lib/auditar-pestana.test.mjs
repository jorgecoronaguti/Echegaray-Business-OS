// Tests de la auditoría de pestaña. Herméticos: núcleo puro, sin API.
import assert from 'node:assert/strict'
import { auditarGrid, formatAuditoria, detectarEncabezado, colA1 } from './auditar-pestana.mjs'

let n = 0
const t = (nombre, fn) => { fn(); n++; console.log('  ok', nombre) }
const celda = (v, f = null) => ({ formula: f, valor: v === null ? null : String(v), numero: typeof v === 'number' ? v : null, formato: null })
const cod = (r, c) => r.hallazgos.find((h) => h.codigo === c)

t('columna A1 more allá de la Z', () => {
  assert.equal(colA1(0), 'A'); assert.equal(colA1(25), 'Z'); assert.equal(colA1(26), 'AA')
})

t('pestaña vacía no inventa hallazgos', () => {
  const r = auditarGrid({ titulo: 'X', filas: [[], [celda(null)]] })
  assert.equal(r.vacia, true)
  assert.equal(r.hallazgos.length, 0)
})

t('TOTAL con número pegado a mano → severidad alta (la regla de oro del proyecto)', () => {
  const r = auditarGrid({ titulo: 'Egresos', filas: [
    [celda('Concepto'), celda('Monto')],
    [celda('Cemento'), celda(100)],
    [celda('TOTAL'), celda(100)],
  ] })
  const h = cod(r, 'total_pegado_a_mano')
  assert.ok(h, 'un total sin fórmula tiene que saltar')
  assert.equal(h.severidad, 'alta')
})

t('TOTAL con fórmula NO es hallazgo', () => {
  const r = auditarGrid({ titulo: 'Egresos', filas: [
    [celda('Concepto'), celda('Monto')],
    [celda('Cemento'), celda(100)],
    [celda('TOTAL'), celda(100, '=SUMA(B2:B2)')],
  ] })
  assert.equal(cod(r, 'total_pegado_a_mano'), undefined)
})

t('rango abierto A:M se detecta; el cerrado no', () => {
  const abierto = auditarGrid({ titulo: 'T', filas: [[celda('a'), celda('b')], [celda(1, '=SUMA(A:A)'), celda(2)]] })
  assert.ok(cod(abierto, 'rangos_abiertos'))
  const cerrado = auditarGrid({ titulo: 'T', filas: [[celda('a'), celda('b')], [celda(1, '=SUMA(A2:A500)'), celda(2)]] })
  assert.equal(cod(cerrado, 'rangos_abiertos'), undefined)
})

t('SI.ERROR que devuelve "" o 0 es hallazgo alto; el que devuelve una marca no', () => {
  const ciego = auditarGrid({ titulo: 'T', filas: [[celda('a')], [celda(1, '=SI.ERROR(BUSCARV(A1;X;2;0);0)')]] })
  assert.equal(cod(ciego, 'iferror_ciego').severidad, 'alta')
  const marcado = auditarGrid({ titulo: 'T', filas: [[celda('a')], [celda(1, '=SI.ERROR(BUSCARV(A1;X;2;0);"SIN DATO")')]] })
  assert.equal(cod(marcado, 'iferror_ciego'), undefined)
})

t('celdas combinadas en la zona de datos → alta', () => {
  const r = auditarGrid({ titulo: 'T', filas: [[celda('a'), celda('b')], [celda(1), celda(2)]], merges: [{ fila: 1, filaFin: 2, col: 0, colFin: 2 }] })
  assert.equal(cod(r, 'celdas_combinadas').severidad, 'alta')
})

t('columna mayormente numérica con texto colado → columna_mixta', () => {
  const r = auditarGrid({ titulo: 'T', filas: [
    [celda('Concepto'), celda('Monto')],
    [celda('a'), celda(1)], [celda('b'), celda(2)], [celda('c'), celda(3)],
    [celda('d'), celda(4)], [celda('e'), celda('s/d')],
  ] })
  const h = cod(r, 'columna_mixta')
  assert.ok(h); assert.match(h.titulo, /Columna B/)
})

t('encabezados duplicados', () => {
  const r = auditarGrid({ titulo: 'T', filas: [[celda('Monto'), celda('Monto'), celda('Obra')], [celda(1), celda(2), celda('x')]] })
  assert.ok(cod(r, 'encabezados_duplicados'))
})

t('fila vacía intercalada, pero NO cuenta la del final', () => {
  const r = auditarGrid({ titulo: 'T', filas: [
    [celda('a'), celda('b')], [celda(1), celda(2)], [], [celda(3), celda(4)], [], [],
  ] })
  assert.match(cod(r, 'filas_vacias_intercaladas').titulo, /^1 fila/)
})

t('pestaña con números y CERO fórmulas → "es una foto"', () => {
  const r = auditarGrid({ titulo: 'T', filas: [[celda('a'), celda('b')], [celda(1), celda(2)]] })
  assert.equal(cod(r, 'sin_una_sola_formula').severidad, 'alta')
})

t('el censo separa fórmula de número escrito a mano', () => {
  const r = auditarGrid({ titulo: 'T', filas: [[celda('a'), celda('b')], [celda(1), celda(2, '=1+1')]] })
  assert.equal(r.censo.con_formula, 1)
  assert.equal(r.censo.numeros_escritos_a_mano, 1)
})

t('detectarEncabezado saltea filas de título', () => {
  assert.equal(detectarEncabezado([[celda('FLUJO DE CAJA 2026')], [celda('Fecha'), celda('Concepto')]]), 1)
})

t('formatAuditoria no rompe con pestaña sin defectos', () => {
  const r = auditarGrid({ titulo: 'T', filas: [[celda('a'), celda('b')], [celda('x'), celda(2, '=1+1')]] })
  assert.match(formatAuditoria(r), /Sin defectos estructurales/)
})

console.log(`auditar-pestana: ${n} checks OK`)
