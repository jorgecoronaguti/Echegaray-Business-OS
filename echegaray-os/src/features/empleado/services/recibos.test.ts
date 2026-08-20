import { test } from 'node:test'
import assert from 'node:assert/strict'
import { etiquetaDePeriodo, lecturaDeRecibo, ordenar, pesos } from './recibos.ts'
import type { MiRecibo } from '../types/index.ts'

const r = (p: Partial<MiRecibo>): MiRecibo => ({
  id: p.id ?? 'x', periodo: '2026-07', quincena: '1', periodo_cierto: true, nombre: null,
  fecha_documento: null, drive_file_id: 'abc', neto: null, estado_pago: null, fecha_pago: null,
  fecha_emision: null, dias: null, hh: null, categoria: null, liquidado: false, ...p,
})

test('SIN LIQUIDACIÓN NO HAY NETO — y no es $ 0', () => {
  // La regla del handoff, literal: «Período sin liquidar: "Todavía no liquidado" + "sin recibo" —
  // nunca $ 0». Un cero afirma que no cobró nada; la ausencia del dato no afirma eso.
  const l = lecturaDeRecibo(r({ liquidado: false }))
  assert.equal(l.neto, null)
  assert.match(l.falta, /sin importe/)
})

test('sin liquidación pero CON PDF, el recibo igual se puede abrir', () => {
  assert.equal(lecturaDeRecibo(r({ liquidado: false, drive_file_id: 'abc' })).hayPdf, true)
  assert.equal(lecturaDeRecibo(r({ liquidado: false, drive_file_id: null })).estado, 'Todavía no liquidado')
})

test('con liquidación se dice el estado de pago', () => {
  const l = lecturaDeRecibo(r({ liquidado: true, neto: 1284500, estado_pago: 'pagado', fecha_pago: '2026-08-05' }))
  assert.equal(l.neto, '$ 1.284.500,00')
  assert.equal(l.estado, 'Pagado el 05/08/2026')
  assert.equal(lecturaDeRecibo(r({ liquidado: true, neto: 1, estado_pago: 'pendiente' })).tono, 'warn')
})

test('el período se lee en castellano, y la incerteza se declara', () => {
  assert.equal(etiquetaDePeriodo({ periodo: '2026-07', quincena: '1', periodo_cierto: true }), 'Julio 2026 · 1ª quincena')
  assert.match(etiquetaDePeriodo({ periodo: '2026-07', quincena: null, periodo_cierto: false }), /según la fecha del archivo/)
  assert.equal(etiquetaDePeriodo({ periodo: null, quincena: null, periodo_cierto: false }), 'Período sin identificar')
})

test('lo más reciente arriba, y la 2ª quincena antes que la 1ª', () => {
  const o = ordenar([
    r({ id: 'jun', periodo: '2026-06', quincena: '2' }),
    r({ id: 'jul1', periodo: '2026-07', quincena: '1' }),
    r({ id: 'jul2', periodo: '2026-07', quincena: '2' }),
  ]).map((x) => x.id)
  assert.deepEqual(o, ['jul2', 'jul1', 'jun'])
})

test('los pesos van en es-AR', () => {
  assert.equal(pesos(1284500.5), '$ 1.284.500,50')
})
