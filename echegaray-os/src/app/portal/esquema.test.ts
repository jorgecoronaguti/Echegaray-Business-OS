import test from 'node:test'
import assert from 'node:assert/strict'
import {
  agruparPorObra, aPagoDelPortal, estadoFijadoDe, pagosDelEsquema, publicadoAlPortal,
  sinImportes, tipoDelPago, SIN_OBRA, type FilaEsquema,
} from './esquema.ts'
import { estadoDePago, proximoPago, resumenDeCobro } from './cronograma.ts'

/** Una fila de `esquema_pago` publicada. Los tests cambian sólo lo que están probando. */
function fila(cambios: Partial<FilaEsquema> = {}): FilaEsquema {
  return {
    id: 'f1',
    obra_id: 'pisos-industriales',
    concepto: 'Anticipo (1 de 3)',
    fecha: '2026-09-15',
    monto: '5726423.60',
    reparo: null,
    estado: 'a_vencer',
    medio: null,
    visible_portal: true,
    publicado_at: '2026-08-26T12:00:00Z',
    cambio_pendiente: false,
    orden: 1,
    ...cambios,
  }
}

const TODAS = () => true
const NOMBRES = new Map([['pisos-industriales', 'Pisos Industriales'], ['quattropani', 'Salón Comercial']])

// ── EL PREDICADO DE PUBLICACIÓN ──────────────────────────────────────────────────────────────

test('visible_portal = false NO llega al portal', () => {
  assert.equal(publicadoAlPortal(fila({ visible_portal: false })), false)
  assert.equal(pagosDelEsquema([fila({ visible_portal: false })], NOMBRES, TODAS).length, 0)
})

test('un esquema armado pero sin publicar NO llega al portal', () => {
  assert.equal(publicadoAlPortal(fila({ publicado_at: null })), false)
  assert.equal(pagosDelEsquema([fila({ publicado_at: null })], NOMBRES, TODAS).length, 0)
})

test('cambio_pendiente NO esconde una fila ya publicada', () => {
  // La policy `esquema_pago_select` no lo mira. Esconderla dejaría al cliente sin un pago que ya le
  // fue comunicado.
  assert.equal(publicadoAlPortal(fila({ cambio_pendiente: true })), true)
})

// ── EL ALCANCE POR OBRA ──────────────────────────────────────────────────────────────────────

test('el filtro por obra se aplica sobre lo publicado', () => {
  const filas = [fila({ id: 'a', obra_id: 'pisos-industriales' }), fila({ id: 'b', obra_id: 'quattropani' })]
  const solo = pagosDelEsquema(filas, NOMBRES, (o) => o === 'quattropani')
  assert.deepEqual(solo.map((p) => p.id), ['b'])
})

// ── LA LECTURA DE UNA FILA ───────────────────────────────────────────────────────────────────

test('cobrado usa la fecha como fecha de pago, no como prevista', () => {
  const p = aPagoDelPortal(fila({ estado: 'cobrado', fecha: '2026-08-21' }), 'Pisos Industriales')
  assert.equal(p.fechaPago, '2026-08-21')
  assert.equal(p.fechaPrevista, null)
  assert.equal(estadoDePago(p, '2026-08-26'), 'pagado')
  // Y no aparece como pendiente: un cobrado que además vence sería la misma plata contada dos veces.
  assert.equal(resumenDeCobro([p], null, '2026-08-26').pendiente, 0)
})

test('retenido es el fondo de reparo y NO suma a pendiente', () => {
  assert.equal(tipoDelPago({ estado: 'retenido', concepto: 'Fondo de reparo' }), 'fondo_reparo')
  const p = aPagoDelPortal(fila({ estado: 'retenido', monto: '1000000' }), 'Pisos Industriales')
  assert.equal(p.tipo, 'fondo_reparo')
  assert.equal(resumenDeCobro([p], null, '2026-08-26').pendiente, 0)
  assert.equal(proximoPago([p]), null)
})

test('un certificado CON reparo sigue siendo deuda del cliente', () => {
  // `reparo` es cuánto se retiene DE ese pago, no un pago aparte. Marcarlo como fondo de reparo lo
  // sacaría de «pendiente» y subestimaría lo que el cliente debe.
  const p = aPagoDelPortal(fila({ concepto: 'Certificado 1', reparo: '500000', monto: '1000000' }), 'x')
  assert.equal(p.tipo, 'certificado')
  assert.equal(resumenDeCobro([p], null, '2026-08-26').pendiente, 1_000_000)
})

test('previsto se fija como «sin factura»: una fecha pasada nuestra no es mora del cliente', () => {
  assert.equal(estadoFijadoDe({ estado: 'previsto' }), 'sin_factura')
  const p = aPagoDelPortal(fila({ estado: 'previsto', fecha: '2026-01-01' }), 'x')
  assert.equal(estadoDePago(p, '2026-08-26'), 'sin_factura')
})

test('vencido y a_vencer NO se fijan: los decide la fecha, que es la palanca que se mueve', () => {
  assert.equal(estadoFijadoDe({ estado: 'vencido' }), null)
  const movido = aPagoDelPortal(fila({ estado: 'vencido', fecha: '2026-12-01' }), 'x')
  assert.equal(estadoDePago(movido, '2026-08-26'), 'programado')
})

test('monto NULL sigue siendo NULL, nunca 0', () => {
  assert.equal(aPagoDelPortal(fila({ monto: null }), 'x').monto, null)
  assert.equal(aPagoDelPortal(fila({ monto: '0' }), 'x').monto, 0)
})

test('sin la columna moneda se asume ARS; con USD no se mezcla en el total en pesos', () => {
  assert.equal(aPagoDelPortal(fila(), 'x').moneda, 'ARS')
  const dolar = aPagoDelPortal(fila({ moneda: 'USD', monto: '4235' }), 'x')
  assert.equal(dolar.moneda, 'USD')
  const r = resumenDeCobro([dolar], null, '2026-08-26')
  assert.equal(r.pendiente, 0)
  assert.equal(r.sinMonto, 1)
})

// ── `puede_ver_montos = false` ───────────────────────────────────────────────────────────────

test('sin puede_ver_montos el importe no sale de la capa de datos', () => {
  const pagos = pagosDelEsquema([fila(), fila({ id: 'f2', monto: '99' })], NOMBRES, TODAS)
  const recortados = sinImportes(pagos)
  assert.deepEqual(recortados.map((p) => p.monto), [null, null])
  // NULL, no 0: cero afirmaría que esos pagos no valen nada.
  assert.ok(recortados.every((p) => p.monto !== 0))
  // Y lo demás sigue viajando: fechas, rótulos y comprobantes son lo que sí puede ver.
  assert.deepEqual(recortados.map((p) => p.fechaPrevista), ['2026-09-15', '2026-09-15'])
})

// ── EL AGRUPAMIENTO ──────────────────────────────────────────────────────────────────────────

test('las filas sin obra van a su propio bloque, al final, y no se descartan', () => {
  const filas = [
    fila({ id: 'a', obra_id: 'quattropani', orden: 1 }),
    fila({ id: 'b', obra_id: null, orden: 2 }),
    fila({ id: 'c', obra_id: 'pisos-industriales', orden: 3 }),
  ]
  const bloques = agruparPorObra(pagosDelEsquema(filas, NOMBRES, TODAS))
  assert.deepEqual(bloques.map((b) => b.nombre), ['Pisos Industriales', 'Salón Comercial', SIN_OBRA])
  assert.equal(bloques.at(-1)?.obraId, null)
  // Las tres filas siguen ahí: ninguna se descartó ni se repartió entre las obras.
  assert.equal(bloques.reduce((s, b) => s + b.pagos.length, 0), 3)
})

test('una obra cuyo id no resuelve a nombre cae en «sin obra», no en un bloque sin título', () => {
  const bloques = agruparPorObra(pagosDelEsquema([fila({ obra_id: 'obra-borrada' })], NOMBRES, TODAS))
  assert.deepEqual(bloques.map((b) => b.nombre), [SIN_OBRA])
})

test('el orden es `orden` y la fecha desempata — el mismo que lee la pantalla 32', () => {
  const filas = [
    fila({ id: 'c', orden: 2, fecha: '2026-01-01' }),
    fila({ id: 'a', orden: 1, fecha: '2026-05-05' }),
    fila({ id: 'b', orden: 1, fecha: '2026-02-02' }),
  ]
  assert.deepEqual(pagosDelEsquema(filas, NOMBRES, TODAS).map((p) => p.id), ['b', 'a', 'c'])
})
