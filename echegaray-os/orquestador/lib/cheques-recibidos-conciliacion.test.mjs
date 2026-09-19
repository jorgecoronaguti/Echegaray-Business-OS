import test from 'node:test'
import assert from 'node:assert/strict'
import {
  reconciliarDepositado,
  totalesRegistro,
  esDepositoEcheq,
  leerDepositosEcheqBanco,
  reconciliarDesdeBanco,
  PATRON_DEPOSITO_ECHEQ,
} from './cheques-recibidos-conciliacion.mjs'

// Los 5 depósitos eCHEQ reales del extracto (public.banco_movimientos, lower(concepto) like '%deposito e-cheq%').
const DEPOSITOS_BANCO = [
  { fecha: '2026-06-02', importe: 15_000_000 },
  { fecha: '2026-06-17', importe: 15_000_000 },
  { fecha: '2026-07-01', importe: 15_000_000 },
  { fecha: '2026-07-16', importe: 10_000_000 },
  { fecha: '2026-07-23', importe: 3_940_000 },
]
const DEPOSITADO_BANCO = 58_940_000

test('depositadoBanco = suma real de los depósitos eCHEQ del banco (58.940.000)', () => {
  const r = reconciliarDepositado({ depositosBanco: DEPOSITOS_BANCO, entro: 0, endosado: 0, enCartera: 0 })
  assert.equal(r.depositadoBanco, DEPOSITADO_BANCO)
  assert.equal(r.detalle.cantidadDepositos, 5)
})

test('acepta importes como números sueltos, no sólo filas {importe}', () => {
  const r = reconciliarDepositado({ depositosBanco: [15e6, 15e6, 15e6, 10e6, 3.94e6], entro: 0, endosado: 0, enCartera: 0 })
  assert.equal(r.depositadoBanco, DEPOSITADO_BANCO)
})

test('CASO REAL: con el banco, "Falta bajar" pasa de 40M (registro) a 30M — y NO cierra', () => {
  // Totales del registro derivados de las OPERACIONES reales (no hardcodeados acá).
  const { entro, endosado, depositadoRegistro } = totalesRegistro()
  assert.equal(entro, 119_230_000, 'Aceptación (entró) del registro')
  assert.equal(endosado, 20_000_000, 'Endoso a Alumetal')
  assert.equal(depositadoRegistro, 48_940_000, 'Depósito según la captura manual')

  const enCartera = 10_290_000 // LO MANDA CAJA (extracto), no se recalcula
  const r = reconciliarDepositado({ depositosBanco: DEPOSITOS_BANCO, entro, endosado, enCartera, depositadoRegistro })

  assert.equal(r.depositadoBanco, DEPOSITADO_BANCO)
  assert.equal(r.faltaBajar, 30_000_000) // 119,23 − 58,94 − 20 − 10,29
  assert.equal(r.cierra, false)
  // El banco vio $10M más depositados que la captura manual: eso es lo que la reconciliación corrige.
  assert.equal(r.detalle.reconciliacionDeposito, 10_000_000)
  assert.equal(r.detalle.faltaBajarPrevio, 40_000_000) // lo que mostraba la pestaña antes
  assert.equal(r.detalle.mejora, 10_000_000) // 40M → 30M
})

test('BORDE — cierra: entró = depositado(banco) + endosado + en cartera ⇒ faltaBajar 0, cierra true', () => {
  const enCartera = 10_000_000
  const entro = DEPOSITADO_BANCO + 20_000_000 + enCartera // exacto
  const r = reconciliarDepositado({ depositosBanco: DEPOSITOS_BANCO, entro, endosado: 20_000_000, enCartera })
  assert.equal(r.faltaBajar, 0)
  assert.equal(r.cierra, true)
})

test('BORDE — no cierra: un peso de más deja faltaBajar 1 y cierra false (tolerancia 0)', () => {
  const enCartera = 10_000_000
  const entro = DEPOSITADO_BANCO + 20_000_000 + enCartera + 1
  const r = reconciliarDepositado({ depositosBanco: DEPOSITOS_BANCO, entro, endosado: 20_000_000, enCartera })
  assert.equal(r.faltaBajar, 1)
  assert.equal(r.cierra, false)
})

test('BORDE — tolerancia: un desvío chico dentro de tolerancia cuenta como cerrado', () => {
  const enCartera = 10_000_000
  const entro = DEPOSITADO_BANCO + 20_000_000 + enCartera + 40
  const r = reconciliarDepositado({ depositosBanco: DEPOSITOS_BANCO, entro, endosado: 20_000_000, enCartera, tolerancia: 50 })
  assert.equal(r.faltaBajar, 40)
  assert.equal(r.cierra, true)
})

test('NO recalcula "en cartera": es un parámetro (lo manda CAJA), aparece tal cual en el detalle', () => {
  const r = reconciliarDepositado({ depositosBanco: DEPOSITOS_BANCO, entro: 100e6, endosado: 20e6, enCartera: 10_290_000 })
  assert.equal(r.detalle.enCartera, 10_290_000)
})

test('sin depositadoRegistro, los campos de comparación quedan en null (no se inventan)', () => {
  const r = reconciliarDepositado({ depositosBanco: DEPOSITOS_BANCO, entro: 100e6, endosado: 20e6, enCartera: 10e6 })
  assert.equal(r.detalle.depositadoRegistro, null)
  assert.equal(r.detalle.reconciliacionDeposito, null)
  assert.equal(r.detalle.faltaBajarPrevio, null)
  assert.equal(r.detalle.mejora, null)
})

test('valida entradas: números no finitos explican cuál falló; depositosBanco debe ser array', () => {
  assert.throws(() => reconciliarDepositado({ depositosBanco: DEPOSITOS_BANCO, entro: undefined, endosado: 0, enCartera: 0 }), /entro/)
  assert.throws(() => reconciliarDepositado({ depositosBanco: DEPOSITOS_BANCO, entro: 0, endosado: NaN, enCartera: 0 }), /endosado/)
  assert.throws(() => reconciliarDepositado({ depositosBanco: 'no-array', entro: 0, endosado: 0, enCartera: 0 }), /array/)
})

test('esDepositoEcheq usa el mismo criterio que el LIKE del SQL', () => {
  assert.ok(esDepositoEcheq('DEPOSITO E-CHEQ 12345'))
  assert.ok(esDepositoEcheq('Deposito E-Cheq recepción'))
  assert.ok(!esDepositoEcheq('EMISION E-CHEQ'))
  assert.ok(!esDepositoEcheq(null))
  // El patrón SQL y el chequeo en memoria hablan de lo mismo.
  assert.equal(PATRON_DEPOSITO_ECHEQ, '%deposito e-cheq%')
})

test('leerDepositosEcheqBanco: filtra por el patrón, normaliza fecha e importe (queryFn inyectada)', async () => {
  const capturado = {}
  const fakeQuery = async (text, params) => {
    capturado.text = text; capturado.params = params
    return { rows: [
      { fecha: new Date('2026-06-02T00:00:00Z'), concepto: 'DEPOSITO E-CHEQ', importe: '15000000' },
      { fecha: '2026-07-23', concepto: 'DEPOSITO E-CHEQ', importe: 3940000 },
    ] }
  }
  const filas = await leerDepositosEcheqBanco(fakeQuery)
  assert.match(capturado.text, /banco_movimientos/)
  assert.match(capturado.text, /lower\(concepto\) like \$1/)
  assert.deepEqual(capturado.params, [PATRON_DEPOSITO_ECHEQ])
  assert.deepEqual(filas, [
    { fecha: '2026-06-02', concepto: 'DEPOSITO E-CHEQ', importe: 15_000_000 },
    { fecha: '2026-07-23', concepto: 'DEPOSITO E-CHEQ', importe: 3_940_000 },
  ])
})

test('reconciliarDesdeBanco: compone banco (inyectado) + registro real, sin recalcular en cartera', async () => {
  const fakeQuery = async () => ({ rows: DEPOSITOS_BANCO.map((d) => ({ ...d, concepto: 'DEPOSITO E-CHEQ' })) })
  const r = await reconciliarDesdeBanco({ enCartera: 10_290_000, queryFn: fakeQuery })
  assert.equal(r.depositadoBanco, DEPOSITADO_BANCO)
  assert.equal(r.faltaBajar, 30_000_000)
  assert.equal(r.cierra, false)
  assert.equal(r.detalle.reconciliacionDeposito, 10_000_000)
})
