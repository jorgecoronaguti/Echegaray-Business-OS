// Tests del control administrativo. Herméticos: núcleo puro, sin DB ni API.
import assert from 'node:assert/strict'
import { evaluarCierre, formatCierre, periodoActual } from './control-administrativo.mjs'

const HOY = new Date('2026-07-19T12:00:00Z')
let n = 0
const t = (nombre, fn) => { fn(); n++; console.log('  ok', nombre) }
const cod = (r, c) => r.hallazgos.find((h) => h.codigo === c)

t('gasto de ARCA que no está en la pestaña Compras → hallazgo con el monto real', () => {
  const r = evaluarCierre({ recibidos: [{ emisor_nombre: 'ALUMETAL', imp_total: '1000' }, { emisor_nombre: 'X', imp_total: '500' }] }, HOY)
  const h = cod(r, 'gasto_fuera_de_obra')
  assert.ok(h, 'ese gasto no está en ninguna obra')
  assert.equal(h.monto, 1500)
})

t('REGRESIÓN: sin comprobantes huérfanos NO se inventa alarma (la falsa alarma de 2026-07-20)', () => {
  // Antes miraba comprobantes_arca.obra_texto (campo que nadie llena) y gritaba "47/47 sin
  // imputar" cuando la imputación real existe en costos_obra. Alertar sobre algo ya resuelto
  // en otra fuente rompe la confianza más rápido que no alertar.
  const r = evaluarCierre({ recibidos: [] }, HOY)
  assert.equal(cod(r, 'gasto_fuera_de_obra'), undefined)
  assert.ok(r.ok.some((s) => /pestaña Compras/.test(s)), 'consultado y sin huérfanos = OK verificado')
  // Pero NO consultar la fuente no es un OK: es no verificable.
  const sinConsultar = evaluarCierre({}, HOY)
  assert.equal(sinConsultar.ok.length, 0)
  assert.ok(sinConsultar.no_verificable.some((s) => /pestaña Compras/.test(s)))
})

t('muchos huérfanos → severidad alta', () => {
  const muchos = Array.from({ length: 26 }, () => ({ emisor_nombre: 'P', imp_total: '10' }))
  assert.equal(cod(evaluarCierre({ recibidos: muchos }, HOY), 'gasto_fuera_de_obra').severidad, 'alta')
})

t('cobranza vencida se detecta; cobrada NO cuenta aunque esté vencida', () => {
  const r = evaluarCierre({
    cobranzas: [
      { estado: 'Pendiente', fecha_cobro: '2026-07-02', total_bruto: '15000000', obra_cliente: 'LA ESTRELLA' },
      { estado: 'Cobrado', fecha_cobro: '2026-01-01', total_bruto: '999', obra_cliente: 'X' },
      { estado: 'Facturado', fecha_cobro: '2026-09-30', total_bruto: '111', obra_cliente: 'ARCOR' },
    ],
  }, HOY)
  const h = r.hallazgos.find((x) => x.codigo === 'cobranzas_vencidas')
  assert.equal(h.monto, 15000000, 'solo la vencida y no cobrada')
})

t('el hallazgo de cobranzas declara su fuente (convive con el bloque de caja, que cuenta distinto)', () => {
  const r = evaluarCierre({ cobranzas: [{ estado: 'Pendiente', fecha_cobro: '2026-07-02', total_bruto: '1', obra_cliente: 'X' }] }, HOY)
  assert.match(r.hallazgos[0].titulo, /registro de cobranzas/, 'sin origen, dos cifras distintas del mismo hecho se leen como contradicción')
})

t('la fecha se muestra en formato argentino, venga Date (pg) o string (bug real 2026-07-19)', () => {
  const conDate = evaluarCierre({ cobranzas: [{ estado: 'Pendiente', fecha_cobro: new Date('2026-07-02T03:00:00Z'), total_bruto: '1', obra_cliente: 'X' }] }, HOY)
  assert.match(conDate.hallazgos[0].detalle, /02\/07\/2026/, 'un Date cortado con slice daba "Thu Jul 0"')
  const conStr = evaluarCierre({ cobranzas: [{ estado: 'Pendiente', fecha_cobro: '2026-07-02', total_bruto: '1', obra_cliente: 'X' }] }, HOY)
  assert.match(conStr.hallazgos[0].detalle, /02\/07\/2026/)
})

t('obligación con saldo y sin fecha de vencimiento → hallazgo (no hay alerta posible)', () => {
  const r = evaluarCierre({
    obligaciones: [
      { concepto: 'Deuda comercial', fecha_vencimiento: null, saldo_pendiente: '524810' },
      { concepto: 'Saldada', fecha_vencimiento: null, saldo_pendiente: '0' },
    ],
  }, HOY)
  const h = r.hallazgos.find((x) => x.codigo === 'obligaciones_sin_vencimiento')
  assert.equal(h.monto, 524810, 'la saldada no cuenta')
})

t('obligación vencida con saldo → severidad alta', () => {
  const r = evaluarCierre({
    obligaciones: [{ concepto: 'IERIC', fecha_vencimiento: '2026-06-10', saldo_pendiente: '100' }],
  }, HOY)
  assert.equal(r.hallazgos.find((x) => x.codigo === 'obligaciones_vencidas').severidad, 'alta')
})

t('REGLA DURA: sin fuente NO se da OK, se declara no verificable', () => {
  const r = evaluarCierre({}, HOY)
  assert.equal(r.hallazgos.length, 0)
  assert.equal(r.ok.length, 0, 'nunca un OK sobre algo no verificado')
  assert.ok(r.no_verificable.some((s) => /Conciliación bancaria/.test(s)))
  assert.ok(r.no_verificable.some((s) => /tres puntas/.test(s)))
  assert.ok(r.no_verificable.some((s) => /Estudio Contable/.test(s)))
})

t('si la fuente aparece, el punto deja de ser no verificable', () => {
  const r = evaluarCierre({ fuentes: { remitos: true } }, HOY)
  assert.ok(!r.no_verificable.some((s) => /tres puntas/.test(s)))
})

t('orden: severidad alta primero, luego por monto', () => {
  const r = evaluarCierre({
    recibidos: [{ obra_texto: '', imp_total: '5' }, { obra_texto: 'A', imp_total: '1' }],
    obligaciones: [{ concepto: 'x', fecha_vencimiento: '2026-01-01', saldo_pendiente: '1' }],
  }, HOY)
  assert.equal(r.hallazgos[0].severidad, 'alta')
})

t('formatCierre no miente: marca lo no verificable como tal', () => {
  const txt = formatCierre(evaluarCierre({}, HOY))
  assert.match(txt, /no es un OK/)
})

t('periodoActual con 2 dígitos', () => {
  assert.equal(periodoActual(new Date('2026-03-05T12:00:00Z')), '2026-03')
})

console.log(`control-administrativo: ${n} checks OK`)
