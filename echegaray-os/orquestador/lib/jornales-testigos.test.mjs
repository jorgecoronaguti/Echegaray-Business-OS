// LOS TESTIGOS DE UNA QUINCENA, EN FRÍO — con los lotes reales del extracto del 16/08/2026.
//
// Todos los casos salen de la corrida sobre el archivo vivo: los importes, las fechas y la
// composición de cada lote son los que tenía `_BANCO_RAW` ese día. Un test con números inventados
// habría pasado igual con el criterio viejo.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  lotesDeHaberes, combinacionUnica, testigoDeQuincena, fechaImposible, VEREDICTO, GRITAN,
} from './jornales-testigos.mjs'
import { NAT } from './banco-santander.mjs'

const deb = (fecha, importe, fila, naturaleza = NAT.sueldos) => ({ fecha, importe, fila, naturaleza, concepto: '' })

// El lote del 17/07 (46220): catorce "Pago haberes - 260717507" + el pago por CCI del mismo día.
// Suman $3.775.150, que es exactamente la columna "Banco" de la quincena que se paga ese día.
const LOTE_17_07 = [
  238600, 267500, 256000, 258000, 250000, 256000, 253400, 251000, 277000, 258000, 248000, 240000,
  252350, 217100,
].map((v, k) => deb(46220, v, 234 + k)).concat([deb(46220, 252200, 225)])

// El del 31/07 (46234): dieciséis haberes + CCI, $6.067.921,10 en total. La quincena reclama
// $3.336.233,42 — los catorce chicos más el CCI. Los dos de $1.365.843,84 son de otro bloque.
const LOTE_31_07 = [
  1365843.84, 1365843.84, 174293.22, 254024.9, 210593.22, 265024.9, 257024.9, 177693.22, 249024.9,
  171693.22, 237524.9, 175343.22, 189093.22, 247024.9, 247024.9, 228024.9,
].map((v, k) => deb(46234, v, 308 + k)).concat([deb(46234, 252824.9, 304)])

const CORTE_BANCO = 46248
// El extracto vivo arranca el 28/05 (46170) y ese día no hay haberes: la ventana del extracto la fija
// el PRIMER movimiento de cualquier tipo, no el primer sueldo. Sin esta fila, "fuera de ventana" y
// "no hay testigo" se confundirían — y son dos cosas distintas para el dueño.
const PRIMERA_DEL_EXTRACTO = deb(46170, 69000, 4, 'Comisiones y gastos bancarios')
const ctx = (debitos) => {
  const todos = [PRIMERA_DEL_EXTRACTO, ...debitos]
  return {
    lotes: lotesDeHaberes(todos),
    corte: CORTE_BANCO,
    desdeExtracto: Math.min(...todos.map((d) => d.fecha)),
  }
}

// ── EL DEFECTO: LA COLUMNA VACÍA QUE SE CONVERTÍA EN DEUDA ───────────────────────────────────────

test('BANCO: la quincena sin «Pagado el» que el extracto SÍ prueba', () => {
  // f146 del archivo vivo: $7.227.250 de TOTAL, $3.775.150 por banco, columna N vacía. Con el
  // criterio viejo esto era deuda entera y en silencio.
  const t = testigoDeQuincena({ pago: 46220, hasta: 46218, banco: 3775150, pagado: null }, ctx(LOTE_17_07))
  assert.equal(t.veredicto, VEREDICTO.banco)
  assert.equal(t.fecha, 46220, 'la fecha es la del DÉBITO, no la prevista')
  assert.equal(t.cubierto, 3775150)
  assert.equal(t.filas.length, 15)
})

test('BANCO: el subconjunto exacto dentro de un lote que mezcla dos nóminas', () => {
  // f147: el día 31/07 salieron $6.067.921,10 y a la quincena le tocan $3.336.233,42.
  const t = testigoDeQuincena({ pago: 46237, hasta: 46234, banco: 3336233.42, pagado: null }, ctx(LOTE_31_07))
  assert.equal(t.veredicto, VEREDICTO.banco)
  assert.equal(t.fecha, 46234, 'se pagó tres días ANTES de la fecha prevista: la ventana lo tiene que aceptar')
  assert.ok(!t.filas.includes(308) && !t.filas.includes(309), 'los dos de $1.365.843,84 no son de esta quincena')
})

test('SIN_TESTIGO: la ventana del extracto cubre la fecha y no hay ningún haber — se grita', () => {
  // f144: la planilla dice $5.060.000 por banco alrededor del 16/06 y el extracto, que llega a esa
  // fecha, no tiene un solo débito de haberes. Es una contradicción, no un "todavía no".
  const t = testigoDeQuincena({ pago: 46189, hasta: 46188, banco: 5060000, pagado: null }, ctx(LOTE_17_07))
  assert.equal(t.veredicto, VEREDICTO.sinTestigo)
  assert.ok(GRITAN.includes(t.veredicto), 'un dato que falta no puede volverse deuda en silencio')
})

test('FUERA_DE_VENTANA: lo que el extracto no alcanza NO se declara impago, se declara no probado', () => {
  const t = testigoDeQuincena({ pago: 46143, hasta: 46142, banco: 4150650, pagado: null }, ctx(LOTE_17_07))
  assert.equal(t.veredicto, VEREDICTO.fueraDeVentana)
  assert.match(t.motivo, /el extracto empieza el 2026-05-28/)
})

test('SIN_BANCO: sin plata por banco NINGUNA fuente puede opinar, y eso también se dice', () => {
  const t = testigoDeQuincena({ pago: 46204, hasta: 46203, banco: 0, pagado: null }, ctx(LOTE_17_07))
  assert.equal(t.veredicto, VEREDICTO.sinBanco)
})

// ── LA COLUMNA CORRUPTA: FECHAS QUE NO PUEDEN SER ────────────────────────────────────────────────

test('FECHA_IMPOSIBLE: no se paga una quincena antes de que termine de trabajarse', () => {
  // f139 del archivo vivo: "pagada el 16/03" sobre una quincena que cierra el 31/03.
  assert.match(fechaImposible({ pagado: 46097, hasta: 46112, pago: 46113 }), /no se paga antes de trabajarse/)
})

test('FECHA_IMPOSIBLE: 122 días después de la prevista no es un atraso, es un desalineamiento', () => {
  // f134: quincena de enero con "Pagado el" del 18/05 — la columna corrida ocho filas.
  const t = testigoDeQuincena({ pago: 46038, hasta: 46037, banco: 1380275, pagado: 46160 }, ctx(LOTE_17_07))
  assert.equal(t.veredicto, VEREDICTO.imposible)
  assert.match(t.motivo, /122 días después/)
  assert.equal(t.fecha, null, 'esa fecha no se usa para nada: movería la plata de enero a mayo')
})

test('una fecha creíble sigue mandando: el dueño edita y su edición vale', () => {
  const t = testigoDeQuincena({ pago: 46220, hasta: 46218, banco: 3775150, pagado: 46220 }, ctx(LOTE_17_07))
  assert.equal(t.veredicto, VEREDICTO.conciliado, 'el dueño y el banco dicen lo mismo')
})

test('CONTRADICE: el dueño la marca pagada y el banco muestra otro día — se grita, no se elige', () => {
  // 20 días después de la prevista: creíble como fecha (no es imposible), pero el banco debitó otro
  // día. El sistema no elige cuál vale — lo pone sobre la mesa.
  const t = testigoDeQuincena({ pago: 46220, hasta: 46218, banco: 3775150, pagado: 46240 }, ctx(LOTE_17_07))
  assert.equal(t.veredicto, VEREDICTO.contradice)
  assert.match(t.motivo, /«Pagado el» dice 2026-08-06 y el banco debitó el 2026-07-17/)
})

// ── LA ARITMÉTICA QUE SOSTIENE TODO ──────────────────────────────────────────────────────────────

test('combinación: catorce débitos iguales dan UNA sola forma, no 3.003', () => {
  // Contar por índice y no por importe haría "ambiguo" a todo lote de nómina, que es la forma normal
  // de un pago de haberes: este módulo no probaría nunca nada.
  const iguales = Array.from({ length: 14 }, () => 260000)
  const c = combinacionUnica(iguales, 3640000)
  assert.equal(c.unica, true)
  assert.equal(c.indices.length, 14)
})

test('combinación: si dos subconjuntos distintos dan el mismo total, NO se empareja', () => {
  const c = combinacionUnica([100, 200, 300, 500], 500)
  assert.equal(c.unica, false, '500 = 500 y también 200+300: elegir uno sería inventar el criterio')
  assert.match(c.motivo, /combinaciones distintas/)
})

test('los centavos no se pierden: $3.336.233,42 se busca exacto', () => {
  const c = combinacionUnica([3336233.42, 1000000], 3336233.42)
  assert.equal(c.unica, true)
  assert.deepEqual(c.indices, [0])
})

test('lotes: sólo los débitos de naturaleza Sueldos, y nunca uno ya reclamado por otro movimiento', () => {
  const debitos = [...LOTE_17_07, deb(46220, 999999, 500, 'AFIP')]
  assert.equal(lotesDeHaberes(debitos).get(46220).filas.length, 15, 'el débito de AFIP no es un haber')
  const usados = new Set([234])
  assert.equal(lotesDeHaberes(debitos, { usados }).get(46220).filas.length, 14,
    'un débito respalda a UN movimiento: si no, la misma plata paga dos veces')
})
