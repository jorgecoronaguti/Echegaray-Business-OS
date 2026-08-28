// LOS SEIS RECURSOS EN DÓLARES DEL LIBRO, Y LOS TRES QUE SÓLO LOS MENCIONAN.
//
// Todos los casos son filas literales de `Planilla para Cotizar (2).xlsm`
// (sha256 0353cf88729ccdcf3a38c6ef87af52069a73fd4281c1b1f4b4006d29d5a7794a). Si el libro cambia,
// estos tests siguen siendo la definición de lo que se leyó el 28/08/2026 — por eso van con su
// fila al lado.
//
// EL DEFECTO QUE ATRAPAN: `base-maestra-xlsm.mjs` importaba «COSTO PUNTA MARTILLO - DOLAR» = 478
// como cuatrocientos setenta y ocho PESOS. Si `monedaDe` vuelve a devolver ARS para un recurso con
// unidad `DOLAR`, la primera prueba se pone roja.
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CONFIANZA, MONEDA, costoPresupuestario, esCotizacionDeMoneda, monedaDe, monedaDeComposicion, tipoDeCambioDeLibro,
} from './base-maestra-moneda.mjs'

/** Las seis líneas de T1126.1 — ALQUILER BOBCAT con MARTILLO, `Análisis!1291`. */
const T1126_1 = Object.freeze([
  { fila: 345, codigo: '334', nombre: 'COSTO HORA BOBCAT S650 - DOLAR', unidad: 'DOLAR', costo: 16.58, desperdicio: 0.02 },
  { fila: 346, codigo: '335', nombre: 'COSTO PUNTA MARTILLO - DOLAR', unidad: 'DOLAR', costo: 478, desperdicio: 0.02 },
  { fila: 347, codigo: '336', nombre: 'COSTO HORA MARTILLO BOBCAT - DOLAR', unidad: 'DOLAR', costo: 5, desperdicio: 0.02 },
  { fila: 6, codigo: '0.1', nombre: 'OFICIAL ESPECIALIZADO - EN DOLARES', unidad: 'HS', costo: 4.5, desperdicio: 0 },
  { fila: 265, codigo: '255.1', nombre: 'CARGA SOCIAL OF E - DOLAR', unidad: 'HR', costo: 4, desperdicio: 0 },
  { fila: 289, codigo: '278.1', nombre: 'GAS OIL - DOLAR', unidad: 'Lt', costo: 1.5, desperdicio: 0.03 },
])

test('la unidad DOLAR declara la moneda con confianza alta', () => {
  const r = monedaDe({ nombre: 'COSTO PUNTA MARTILLO - DOLAR', unidad: 'DOLAR' })
  assert.equal(r.moneda, MONEDA.USD)
  assert.equal(r.confianza, CONFIANZA.ALTA)
})

test('el sufijo del nombre alcanza aunque la unidad sea hs o Lt', () => {
  // 0.1 y 278.1 se cotizan por hora y por litro: la unidad no puede decir la moneda.
  assert.equal(monedaDe({ nombre: 'OFICIAL ESPECIALIZADO - EN DOLARES', unidad: 'HS' }).moneda, MONEDA.USD)
  assert.equal(monedaDe({ nombre: 'GAS OIL - DOLAR', unidad: 'Lt' }).moneda, MONEDA.USD)
  assert.equal(monedaDe({ nombre: 'CARGA SOCIAL OF E - DOLAR', unidad: 'HR' }).moneda, MONEDA.USD)
})

test('las SEIS líneas de T1126.1 están en dólares', () => {
  const monedas = T1126_1.map((r) => monedaDe(r).moneda)
  assert.deepEqual(monedas, Array(6).fill(MONEDA.USD))
})

test('el gemelo en pesos del mismo recurso sigue siendo peso', () => {
  // `0 OFICIAL ESPECIALIZADO` (6120) y `0.1 … - EN DOLARES` (4,5) conviven en el libro.
  assert.equal(monedaDe({ nombre: 'OFICIAL ESPECIALIZADO', unidad: 'HS' }).moneda, MONEDA.ARS)
  assert.equal(monedaDe({ nombre: 'CARGA SOCIAL OF', unidad: 'HR' }).moneda, MONEDA.ARS)
  assert.equal(monedaDe({ nombre: 'GAS OIL', unidad: 'LT' }).moneda, MONEDA.ARS)
})

test('mencionar dólares al lado de una cifra NO declara la moneda: queda AMBIGUA', () => {
  for (const nombre of [
    'ALQUILER MINI EXCAVADORA - 275 DOLARES EL DIAL',
    'MINI EXCAVADORA - 367 DOLAR EL DIA',
    'VIBRO COMPACTADOR NIWA 643 - EN DOLARES 10 MIL DOLARES',
  ]) {
    const r = monedaDe({ nombre, unidad: 'DIA' })
    assert.equal(r.moneda, MONEDA.AMBIGUA, nombre)
    assert.equal(r.confianza, CONFIANZA.BAJA, nombre)
  }
})

test('AMBIGUA no es ARS: inferir pesos ahí sería inventar cobertura', () => {
  assert.notEqual(monedaDe({ nombre: 'MINI EXCAVADORA - 367 DOLAR EL DIA' }).moneda, MONEDA.ARS)
})

test('el tipo de cambio del libro es una entidad fechada con fuente, no un número', () => {
  const recursos = [
    { fila: 341, codigo: '330', nombre: 'DOLAR BCO NACION - VENTA', unidad: '$', costo: 1500, fecha: '2025-10-01', fuente: 'BCO NACION ' },
    ...T1126_1.map((r) => ({ ...r, fecha: '2026-05-27' })),
  ]
  const tc = tipoDeCambioDeLibro(recursos)
  assert.equal(tc.valor, 1500)
  assert.equal(tc.fecha, '2025-10-01')
  assert.equal(tc.fuente, 'BCO NACION')
  assert.match(tc.origen, /^Recursos!341/)
})

test('«GAS OIL - DOLAR» no es una cotización de moneda: es combustible', () => {
  assert.equal(esCotizacionDeMoneda({ nombre: 'GAS OIL - DOLAR' }), false)
  assert.equal(esCotizacionDeMoneda({ nombre: 'DOLAR BCO NACION - VENTA' }), true)
})

test('sin cotización en el libro, el tipo de cambio es null y no se inventa', () => {
  assert.equal(tipoDeCambioDeLibro(T1126_1), null)
  assert.equal(tipoDeCambioDeLibro([]), null)
})

test('una cotización en cero no es una cotización', () => {
  const tc = tipoDeCambioDeLibro([{ fila: 341, nombre: 'DOLAR BCO NACION - VENTA', costo: 0, fecha: '2025-10-01' }])
  assert.equal(tc, null)
})

test('precio observado y costo presupuestario se guardan los DOS', () => {
  // `Análisis!F1294`: 16,58 × 1,02 = 16,9116. El libro guarda sólo 16,91.
  const c = costoPresupuestario({ observado: 16.58, desperdicio: 0.02, moneda: MONEDA.USD })
  assert.equal(c.observado, 16.58)
  assert.equal(c.desperdicio, 0.02)
  assert.equal(Number(c.presupuestario.toFixed(4)), 16.9116)
  assert.equal(c.moneda, MONEDA.USD)
})

test('un desperdicio que no es fracción se rechaza, no se aplica', () => {
  // Un 5 tipeado donde va 0,05 multiplicaría el costo por seis y nadie lo vería.
  assert.throws(() => costoPresupuestario({ observado: 100, desperdicio: 5 }), RangeError)
  assert.throws(() => costoPresupuestario({ observado: 100, desperdicio: -0.1 }), RangeError)
})

test('la composición de T1126.1 es homogénea en USD', () => {
  const m = monedaDeComposicion(T1126_1.map((r) => ({ moneda: monedaDe(r).moneda })))
  assert.equal(m.moneda, MONEDA.USD)
  assert.equal(m.homogenea, true)
  assert.equal(m.conteo.USD, 6)
})

test('EL DEFECTO: una sola línea en pesos rompe la homogeneidad', () => {
  // Si mañana alguien agrega el gas oil en pesos a la composición del bobcat, el 1450 deja de
  // poder probarse como tipo de cambio. La mezcla se declara MIXTA, nunca se promedia.
  const m = monedaDeComposicion([
    ...T1126_1.map((r) => ({ moneda: monedaDe(r).moneda })),
    { moneda: MONEDA.ARS },
  ])
  assert.equal(m.homogenea, false)
  assert.equal(m.moneda, 'MIXTA')
  assert.match(m.porque, /USD y ARS|ARS y USD/)
})

test('una composición vacía es AMBIGUA, no USD ni ARS', () => {
  const m = monedaDeComposicion([])
  assert.equal(m.moneda, MONEDA.AMBIGUA)
  assert.equal(m.homogenea, false)
})
