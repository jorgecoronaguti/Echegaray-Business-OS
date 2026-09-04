// LA DETECCIÓN DE ANOMALÍAS. Cada test afirma algo que, si se rompiera, produciría una alerta que
// nadie puede accionar — o peor, silencio sobre algo que sí importaba.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mediana, mad, anomaliaPorZ, duplicadosProbables, MINIMO_MUESTRAS, SEVERIDAD } from './anomalias.mjs'

test('la mediana no la mueve un outlier; el promedio sí', () => {
  const xs = [10, 10, 10, 10, 1000]
  assert.equal(mediana(xs), 10)
  // El promedio de eso es 208: un detector construido sobre el promedio declararía normal al 1000.
  assert.ok(xs.reduce((a, b) => a + b) / xs.length > 200)
})

test('con pocas muestras NO se declara nada', () => {
  // Con tres compras la «mediana histórica» es una de las tres y todo parece anómalo contra ella.
  const r = anomaliaPorZ(1000, [10, 10, 10])
  assert.equal(r.anomala, false)
  assert.match(r.porQue, /sólo 3 comparables/)
  assert.ok(MINIMO_MUESTRAS >= 6)
})

test('un valor disparado contra un historial estable SÍ se declara, y se explica', () => {
  const r = anomaliaPorZ(500000, [10000, 11000, 9500, 10500, 9800, 10200, 10100])
  assert.equal(r.anomala, true)
  assert.equal(r.severidad, SEVERIDAD.ALTA)
  // La explicación tiene que servir sin saber qué es un z-score.
  assert.match(r.porQue, /mediana/)
  assert.match(r.porQue, /comparables/)
  assert.ok(!/z-?score/i.test(r.porQue))
})

test('una variación DESPRECIABLE no explota el cociente', () => {
  // Defecto real del 04/09: seis cargas de combustible de $20.000 y una de $10.000 daban «89.932
  // veces la variación típica», porque la MAD eran once centavos. Aritméticamente correcto,
  // completamente inútil: nadie decide con 89.932.
  //
  // EL CASO TIENE QUE TENER MAD PEQUEÑA PERO NO CERO. Con MAD exactamente 0 lo atrapa la otra rama
  // (`!s`) y el test pasa con la guarda quitada: verificado, cero rojos. Estos siete valores dejan
  // una MAD de ~$0,33 sobre una mediana de $20.000 — despreciable y distinta de cero, que es el
  // caso que la guarda existe para cubrir.
  const r = anomaliaPorZ(10000, [20000, 20000, 20000, 20000.11, 20000.22, 20000.33, 20000.44])
  assert.equal(r.anomala, true)
  assert.equal(r.z, null, 'no se publica un z sin sentido')
  assert.match(r.porQue, /50% de diferencia/)
})

test('lo que está dentro de su propia variación NO se declara', () => {
  const r = anomaliaPorZ(10300, [10000, 11000, 9500, 10500, 9800, 10200, 10100])
  assert.equal(r.anomala, false)
})

test('el historial son las ANTERIORES, no todas: una observación no se compara consigo misma', () => {
  // Si el valor entrara en su propio historial, movería la mediana hacia sí y se escondería.
  const conElla = anomaliaPorZ(500000, [10000, 11000, 9500, 10500, 9800, 10200, 500000])
  const sinElla = anomaliaPorZ(500000, [10000, 11000, 9500, 10500, 9800, 10200])
  assert.ok(Math.abs(sinElla.z) > Math.abs(conElla.z ?? 0))
})

// ── DUPLICADOS ─────────────────────────────────────────────────────────────────────────────────

const par = (extra = {}) => ([
  { id: 1, entidad: 'ACME', importe: 130680, fecha: '2026-04-03', comprobante: '0004-767', ...extra.a },
  { id: 2, entidad: 'ACME', importe: 130680, fecha: '2026-04-03', comprobante: '0004-767', ...extra.b },
])

test('mismo proveedor, mismo importe y MISMO comprobante es severidad alta', () => {
  const [d] = duplicadosProbables(par())
  assert.equal(d.severidad, SEVERIDAD.ALTA)
  assert.match(d.porQue, /EL MISMO comprobante/)
})

test('comprobantes DISTINTOS no se avisan: son dos facturas reales del mismo importe', () => {
  // Caso real del 04/09: Combustibles Barcelo, misma factura repartida entre dos equipos. Avisarlo
  // como duplicado entrena a ignorar la alerta.
  assert.equal(duplicadosProbables(par({ b: { comprobante: '0004-999' } })).length, 0)
})

test('el mismo importe lejos en el tiempo no es un duplicado', () => {
  assert.equal(duplicadosProbables(par({ b: { fecha: '2026-06-03' } })).length, 0)
})

test('proveedores distintos nunca se comparan', () => {
  assert.equal(duplicadosProbables(par({ b: { entidad: 'OTRO' } })).length, 0)
})

test('sin comprobante en alguno, se avisa pero como MEDIA: puede ser real', () => {
  const [d] = duplicadosProbables(par({ b: { comprobante: null } }))
  assert.equal(d.severidad, SEVERIDAD.MEDIA)
})

test('mad devuelve null sin datos, no 0: no saber no es «no hay variación»', () => {
  assert.equal(mad([]), null)
  assert.equal(mediana([]), null)
})
