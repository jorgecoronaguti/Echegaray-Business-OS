import test from 'node:test'
import assert from 'node:assert/strict'
import { numeroDeFactura, numeroDeRecibo, porNumeroDeFactura, porNumeroDeRecibo } from './comprobantes.ts'

// Los números son los REALES de `esquema_pago.factura_numero` y de los títulos de
// `documento_cliente`, leídos el 27/08/2026. No son ejemplos inventados: cada forma rara de acá
// está tipeada así en la base.

// ── EL NÚMERO SE LEE COMO NÚMERO ─────────────────────────────────────────────────────────────

test('punto de venta y número, en las tres formas que usa administración', () => {
  assert.deepEqual(numeroDeFactura('FA 01-00000201'), { puntoDeVenta: 1, numero: 201 })
  // Un dígito menos de relleno. Es el mismo punto de venta y la serie sigue.
  assert.deepEqual(numeroDeFactura('FA 01-0000202'), { puntoDeVenta: 1, numero: 202 })
  assert.deepEqual(numeroDeFactura('FCE 01-000048'), { puntoDeVenta: 1, numero: 48 })
  // Sin punto de venta: se declara ausente, NO se rellena con 1 ni con 0.
  assert.deepEqual(numeroDeFactura('FA 219'), { puntoDeVenta: null, numero: 219 })
  assert.deepEqual(numeroDeFactura('0003-00001234'), { puntoDeVenta: 3, numero: 1234 })
  // El nombre que pone ARCA: CUIT_tipo_puntoDeVenta_numero. Gana la ÚLTIMA pareja — las primeras
  // son el CUIT y el tipo de comprobante, no el número.
  assert.deepEqual(numeroDeFactura('30716304643_001_00001_00000220.pdf'), { puntoDeVenta: 1, numero: 220 })
  // Sin ningún dígito no hay número: `null`, y la pantalla la manda al final en vez de inventarle
  // una posición en la serie.
  assert.equal(numeroDeFactura('FA ANTICIPO FINANCIERO.pdf'), null)
  assert.equal(numeroDeFactura(null), null)
})

test('EL DEFECTO: ordenar el texto pone la 228 antes que la 202', () => {
  // Éste es el orden alfabético, y es el que se veía: al noveno carácter compara `0` contra `2`.
  assert.ok('FA 01-00000228' < 'FA 01-0000202')
  // Y éste es el orden de serie, que es el que el cliente busca.
  const facturas = ['FA 01-0000202', 'FA 01-00000228', 'FA 01-00000201', 'FA 219', 'FCE 01-000048', 'FCE 53']
    .map((facturaNumero) => ({ facturaNumero }))
  assert.deepEqual(
    [...facturas].sort(porNumeroDeFactura).map((f) => f.facturaNumero),
    ['FCE 01-000048', 'FCE 53', 'FA 01-00000201', 'FA 01-0000202', 'FA 219', 'FA 01-00000228'],
  )
})

test('EL DEFECTO REAL DE INTER MOTOR: 201, 228, 211 salía en ese orden', () => {
  // La pantalla las dibujaba en el orden del cronograma —por `orden` de la línea y después por
  // fecha—, que no tiene nada que ver con la numeración: FA 201 (San Francisco, orden 1),
  // FA 228 (Instalación Eléctrica, orden 1) y FA 211 (San Francisco, orden 2).
  const comoSalian = [{ facturaNumero: 'FA 01-00000201' }, { facturaNumero: 'FA 01-00000228' }, { facturaNumero: 'FA 01-00000211' }]
  assert.deepEqual(
    [...comoSalian].sort(porNumeroDeFactura).map((f) => f.facturaNumero),
    ['FA 01-00000201', 'FA 01-00000211', 'FA 01-00000228'],
  )
})

test('el punto de venta desempata, pero no encabeza', () => {
  // Si el punto de venta fuera la clave primaria, `FA 219` —que no lo declara— saltaría al
  // principio, lejos de la 218 y la 220 con las que forma serie.
  const mezcla = [{ facturaNumero: 'FA 01-00000220' }, { facturaNumero: 'FA 219' }, { facturaNumero: 'FA 01-00000218' }]
  assert.deepEqual(
    [...mezcla].sort(porNumeroDeFactura).map((f) => f.facturaNumero),
    ['FA 01-00000218', 'FA 219', 'FA 01-00000220'],
  )
  // Dos puntos de venta con el mismo número sí se ordenan por punto de venta.
  const empate = [{ facturaNumero: '0005-00000100' }, { facturaNumero: '0002-00000100' }]
  assert.deepEqual(
    [...empate].sort(porNumeroDeFactura).map((f) => f.facturaNumero),
    ['0002-00000100', '0005-00000100'],
  )
})

test('una factura sin número va al FINAL, nunca al principio', () => {
  const con = [{ facturaNumero: 'FA ANTICIPO FINANCIERO.pdf' }, { facturaNumero: 'FA 01-00000201' }]
  assert.deepEqual(
    [...con].sort(porNumeroDeFactura).map((f) => f.facturaNumero),
    ['FA 01-00000201', 'FA ANTICIPO FINANCIERO.pdf'],
  )
})

// ── LOS RECIBOS: EL NÚMERO QUE ES UNA FECHA ──────────────────────────────────────────────────

test('«RECIBO 22:9.pdf» NO es el recibo 22 — es el del 22/9', () => {
  assert.equal(numeroDeRecibo('Recibo 12.pdf'), 12)
  assert.equal(numeroDeRecibo('RECIBO 10 - 30:6:26.pdf'), 10)
  assert.equal(numeroDeRecibo('Recibo 17. r.pdf'), 17)
  assert.equal(numeroDeRecibo('RECIBO 5 - 11:3:26.pdf'), 5)
  // Los cuatro de Alimentos del Sur cuyo nombre es una fecha. Leerlos como número de recibo
  // pondría el 27 (que es 27/10) después del 11 y el cliente buscaría un recibo 27 que no existe.
  assert.equal(numeroDeRecibo('RECIBO 22:9.pdf'), null)
  assert.equal(numeroDeRecibo('RECIBO 15:9.pdf'), null)
  assert.equal(numeroDeRecibo('RECIBO 27:10.pdf'), null)
  assert.equal(numeroDeRecibo('RECIBO 19:1:26.pdf'), null)
})

test('los recibos numerados en serie, y los que sólo tienen fecha detrás y en orden', () => {
  // La lista real de Alimentos del Sur, tal como llega ordenada por fecha descendente.
  const recibos = [
    { titulo: 'RECIBO 11 - 31:7:26.pdf', fecha: '2026-08-03' },
    { titulo: 'RECIBO 10 - 30:6:26.pdf', fecha: '2026-06-30' },
    { titulo: 'RECIBO 9 - 13:6:26.pdf', fecha: '2026-06-13' },
    { titulo: 'RECIBO 19:1:26.pdf', fecha: '2026-01-19' },
    { titulo: 'RECIBO 27:10.pdf', fecha: '2025-10-27' },
    { titulo: 'RECIBO 22:9.pdf', fecha: '2025-09-22' },
    { titulo: 'RECIBO 15:9.pdf', fecha: '2025-09-15' },
  ]
  assert.deepEqual([...recibos].sort(porNumeroDeRecibo).map((r) => r.titulo), [
    'RECIBO 9 - 13:6:26.pdf', 'RECIBO 10 - 30:6:26.pdf', 'RECIBO 11 - 31:7:26.pdf',
    'RECIBO 15:9.pdf', 'RECIBO 22:9.pdf', 'RECIBO 27:10.pdf', 'RECIBO 19:1:26.pdf',
  ])
})

test('EL DEFECTO: por texto, el recibo 2 cae después del 17', () => {
  // Los trece de Inter Motor se llaman `Recibo N.pdf` y ordenados como texto dan 10, 11, 12… 17, 2,
  // 3, 8, 9 — la lista de un cliente que pagó trece veces, contada al revés y en desorden.
  const titulos = ['Recibo 2.pdf', 'Recibo 3.pdf', 'Recibo 8.pdf', 'Recibo 9.pdf', 'Recibo 10.pdf', 'Recibo 17. r.pdf']
  const porTexto = [...titulos].sort((a, b) => a.localeCompare(b, 'es'))
  assert.equal(porTexto[0], 'Recibo 10.pdf')
  const recibos = titulos.map((titulo) => ({ titulo, fecha: null }))
  assert.deepEqual([...recibos].sort(porNumeroDeRecibo).map((r) => r.titulo), titulos)
})

test('un recibo sin número y sin fecha no se cuela adelante', () => {
  const lista = [
    { titulo: 'comprobante.pdf', fecha: null },
    { titulo: 'RECIBO 22:9.pdf', fecha: '2025-09-22' },
    { titulo: 'Recibo 3.pdf', fecha: '2025-09-30' },
  ]
  assert.deepEqual([...lista].sort(porNumeroDeRecibo).map((r) => r.titulo),
    ['Recibo 3.pdf', 'RECIBO 22:9.pdf', 'comprobante.pdf'])
})
