import test from 'node:test'
import assert from 'node:assert/strict'

import { deBancoCargos } from './libro-extractores.mjs'
import { deBancoObligaciones } from './libro-extractores-banco-obligaciones.mjs'
import { deDepositosRetenidos } from './libro-extractores-retenidos.mjs'
import * as respaldo from './libro-respaldo-banco.mjs'

const { debitosDelExtracto } = respaldo
import { pagosGremialesDelBanco } from './cargas-pagos-banco.mjs'
import { deduplicar, movimiento, SALE } from './libro-movimientos.mjs'
import { clasificarMovimiento } from './banco-santander.mjs'
import { serialDe } from './libro-extractores-fechas.mjs'

// ═══ DOS MOVIMIENTOS IDÉNTICOS DEL MISMO DÍA SON DOS MOVIMIENTOS (18/09/2026) ═══
//
// `_BANCO_RAW` no trae la referencia del banco, y el libro armaba la identidad con fecha + concepto +
// importe. Las 15 acreditaciones del Fondo de Cese del 10/09 ($1.160.400) tienen SEIS importes
// distintos: `deduplicar` dejó 6 filas y el libro perdió $593.044 — Cargas Sociales mostraba
// $567.356 pagados. Los dos pagos de IERIC/FODECO del 11/09 ($13.794,56 cada uno) quedaron en uno.
//
// LOS DATOS SON LOS REALES: `public.banco_movimientos` ids 1038–1052 y 1058–1059, leídos el
// 18/09/2026, en el orden del banco (`order by fecha, id`, que es el orden con que se escribe la
// réplica). La referencia del banco (30262913…30262927, 15905659, 17674210) NO viaja a `_BANCO_RAW`.

const S = (iso) => serialDe(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)), Number(iso.slice(8, 10)))
/** Una fila de `_BANCO_RAW`: A fecha · B concepto · C importe · D saldo · E signo · F naturaleza. */
const filaB = (iso, concepto, importe, saldo) => [S(iso), concepto, importe, saldo,
  importe < 0 ? 'sale' : 'entra', clasificarMovimiento(concepto)]
const CAB = [['_BANCO_RAW'], ['nota'], ['Fecha', 'Concepto', 'Importe', 'Saldo después', 'Entra o sale', 'Naturaleza']]

const FCL = 'Acreditacion en cta pago volunt - Acreditacion fondo desempleo 082026 - cuit 30716304643'
const FCL_10_09 = [
  [-50784.00, 4694557.27], [-43192.00, 4651365.27], [-50784.00, 4600581.27], [-43192.00, 4557389.27],
  [-132966.40, 4424422.87], [-76176.00, 4348246.87], [-64788.00, 4283458.87], [-199449.60, 4084009.27],
  [-76176.00, 4007833.27], [-64788.00, 3943045.27], [-76176.00, 3866869.27], [-76176.00, 3790693.27],
  [-64788.00, 3725905.27], [-76176.00, 3649729.27], [-64788.00, 3584941.27],
].map(([imp, saldo]) => filaB('2026-09-10', FCL, imp, saldo))
const PMC = 'Pago de servicios - Ieric cont.1p: 30716304643 - tarj nro. 3537'
const IERIC_11_09 = [filaB('2026-09-11', PMC, -13794.56, 41864414.60), filaB('2026-09-11', PMC, -13794.56, 41850620.04)]
const BANCO = [...CAB, ...FCL_10_09, ...IERIC_11_09]

// Las boletas de agosto: `_UOCRA_DDJJ_RAW` (A período · B boleta · H total · I FCL) y las de IERIC.
const BOLETAS = [['título'], ['nota'], ['Período', 'Boleta'],
  ['2026-08', 'Original', 21, 0, 0, 0, 0, 994941.26, 1379455.92, '2026-08.pdf']]
const BOLETAS_IERIC = [
  { organismo: 'IERIC', periodo: '2026-08', total: 13794.56, boleta: '5776268', vence: null },
  { organismo: 'FODECO', periodo: '2026-08', total: 13794.56, boleta: '5776271', vence: null },
]

const redondo = (n) => Math.round(n * 100) / 100
const suma = (ms) => redondo(ms.reduce((a, m) => a + m.signo * m.importe, 0))

/** El camino del libro, en el orden de `libro-movimientos-pestana.mjs`: extracto → apareo → emisión → dedupe. */
function libroDelExtracto(banco) {
  const debitos = debitosDelExtracto(banco)
  const usados = new Set()
  const pagosGremiales = pagosGremialesDelBanco({ debitos, boletas: BOLETAS, boletasIeric: BOLETAS_IERIC, usados })
  const { movimientos } = deBancoObligaciones({ debitos, usados, pagosGremiales })
  return { emitidos: movimientos, ...deduplicar(movimientos) }
}

test('EL CASO DEL 10/09: las 15 acreditaciones del Fondo de Cese llegan enteras al libro — $1.160.400, no $567.356', () => {
  const { emitidos, libro, colapsos } = libroDelExtracto(BANCO)
  const fcl = (ms) => ms.filter((m) => /Fondo de Cese/.test(m.concepto))
  assert.equal(fcl(emitidos).length, 15, 'el extractor emite las quince')
  assert.equal(suma(fcl(emitidos)), -1160400)
  assert.equal(fcl(libro).length, 15, `el dedupe se comió ${15 - fcl(libro).length} acreditación(es)`)
  assert.equal(suma(fcl(libro)), -1160400, 'faltaban $593.044: el libro sólo sumaba los seis importes distintos')
  assert.deepEqual(colapsos, [], 'no hay dos hechos con la misma identidad: nada colapsa')
})

test('EL CASO DEL 11/09: los dos pagos de IERIC/FODECO de $13.794,56 son dos, no uno', () => {
  const { libro } = libroDelExtracto(BANCO)
  const ieric = libro.filter((m) => /IERIC|FODECO/.test(m.concepto))
  assert.equal(ieric.length, 2)
  assert.equal(suma(ieric), -27589.12, 'faltaban $13.794,56')
})

test('el libro por fuente bancaria cuadra con el extracto al centavo, fila por fila', () => {
  const { libro } = libroDelExtracto(BANCO)
  const extracto = redondo(BANCO.slice(3).reduce((a, f) => a + f[2], 0))
  assert.equal(suma(libro), extracto)
})

test('la identidad es ESTABLE: dos corridas sobre el mismo extracto dan las mismas claves', () => {
  const a = libroDelExtracto(BANCO).libro.map((m) => m.clave).sort()
  const b = libroDelExtracto(structuredClone(BANCO)).libro.map((m) => m.clave).sort()
  assert.deepEqual(a, b)
  assert.equal(new Set(a).size, a.length)
})

test('la PRIMERA ocurrencia conserva la clave de siempre; sólo la repetida lleva ordinal', () => {
  const refs = respaldo.referenciasDelExtracto(BANCO)
  const base = `${S('2026-09-10')}|${FCL}|-50784`
  assert.equal(refs.get(4), base, 'la fila que no se repite no cambia de clave: nada aguas abajo se mueve')
  assert.equal(refs.get(6), `${base}#2`, 'la segunda de $50.784 del mismo día es otra')
  assert.equal(refs.get(5), `${S('2026-09-10')}|${FCL}|-43192`)
  assert.equal(new Set(refs.values()).size, BANCO.length - 3)
})

test('el ordinal no depende de qué extractor mira la fila: la misma fila da la misma clave en todos', () => {
  const COMISION = 'Comision por transferencia - canal electronico'
  const banco = [...CAB,
    filaB('2026-09-15', COMISION, -1512.5, 100), filaB('2026-09-15', FCL, -50784, 90),
    filaB('2026-09-15', COMISION, -1512.5, 80)]
  const cargos = deBancoCargos(banco)
  assert.equal(cargos.length, 2, 'las dos comisiones idénticas del mismo día son dos cargos')
  assert.equal(deduplicar(cargos).libro.length, 2)
  for (const d of debitosDelExtracto(banco).filter((x) => x.concepto === COMISION)) {
    const comoDebito = movimiento({ fecha: d.fecha, signo: SALE, importe: d.importe, estado: 'REAL',
      instrumento: 'debito', referenciaBanco: d.referencia, origen: { pestana: '_BANCO_RAW', fila: d.fila } })
    const comoCargo = cargos.find((m) => m.origen.fila === d.fila)
    assert.equal(comoDebito.clave, comoCargo.clave,
      'si dos extractores emiten la misma fila, el dedupe tiene que reconocerla como UN hecho')
  }
})

test('mayúsculas y espacios no parten un grupo: la clave se normaliza, el ordinal también', () => {
  const banco = [...CAB, filaB('2026-09-15', 'Comision  X', -10, 1), filaB('2026-09-15', 'comision x', -10, 2)]
  const cargos = deBancoCargos(banco)
  assert.equal(new Set(cargos.map((m) => m.clave)).size, 2)
})

test('dos depósitos retenidos idénticos del mismo día son dos ingresos proyectados', () => {
  const DEP = 'Deposito de echeq - cuit 30711111111'
  const banco = [...CAB, filaB('2026-09-16', DEP, 500000, ''), filaB('2026-09-16', DEP, 500000, '')]
  const { movimientos } = deDepositosRetenidos(banco)
  assert.equal(movimientos.length, 2)
  assert.equal(deduplicar(movimientos).libro.length, 2)
})
