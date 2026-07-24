import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  huellaPlan, compararPlanes, esAutorizacionValida, snapshotPlan,
} from './plan-vigente.mjs'

function plan(acciones) {
  return { estado: 'ok', fecha: '24/7/2026', horizontes: { dias_7: { acciones } } }
}

test('la huella depende de lo EJECUTABLE (acciones), no de que pase el tiempo', () => {
  const a = plan([{ fecha: '2026-07-24', tipo: 'pagar', descripcion: 'Pagar AFIP $700.000' }])
  const b = plan([{ fecha: '2026-07-24', tipo: 'pagar', descripcion: 'Pagar AFIP $700.000' }])
  assert.equal(huellaPlan(a, 'dias_7'), huellaPlan(b, 'dias_7'))
})

test('la huella cambia si cambia una acción', () => {
  const a = plan([{ fecha: '2026-07-24', tipo: 'pagar', descripcion: 'Pagar AFIP $700.000' }])
  const b = plan([{ fecha: '2026-07-25', tipo: 'pagar', descripcion: 'Pagar AFIP $700.000' }])
  assert.notEqual(huellaPlan(a, 'dias_7'), huellaPlan(b, 'dias_7'))
})

test('compararPlanes detecta agregadas, eliminadas y reprogramadas', () => {
  const viejo = plan([
    { fecha: '2026-07-24', tipo: 'pagar', descripcion: 'Pagar AFIP $700.000' },
    { fecha: '2026-07-24', tipo: 'cobrar', descripcion: 'Cobrar MESSINA $4.000.000' },
  ])
  const nuevo = plan([
    { fecha: '2026-07-26', tipo: 'pagar', descripcion: 'Pagar AFIP $700.000' }, // reprogramada
    { fecha: '2026-07-25', tipo: 'financiar', descripcion: 'Usar descubierto $1.000.000' }, // agregada
    // la cobranza de MESSINA ya no está → eliminada
  ])
  const d = compararPlanes(nuevo, viejo, 'dias_7')
  assert.equal(d.agregadas.length, 1)
  assert.equal(d.agregadas[0].descripcion, 'Usar descubierto $1.000.000')
  assert.equal(d.eliminadas.length, 1)
  assert.match(d.eliminadas[0].descripcion, /MESSINA/)
  assert.equal(d.reprogramadas.length, 1)
  assert.deepEqual({ de: d.reprogramadas[0].de, a: d.reprogramadas[0].a }, { de: '2026-07-24', a: '2026-07-26' })
})

test('reprogramar no cuenta un cambio menor de importe como acción nueva', () => {
  const viejo = plan([{ fecha: '2026-07-24', tipo: 'pagar', descripcion: 'Pagar AFIP $700.000' }])
  const nuevo = plan([{ fecha: '2026-07-24', tipo: 'pagar', descripcion: 'Pagar AFIP $712.000' }])
  const d = compararPlanes(nuevo, viejo, 'dias_7')
  assert.equal(d.agregadas.length, 0) // misma acción (mismo tipo+proveedor), sólo cambió el importe
  assert.equal(d.eliminadas.length, 0)
})

test('sólo autoridades válidas pueden autorizar la ejecución', () => {
  assert.equal(esAutorizacionValida('dueño'), true)
  assert.equal(esAutorizacionValida('director'), true)
  assert.equal(esAutorizacionValida('cfo'), true)
  assert.equal(esAutorizacionValida('interfaz'), true)
  assert.equal(esAutorizacionValida(''), false)
  assert.equal(esAutorizacionValida(undefined), false)
  assert.equal(esAutorizacionValida('un-agente-cualquiera'), false)
})

test('snapshotPlan: un plan nuevo entra como pendiente_ejecucion', async () => {
  let guardado = null
  const deps = {
    query: async (sql, params) => {
      if (/create table|alter table/.test(sql)) return { rows: [] }
      if (/^select plan_hash/.test(sql.trim())) return { rows: [] } // no había plan previo
      if (/insert into public\.finanzas_plan_vigente/.test(sql)) { guardado = params; return { rows: [] } }
      return { rows: [] }
    },
  }
  const r = await snapshotPlan(deps, plan([{ fecha: '2026-07-24', tipo: 'pagar', descripcion: 'Pagar AFIP $700.000' }]), 'dias_7')
  assert.equal(r.cambio, true)
  assert.equal(r.estado, 'pendiente_ejecucion')
  assert.ok(guardado, 'debe persistir el snapshot')
})

test('snapshotPlan: si la huella no cambió, conserva el estado (no reabre un plan ya autorizado)', async () => {
  const unPlan = plan([{ fecha: '2026-07-24', tipo: 'pagar', descripcion: 'Pagar AFIP $700.000' }])
  const hash = huellaPlan(unPlan, 'dias_7')
  const deps = {
    query: async (sql) => {
      if (/create table|alter table/.test(sql)) return { rows: [] }
      if (/^select plan_hash/.test(sql.trim())) return { rows: [{ plan_hash: hash, estado: 'autorizado', plan: unPlan }] }
      return { rows: [] }
    },
  }
  const r = await snapshotPlan(deps, unPlan, 'dias_7')
  assert.equal(r.cambio, false)
  assert.equal(r.estado, 'autorizado') // se conserva
})
