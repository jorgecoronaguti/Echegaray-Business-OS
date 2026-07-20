// Tests del reclamo de cobranza. Herméticos: núcleo puro, sin DB ni API.
import assert from 'node:assert/strict'
import { componerReclamo, diasVencido, tonoPorAntiguedad } from './reclamo-cobranza.mjs'

const HOY = new Date(2026, 6, 20) // 20/07/2026
let n = 0
const t = (nombre, fn) => { fn(); n++; console.log('  ok', nombre) }

const factura = (over = {}) => ({
  numero_comprobante: '01-00000208', factura: 'FA', fecha_emision: '2026-03-11',
  fecha_cobro: '2026-07-02', total: 15000000, concepto: 'Oficinas y Fabrica de Palitos',
  estado: 'Pendiente', ...over,
})

t('días vencidos sin desfase de zona horaria', () => {
  assert.equal(diasVencido('2026-07-02', HOY), 18)
  assert.equal(diasVencido('2026-07-20', HOY), 0)
})

t('el tono escala con la antigüedad (mandar la carta equivocada cuesta plata o relación)', () => {
  assert.equal(tonoPorAntiguedad(5), 'recordatorio')
  assert.equal(tonoPorAntiguedad(18), 'reclamo')
  assert.equal(tonoPorAntiguedad(90), 'intimacion_previa')
})

t('arma el reclamo con el comprobante, la antigüedad y el monto REALES', () => {
  const r = componerReclamo({ cliente: 'LA ESTRELLA', comprobantes: [factura()] }, HOY)
  assert.equal(r.puede_reclamar, true)
  assert.equal(r.total_reclamado, 15000000)
  assert.equal(r.dias_max, 18)
  assert.match(r.cuerpo, /FA 01-00000208/)
  assert.match(r.cuerpo, /02\/07\/2026/)
  assert.match(r.cuerpo, /\$15\.000\.000/)
})

t('lo PROYECTADO no se reclama: todavía no se facturó', () => {
  const r = componerReclamo({
    cliente: 'LA ESTRELLA',
    comprobantes: [factura(), factura({ numero_comprobante: null, estado: 'Proyectado', total: 13000000 })],
  }, HOY)
  assert.equal(r.total_reclamado, 15000000, 'los $13M proyectados NO entran')
  assert.ok(r.excluidos.some((e) => /proyectadas/.test(e)), 'y se le dice al dueño por qué')
})

t('vencido SIN número de comprobante no se reclama: se pide conciliar', () => {
  const r = componerReclamo({ cliente: 'X', comprobantes: [factura({ numero_comprobante: null })] }, HOY)
  assert.equal(r.puede_reclamar, false)
  assert.match(r.motivo, /conciliaci[oó]n/)
})

t('sin nada vencido y facturado, lo dice — no inventa un reclamo', () => {
  const r = componerReclamo({ cliente: 'X', comprobantes: [] }, HOY)
  assert.equal(r.puede_reclamar, false)
})

t('varias facturas: total sumado y el tono lo fija la MÁS vieja', () => {
  const r = componerReclamo({
    cliente: 'X',
    comprobantes: [factura({ total: 1000 }), factura({ numero_comprobante: '01-00000300', fecha_cobro: '2026-01-10', total: 500 })],
  }, HOY)
  assert.equal(r.total_reclamado, 1500)
  assert.equal(r.tono, 'intimacion_previa', 'la más vieja manda el tono')
})

t('nunca afirma un interés punitorio que el contrato no pactó', () => {
  const r = componerReclamo({ cliente: 'X', comprobantes: [factura({ fecha_cobro: '2026-01-01' })] }, HOY)
  assert.ok(!/punitorio|intereses|mora del \d/i.test(r.cuerpo))
})

t('el asunto lleva cliente y monto, para que se lea sin abrir', () => {
  const r = componerReclamo({ cliente: 'LA ESTRELLA', comprobantes: [factura()] }, HOY)
  assert.match(r.asunto, /LA ESTRELLA/)
  assert.match(r.asunto, /\$15\.000\.000/)
})

console.log(`reclamo-cobranza: ${n} checks OK`)
