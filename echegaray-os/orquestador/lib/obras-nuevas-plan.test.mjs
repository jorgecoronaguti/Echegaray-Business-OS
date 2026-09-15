import test from 'node:test'
import assert from 'node:assert/strict'
import { estadoPorActividad, planDeAlias } from './obras-nuevas-plan.mjs'

test('estado: activa sólo con compra u hora en los últimos 30 días; la evidencia se dice', () => {
  assert.equal(estadoPorActividad({ ultimaCompra: '2026-09-01' }, '2026-09-14').estado, 'activa')
  assert.equal(estadoPorActividad({ ultimaHora: '2026-08-15' }, '2026-09-14').estado, 'activa')
  // Medido 14/09/2026: Galpón 7 compró por última vez el 12/05 → cerrada.
  const g7 = estadoPorActividad({ ultimaCompra: '2026-05-12' }, '2026-09-14')
  assert.equal(g7.estado, 'cerrada')
  assert.match(g7.porque, /2026-05-12/)
  assert.equal(estadoPorActividad({}, '2026-09-14').estado, 'cerrada')
})

test('alias: «mamposteria» suelta NO se pisa (es de SF); la forma con el cliente adelante sí se carga', () => {
  const existentes = new Map([['mamposteria', 'sf-mamposteria']])
  const p = planDeAlias({ obraId: 'le-mamposteria', cliente: 'La Estrella', grafias: ['Mamposteria', 'Mampostería'] }, { existentes })
  assert.deepEqual(p.cargar.map((a) => a.alias), ['estrella mamposteria'])
  assert.deepEqual(p.omitidos, [{ alias: 'mamposteria', porque: 'ya apunta a sf-mamposteria' }])
})

test('alias: la grafía suelta se omite si otro cliente la usa en Compras; libre, se carga', () => {
  const p = planDeAlias({ obraId: 'le-galpon-7', cliente: 'La Estrella', grafias: ['Galpon 7'] },
    { grafiasDeOtros: new Set(['galpon 7']) })
  assert.deepEqual(p.cargar.map((a) => a.alias), ['estrella galpon 7'])
  const libre = planDeAlias({ obraId: 'le-galpon-8', cliente: 'La Estrella', grafias: ['Galpón 8'] })
  assert.deepEqual(libre.cargar.map((a) => a.alias), ['estrella galpon 8', 'galpon 8'])
})
