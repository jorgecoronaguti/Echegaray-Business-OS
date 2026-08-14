// EL COMPROBANTE QUE QUEDÓ AFUERA SE NOMBRA POR LO QUE DICE, NO POR EL ARCHIVO.
//
// El defecto que prueban estos tests es el del 14/08, en las palabras del dueño: «no se q comprobante
// quedo afuera porque no estoy revisando todo el tiempo, son muchos». El mensaje decía
// `⚠ 1 no entró: IMG_7574.HEIC` y con eso no hay forma de saber cuál es sin abrir el canal.

import test from 'node:test'
import assert from 'node:assert/strict'
import { identificar, renglonDeAdjunto, plataCorta, fechaCorta } from './identidad.mjs'

test('el comprobante se nombra con proveedor, importe, fecha y número', () => {
  const id = identificar({
    comprobante: {
      proveedor: 'Combustibles Barcelo', total: 100000.08, fecha: '10/08/2026', numero: '0103-00003797',
    },
  })
  assert.equal(id.texto, 'Combustibles Barcelo $100.000 del 10/08 0103-00003797')
  assert.equal(id.hayDatos, true)
  assert.equal(id.hayPlata, true)
})

test('SIN PROVEEDOR igual se reconoce: el importe y la fecha alcanzan', () => {
  // Es el caso real de IMG_7574: se leyó todo menos quién es el proveedor.
  const id = identificar({ comprobante: { proveedor: null, total: 172002.26, fecha: '09/08/2026' } })
  assert.equal(id.texto, '$172.002 del 09/08')
  assert.equal(id.hayDatos, true)
})

test('sin NADA leído no se finge una identificación', () => {
  const id = identificar({ comprobante: {} })
  assert.equal(id.texto, null)
  assert.equal(id.hayDatos, false)
  assert.equal(id.hayPlata, false)
})

test('EL RENGLÓN: primero qué comprobante es, el motivo, y el archivo al final entre paréntesis', () => {
  const r = renglonDeAdjunto({
    item: { comprobante: { total: 172002.26, fecha: '09/08/2026' } },
    nombre: 'IMG_7574.HEIC',
    motivo: 'no pude leer el proveedor',
  })
  assert.equal(r, '· $172.002 del 09/08 — no pude leer el proveedor (`IMG_7574.HEIC`)')
  // Lo que NO puede volver a pasar: que el archivo sea la identificación.
  assert.ok(!r.startsWith('· `IMG_7574.HEIC`'))
})

test('CUANDO NO SE LEYÓ NADA se dice así, porque la acción del dueño es otra', () => {
  // Con «$47.320 del 11/08» él sabe cuál es y lo resuelve desde el celular; con esto sabe que tiene
  // que volver a sacar la foto. Son dos acciones distintas y tienen que ser dos frases distintas.
  const r = renglonDeAdjunto({ nombre: 'IMG_7574.HEIC', motivo: 'no pude leerlo', sinLectura: true })
  assert.equal(r, '· no pude leer ni el importe (`IMG_7574.HEIC`)')
})

test('el nombre que el desplegable no tiene sigue sirviendo para reconocerlo', () => {
  // La celda E queda vacía a propósito, pero el membrete es lo que el dueño lee.
  const id = identificar({ comprobante: { proveedor: null, proveedorLeido: 'CLAVERO ROGELIO E HIJOS', total: 172002.26 } })
  assert.match(id.texto, /^CLAVERO ROGELIO E HIJOS \$172\.002$/)
})

test('los formatos son los que el dueño lee: pesos redondos es-AR y fecha sin año', () => {
  assert.equal(plataCorta(2205400.34), '$2.205.400')
  assert.equal(plataCorta(-1095076.13), '−$1.095.076', 'una nota de crédito se ve negativa')
  assert.equal(plataCorta(null), null)
  assert.equal(plataCorta('no es un número'), null)
  assert.equal(fechaCorta('09/08/2026'), '09/08')
  assert.equal(fechaCorta('2026-08-09'), null, 'sólo el formato en el que viaja la fecha del comprobante')
})
