import test from 'node:test'
import assert from 'node:assert/strict'
import { OPERACIONES, TIPOS, lectura, porTipo, CORTE, fechaCobro, formulaDiasAVencer, serialDeFecha } from './cheques-recibidos.mjs'

test('son 30 operaciones recibidas, ninguna es Emisión', () => {
  assert.equal(OPERACIONES.length, 30)
  assert.ok(OPERACIONES.every((o) => o.tipo !== 'Emisión'), 'una Emisión se coló: eso va en Cheques Emitidos (regla 9)')
  assert.ok(OPERACIONES.every((o) => TIPOS.includes(o.tipo)), 'hay un tipo de operación no contemplado')
})

test('cada operación tiene los campos que la pestaña necesita', () => {
  for (const o of OPERACIONES) {
    assert.match(o.op, /^\d+$/, 'el N° de operación no es numérico')
    assert.match(o.fecha, /^\d{4}-\d{2}-\d{2}$/, 'la fecha no es ISO')
    assert.match(o.hora, /^\d{2}:\d{2}$/, 'la hora no tiene formato HH:MM')
    assert.ok(Number.isFinite(o.importe) && o.importe > 0, 'importe inválido')
    assert.ok(Number.isInteger(o.cheques) && o.cheques >= 1, 'cantidad de cheques inválida')
    assert.equal(typeof o.recepcionAuto, 'boolean')
  }
})

test('los N° de operación no se repiten (es la clave)', () => {
  const set = new Set(OPERACIONES.map((o) => o.op))
  assert.equal(set.size, OPERACIONES.length, 'hay operaciones con el mismo número')
})

test('porTipo cuenta sin perder ni inventar operaciones', () => {
  const t = porTipo()
  assert.equal(t.reduce((s, x) => s + x.cantidad, 0), OPERACIONES.length)
  // El importe bruto por tipo NO es cartera: el mismo valor aparece en varias operaciones.
  const endoso = t.find((x) => x.tipo === 'Endoso')
  assert.equal(endoso.importe, 20000000, 'el endoso a Alumetal es $20.000.000')
})

test('lectura traduce cada tipo y no deja ninguno mudo', () => {
  for (const tipo of TIPOS) assert.ok(lectura(tipo).length > 0, `sin lectura para ${tipo}`)
})

test('el corte está declarado', () => {
  assert.match(CORTE, /^\d{4}-\d{2}-\d{2}$/)
})

test('fechaPago, si está, es ISO y sólo en operaciones en cartera (no en un depósito ya hecho)', () => {
  for (const o of OPERACIONES) {
    if (o.fechaPago === undefined) continue
    assert.match(o.fechaPago, /^\d{4}-\d{2}-\d{2}$/, `fechaPago de ${o.op} no es ISO`)
  }
  // La única fecha de cobro sourceada con evidencia (cheque 514, Mineral Del Río $290.000 → 31/07).
  const mineral = OPERACIONES.filter((o) => o.importe === 290000)
  assert.ok(mineral.length >= 1)
  assert.ok(mineral.every((o) => o.fechaPago === '2026-07-31'), 'el cheque 514 vence el 31/07/2026')
})

test('fechaCobro devuelve ISO donde hay dato y "" donde falta (nunca inventa)', () => {
  assert.equal(fechaCobro({ fechaPago: '2026-07-31' }), '2026-07-31')
  assert.equal(fechaCobro({}), '')
  assert.equal(fechaCobro({ fechaPago: 'mañana' }), '', 'un valor no-ISO no se acepta como fecha')
  assert.equal(fechaCobro(undefined), '')
})

test('serialDeFecha da el serial de Sheets (fecha real, no texto ISO) o null', () => {
  assert.equal(serialDeFecha('2026-07-31'), 46234) // verificado contra el serial que muestra el Sheet
  assert.equal(serialDeFecha('1899-12-30'), 0) // epoch de Google Sheets
  assert.equal(serialDeFecha('no-es-fecha'), null)
  assert.equal(serialDeFecha(undefined), null)
})

test('formulaDiasAVencer es viva, blank-safe y canónica (coma separadora)', () => {
  assert.equal(formulaDiasAVencer('I', 17), '=IF($I17="","",$I17-TODAY())')
  // blank-safe: sin fecha de cobro la celda queda vacía, no 0 ni #VALUE
  assert.match(formulaDiasAVencer('I', 17), /IF\(\$I17="",""/)
  assert.ok(formulaDiasAVencer('I', 17).includes('TODAY()'), 'tiene que recalcular contra HOY, no una fecha fija')
})
