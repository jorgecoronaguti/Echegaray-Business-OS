// EL NÚMERO MAL LEÍDO SE CORRIGE CONTRA ARCA — y contra nada más.
//
// Los datos de este archivo NO son inventados: son las dos filas que `public.comprobantes_arca`
// tiene de Corralón Progreso el 30/07/2026, y la lectura textual que la visión hizo de la foto que
// falló. Un test con datos de fantasía habría pasado igual con la lógica rota.

import test from 'node:test'
import assert from 'node:assert/strict'
import { conciliarConArca, aplicarArca, numeroDeArca, importesCierran, ESTADO_ARCA, VIA } from './arca.mjs'
import { normalizarLectura } from './lectura.mjs'

/** Las dos filas REALES de ARCA. Corralón factura como PEREZ GARCIA MARISOL BIBIANA. */
const ARCA = [
  {
    emisor_cuit: '23369111574', emisor_nombre: 'PEREZ GARCIA MARISOL BIBIANA',
    punto_venta: '4', numero: '3642', cae: '86316017919602', fecha_emision: '2026-07-30',
    imp_total: 62000, total_iva: 10760.33, neto_gravado: 51239.67,
  },
  {
    emisor_cuit: '23369111574', emisor_nombre: 'PEREZ GARCIA MARISOL BIBIANA',
    punto_venta: '6', numero: '3366', cae: '86316052354343', fecha_emision: '2026-07-30',
    imp_total: 31533.9, total_iva: 5355.02, neto_gravado: 26178.88,
  },
]

const leido = (over = {}) => normalizarLectura({
  emisor: 'Corralon Progreso', cuit: '23369111574', letra: 'A', numero: '0004-00036542',
  fecha: '30/07/2026', total: '62.000,00', iva_21: '10.760,33', ...over,
}).comprobante

// ── El formato, que es lo que hace que esto matchee o no matchee NUNCA ────────

test('ARCA guarda punto de venta y número SUELTOS y sin ceros: se arma la forma de Compras', () => {
  assert.equal(numeroDeArca({ punto_venta: '4', numero: '3642' }), '0004-00003642')
  assert.equal(numeroDeArca({ punto_venta: '0004', numero: '00003642' }), '0004-00003642')
  assert.equal(numeroDeArca({ punto_venta: null, numero: '12' }), '0000-00000012')
  assert.equal(numeroDeArca({ punto_venta: '4' }), null, 'sin número no hay número')
})

// ── El defecto: un dígito de más ─────────────────────────────────────────────

test('CUIT + fecha + total identifican la fila, y el número bueno es el de ARCA', () => {
  const c = leido()
  const r = conciliarConArca(c, ARCA)
  assert.equal(r.estado, ESTADO_ARCA.COINCIDE)
  assert.equal(r.via, VIA.CUIT_FECHA_TOTAL)
  assert.equal(r.numeroArca, '0004-00003642')
  assert.equal(r.numeroCorregido, true)

  const bloque = aplicarArca(c, r)
  assert.equal(c.numero, '0004-00003642', 'el comprobante queda con el número verdadero')
  assert.equal(c.numeroLeidoMal, '0004-00036542', 'y con el rastro de lo que se había leído')
  assert.equal(bloque.emisorNombre, 'PEREZ GARCIA MARISOL BIBIANA')
})

test('sin CUIT —la foto trae dos y el modelo no elige— fecha + total alcanzan', () => {
  const c = leido({ cuit: null })
  const r = conciliarConArca(c, ARCA)
  assert.equal(r.via, VIA.FECHA_TOTAL)
  aplicarArca(c, r)
  assert.equal(c.numero, '0004-00003642')
  assert.equal(c.cuit, '23369111574', 'el CUIT del emisor sale del padrón, no de la foto')
})

test('el CAE manda sobre todo lo demás: identifica UNO en todo ARCA', () => {
  const c = leido({ cae: '86316052354343', total: '31.533,90', iva_21: '5.355,02', cuit: null })
  const r = conciliarConArca(c, ARCA)
  assert.equal(r.via, VIA.CAE)
  assert.equal(r.numeroArca, '0006-00003366')
})

test('un CAE que no cierra por importe NO se acepta: sería conciliar contra otra factura', () => {
  const c = leido({ cae: '86316052354343' }) // CAE del de $31.533,90 con el total del de $62.000
  const r = conciliarConArca(c, ARCA)
  assert.notEqual(r.via, VIA.CAE)
})

// ── La contención ────────────────────────────────────────────────────────────

test('DOS filas candidatas no son una coincidencia: no se corrige nada', () => {
  const gemelas = [ARCA[0], { ...ARCA[0], punto_venta: '9', numero: '1', cae: '86316017919999' }]
  const c = leido()
  assert.equal(conciliarConArca(c, gemelas).estado, ESTADO_ARCA.SIN_REGISTRO)
  assert.equal(c.numero, '0004-00036542', 'el número queda como se leyó')
})

test('no estar en ARCA es INFORMACIÓN, no un error, y no toca el comprobante', () => {
  const c = leido({ fecha: '15/03/2026' })
  const r = conciliarConArca(c, ARCA)
  assert.equal(r.estado, ESTADO_ARCA.SIN_REGISTRO)
  const bloque = aplicarArca(c, r)
  assert.equal(bloque.estado, ESTADO_ARCA.SIN_REGISTRO)
  assert.equal(c.numero, '0004-00036542')
})

test('sin padrón que consultar no se afirma nada', () => {
  assert.equal(conciliarConArca(leido(), []).estado, ESTADO_ARCA.SIN_REGISTRO)
})

test('sin neto leído no se puede afirmar que algo no cierre: no se toca ningún importe', () => {
  const c = leido({ total: '62.000,00' }) // sin neto_gravado: la verificación no puede pronunciarse
  assert.equal(importesCierran(c), null)
  aplicarArca(c, conciliarConArca(c, ARCA))
  assert.equal(c.total, 62000)
  assert.equal(c.iva, 10760.33)
})

test('una NOTA DE CRÉDITO concilia igual: ARCA la guarda positiva y el OS la lleva en negativo', () => {
  const c = normalizarLectura({
    emisor: 'Corralon Progreso', cuit: '23369111574', letra: 'A', es_nota_credito: true,
    numero: '0004-00099999', fecha: '30/07/2026', total: '62.000,00', iva_21: '10.760,33',
  }).comprobante
  assert.equal(c.total, -62000)
  const r = conciliarConArca(c, ARCA)
  assert.equal(r.numeroArca, '0004-00003642')
})

// ── El separador de miles que se come la visión ──────────────────────────────

test('un IVA leído como $10,76 en vez de $10.760,33 se corrige con el libro fiscal', () => {
  // Es textual: la visión leyó "10,76" de la foto real. Sin esto, la columna M de Compras habría
  // quedado $10.750 arriba, y M es lo que suma el gasto de la obra.
  const c = leido({ iva_21: '10,76', neto_gravado: '51,24' })
  assert.equal(importesCierran(c), false, 'el síntoma se ve sin ningún modelo: no cierra')
  const bloque = aplicarArca(c, conciliarConArca(c, ARCA))
  assert.equal(c.iva, 10760.33)
  assert.equal(c.neto, 51239.67)
  assert.equal(c.total, 62000)
  assert.equal(bloque.importesCorregidos.iva, 10.76, 'y queda dicho qué se había leído')
})

test('si los importes CIERRAN, ARCA no los toca: manda el papel que el dueño está mirando', () => {
  const c = leido({ neto_gravado: '51.239,67' })
  assert.equal(importesCierran(c), true)
  const bloque = aplicarArca(c, conciliarConArca(c, ARCA))
  assert.equal(bloque.importesCorregidos, undefined)
  assert.equal(c.iva, 10760.33)
})

test('sin fila de ARCA, un importe que no cierra NO se arregla solo: se muestra como está', () => {
  const c = leido({ iva_21: '10,76', neto_gravado: '51,24', fecha: '15/03/2026' })
  aplicarArca(c, conciliarConArca(c, ARCA))
  assert.equal(c.iva, 10.76, 'inventar el importe que "debería" ser es peor que mostrar el mal leído')
})

test('el signo de una nota de crédito sobrevive a la corrección de importes', () => {
  const c = normalizarLectura({
    emisor: 'Corralon Progreso', cuit: '23369111574', letra: 'A', es_nota_credito: true,
    numero: '0004-00003642', fecha: '30/07/2026', total: '62.000,00', iva_21: '10,76', neto_gravado: '51,24',
  }).comprobante
  aplicarArca(c, conciliarConArca(c, ARCA))
  assert.equal(c.total, -62000)
  assert.equal(c.iva, -10760.33)
})
