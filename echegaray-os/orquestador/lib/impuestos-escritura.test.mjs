import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planDeEscritura, lectoresEfectivos, CLAVE } from './impuestos-escritura.mjs'

const pago = (lector, referencia) => ({ fuente: lector, referencia, lector })
const ex = (lector, referencia) => ({ clave: CLAVE.pago(pago(lector, referencia)), lector })

test('un lector que leyó bien borra lo suyo que ya no está en la fuente', () => {
  const p = planDeEscritura({
    tabla: 'pago', lectores: { banco: { ok: true, leidas: 10 } },
    nuevas: [pago('banco', 'b:1')], existentes: [ex('banco', 'b:1'), ex('banco', 'b:2')],
  })
  assert.deepEqual(p.borrar, ['banco|b:2'])
  assert.equal(p.upsert.length, 1)
})

test('un lector que FALLÓ no escribe ni borra nada suyo', () => {
  const p = planDeEscritura({
    tabla: 'pago', lectores: { banco: { ok: false, error: 'timeout' } },
    nuevas: [pago('banco', 'b:1')], existentes: [ex('banco', 'b:2')],
  })
  assert.deepEqual([p.upsert.length, p.borrar.length], [0, 0])
  assert.match(p.retenidos[0].motivo, /timeout/)
})

test('una fuente que vino vacía no borra: una lectura vacía no es una fuente vaciada', () => {
  const p = planDeEscritura({ tabla: 'pago', lectores: { compras: { ok: true, leidas: 0 } }, nuevas: [], existentes: [ex('compras', 'c:1')] })
  assert.deepEqual(p.borrar, [])
  // Pero si la fuente SÍ trajo filas y el lector no produjo ninguna, lo suyo se va (el cálculo de IVA
  // el mes en que todo tiene F.2051).
  const q = planDeEscritura({ tabla: 'pago', lectores: { compras: { ok: true, leidas: 30 } }, nuevas: [], existentes: [ex('compras', 'c:1')] })
  assert.deepEqual(q.borrar, ['compras|c:1'])
})

test('una DDJJ presentada no se borra porque una corrida no la vio', () => {
  const o = { impuesto: 'iva', periodo: '2026-07', concepto: 'ddjj', fuente: 'ddjj_contador', lector: 'ddjj_iva_pdf' }
  const p = planDeEscritura({
    tabla: 'obligacion', lectores: { ddjj_iva_pdf: { ok: true, leidas: 6 } }, nuevas: [],
    existentes: [{ clave: CLAVE.obligacion(o), lector: 'ddjj_iva_pdf' }],
  })
  assert.deepEqual(p.borrar, [])
  assert.equal(p.retenidos.length, 1)
})

test('una clave repetida en la corrida rompe antes de escribir, y una fila sin lector también', () => {
  const lectores = { banco: { ok: true, leidas: 1 } }
  assert.throws(() => planDeEscritura({ tabla: 'pago', lectores, nuevas: [pago('banco', 'x'), pago('banco', 'x')] }), /repetida/)
  assert.throws(() => planDeEscritura({ tabla: 'pago', lectores, nuevas: [{ fuente: 'banco', referencia: 'y' }] }), /sin lector/)
})

test('el fallo de un insumo se hereda: sin F931 el banco no puede imputar y no toca lo que ya imputó', () => {
  const ef = lectoresEfectivos({
    f931_raw: { ok: false, error: 'rango' }, compras: { ok: true, leidas: 3 }, banco: { ok: true, leidas: 600 },
    arca: { ok: true, leidas: 600 }, arca_iva: { ok: true, leidas: 600 }, ddjj_iva_pdf: { ok: true, leidas: 7 },
    cobranzas: { ok: true, leidas: 300 },
  })
  assert.equal(ef.compras.ok, false)
  assert.equal(ef.banco.ok, false)
  assert.match(ef.banco.error, /compras|f931_raw/)
  // arca_iva depende del banco (percepciones): también cae.
  assert.equal(ef.arca_iva.ok, false)
  assert.equal(ef.ddjj_iva_pdf.ok, true)
})
