// LO PAGADO EN LA WEB DESCARGA LA OBLIGACIÓN DEL LIBRO, NO SÓLO LA CAJA (02/10/2026).
//
// El defecto: el dueño pagó la quincena 16–30/09 y Oficina de septiembre, CAJA bajó la caja por lo pagado, y
// `_MOVIMIENTOS` siguió publicando la quincena (proyectada al 30/09, $9.103.378,78) y el mes (Oficina · 01/10,
// $5.000.000) como VENCIDOS: «faltan» saltó exactamente lo pagado. Si se revierte el neteo en
// libro-extractores-nomina.mjs, los tres primeros tests se ponen rojos.
import test from 'node:test'
import assert from 'node:assert/strict'
import { deJornalesQuincenas, deOficina, deDireccion } from './libro-extractores-nomina.mjs'
import { pagadoWebDeLaReplica, formulaPagadoWebQuincena, formulaPagadoWebMes } from './caja-haberes-web.mjs'

const Q1_DESDE = 46281 // 16/09/2026 — el corte de la réplica (B2)
const Q1_HASTA = 46295 // 30/09/2026
const Q2_DESDE = 46296 // 01/10/2026
const Q2_HASTA = 46310 // 15/10/2026
const Q0_HASTA = 46280 // 15/09/2026 — anterior al corte

// La réplica como la lee la API (desde A1). Los importes son los leídos del Sheet real el 02/10.
const REPLICA = [
  ['_HABERES_PAGADOS_RAW — réplica'],
  ['CAJA lee desde la quincena', Q1_DESDE],
  ['Fecha pago', 'Fecha según', 'Quincena desde', 'Quincena hasta', 'Grupo', 'Persona', 'Medio', 'Sale de', 'Importe', 'Anotó'],
  [46297, 'web', Q1_DESDE, Q1_HASTA, 'obreros', 'A', 'efectivo', 'caja', 6_000_000, ''],
  [46297, 'web', Q1_DESDE, Q1_HASTA, 'obreros', 'A', 'banco', 'banco', 3_192_530.11, ''],
  [46296, 'web', Q2_DESDE, Q2_HASTA, 'obreros', 'B', 'efectivo', 'caja', 253_000, ''],
  [46297, 'web', Q1_DESDE, Q1_HASTA, 'oficina', 'M', 'efectivo', 'caja', 2_218_000, ''],
  [46297, 'web', Q1_DESDE, Q1_HASTA, 'oficina', 'M', 'banco', 'banco', 2_782_893.84, ''],
  // Una quincena anterior al corte NO cuenta aunque esté en la réplica: esa vive en la planilla.
  [46282, 'web', 46266, Q0_HASTA, 'obreros', 'C', 'banco', 'banco', 999_999, ''],
]
const WEB = pagadoWebDeLaReplica(REPLICA)
const HOY = 46297
const col = (xs) => xs.map((x) => [x])

const proyectadas = {
  pago: col([46296, 46311]), hasta: col([Q1_HASTA, Q2_HASTA]), total: col([9_103_378.78, 9_194_920.27]),
}
const deLaQuincena = (ms, hasta) => ms.find((m) => m.concepto.includes(`proyectada al ${hasta}`))

test('la quincena 16–30/09 pagada de más en la web queda en 0 y no da crédito (MAX)', () => {
  const ms = deJornalesQuincenas({ proyectadas }, HOY, { aviso: () => {}, pagadoWeb: WEB })
  const q1 = deLaQuincena(ms, '2026-09-30')
  assert.equal(q1.importe, 0, 'pagado $9.192.530,11 contra $9.103.378,78 proyectado: pendiente 0, nunca negativo')
  assert.match(q1.importeNomina, /^=MAX\(0;\(9103378\.78\)-SUMPRODUCT\(/, 'la celda es viva: lo proyectado menos la web')
  assert.ok(q1.importeNomina.includes(`=${Q1_HASTA})`), 'filtra por el «hasta» de ESA quincena')
})

test('la quincena 01–15/10 con un pago parcial queda en lo proyectado menos lo pagado', () => {
  const ms = deJornalesQuincenas({ proyectadas }, HOY, { aviso: () => {}, pagadoWeb: WEB })
  assert.equal(deLaQuincena(ms, '2026-10-15').importe, 8_941_920.27)
})

test('Oficina de septiembre (se paga el 01/10) pagada en la web deja de ser deuda; Dirección no se toca', () => {
  const bloque = { pago: col([...Array(8).fill(''), 46296]), pagado: col(Array(9).fill('')), proyectado: col([...Array(8).fill(''), 5_000_000]) }
  const ofi = deOficina(bloque, HOY, { aviso: () => {}, pagadoWeb: WEB })
  assert.equal(ofi.length, 1)
  assert.equal(ofi[0].importe, 0, 'pagado $5.000.893,84 contra $5.000.000')
  assert.ok(ofi[0].importeNomina.includes(formulaPagadoWebMes(2026, 9, 'oficina')))
  const dir = deDireccion({ ...bloque, proyectado: col([...Array(8).fill(''), 15_000_000]) }, HOY, { aviso: () => {} })
  assert.equal(dir[0].importe, 15_000_000)
  assert.equal(dir[0].importeNomina, undefined)
})

test('una quincena anterior al corte no cambia, ni en memoria ni en la celda', () => {
  const p = { pago: col([46282]), hasta: col([Q0_HASTA]), total: col([7_000_000]) }
  const [m] = deJornalesQuincenas({ proyectadas: p }, HOY, { aviso: () => {}, pagadoWeb: WEB })
  assert.equal(m.importe, 7_000_000)
  assert.equal(m.importeNomina, undefined)
})

test('sin réplica leída el libro sale como antes (ningún renglón se envuelve)', () => {
  const ms = deJornalesQuincenas({ proyectadas }, HOY, { aviso: () => {} })
  assert.deepEqual(ms.map((m) => m.importe), [9_103_378.78, 9_194_920.27])
  assert.ok(ms.every((m) => m.importeNomina === undefined))
})

test('la quincena CERRADA sin «Pagado el» ni banco también se neta de la web', () => {
  const reales = { pago: col([46296]), hasta: col([Q1_HASTA]), banco: col(['']), pagado: col(['']), total: col([10_000_000]) }
  const ms = deJornalesQuincenas({ reales }, HOY, { aviso: () => {}, pagadoWeb: WEB })
  assert.equal(ms.length, 1)
  assert.equal(ms[0].importe, 807_469.89)
  assert.ok(ms[0].estado !== 'REAL')
})

test('la réplica en memoria y la fórmula usan el mismo filtro: quincena ≥ corte, grupo, «hasta»', () => {
  assert.equal(WEB.quincena(Q1_HASTA), 9_192_530.11)
  assert.equal(WEB.quincena(Q0_HASTA), 0, 'lo anterior al corte no se suma')
  assert.equal(Math.round(WEB.mes(2026, 9, 'oficina') * 100) / 100, 5_000_893.84)
  const f = formulaPagadoWebQuincena(Q1_HASTA)
  assert.ok(f.includes('$C$4:$C>=IF(ISNUMBER(\'_HABERES_PAGADOS_RAW\'!$B$2)'), 'el corte es la celda B2 de la réplica')
  assert.ok(f.includes('<>"oficina"'), 'obreros = todo lo que no es oficina')
  assert.ok(!f.includes('"efectivo"') && !f.includes('"banco"'), 'cuenta los dos medios')
})
