// LA LECTURA DE `_MOVIMIENTOS` QUE ALIMENTA LA TABLA DE EVIDENCIA.
//
// El criterio del cruce ya está probado en `libro-cruce-banco.test.mjs`. Lo que se prueba acá es la
// otra mitad, que es donde una tabla de evidencia se vuelve peligrosa: **leer del archivo las filas
// equivocadas**. Una tabla que dice "revisé toda la deuda" y en realidad leyó 20 de 25 filas es peor
// que no tener tabla, porque nadie vuelve a mirar.

import test from 'node:test'
import assert from 'node:assert/strict'

import { deudaPublicada, finDelMes, serialDe } from '../scripts/deuda-evidencia-pago.mjs'

/** El encabezado real de `_MOVIMIENTOS` y una fila por caso, en el orden que escribe el generador. */
const ENC = ['Fecha', 'Signo', 'Importe', 'Moneda', 'Concepto', 'Rubro', 'Actividad', 'Estado',
  'Instrumento', 'Contraparte', 'CUIT', 'Comprobante', 'Obra', 'Pestaña', 'Fila', 'Clave', 'Cliente']

const fila = ({ fecha, signo = -1, importe, estado, rubro = 'Materiales Civil', concepto = 'x', pestana = 'Compras' }) => [
  fecha, signo, importe, 'ARS', concepto, rubro, 'operativa', estado, 'transferencia', 'p', '', '', '', pestana, 1, 'k', '',
]

const HASTA = 46265 // 31/08/2026

test('toma COMPROMETIDO y VENCIDO, y nada más: son los dos estados que la tarjeta suma', () => {
  const filas = [ENC,
    fila({ fecha: 46244, importe: 100, estado: 'VENCIDO' }),
    fila({ fecha: 46244, importe: 200, estado: 'COMPROMETIDO' }),
    fila({ fecha: 46244, importe: 400, estado: 'REAL' }),
    fila({ fecha: 46244, importe: 800, estado: 'PROYECTADO' }),
  ]
  assert.deepEqual(deudaPublicada(filas, HASTA).map((m) => m.importe), [100, 200])
})

test('un INGRESO no es deuda aunque esté comprometido: los valores en cartera entran, no salen', () => {
  const filas = [ENC,
    fila({ fecha: 46244, signo: 1, importe: 5000, estado: 'COMPROMETIDO', rubro: 'Valores en cartera' }),
    fila({ fecha: 46244, importe: 100, estado: 'COMPROMETIDO' }),
  ]
  assert.deepEqual(deudaPublicada(filas, HASTA).map((m) => m.importe), [100])
})

test('lo que vence DESPUÉS del corte no es "del mes"', () => {
  const filas = [ENC,
    fila({ fecha: 46265, importe: 100, estado: 'COMPROMETIDO' }),
    fila({ fecha: 46266, importe: 200, estado: 'COMPROMETIDO' }),
  ]
  assert.deepEqual(deudaPublicada(filas, HASTA).map((m) => m.importe), [100], 'el 31/08 entra, el 1°/09 no')
})

test('una fila sin fecha o sin importe no se cuenta como deuda de cero: se saltea', () => {
  const filas = [ENC,
    fila({ fecha: null, importe: 100, estado: 'VENCIDO' }),
    fila({ fecha: 46244, importe: null, estado: 'VENCIDO' }),
    fila({ fecha: 46244, importe: 300, estado: 'VENCIDO' }),
  ]
  assert.deepEqual(deudaPublicada(filas, HASTA).map((m) => m.importe), [300])
})

test('salen ordenadas por vencimiento: la tabla se lee como la escalera de CAJA', () => {
  const filas = [ENC,
    fila({ fecha: 46251, importe: 3, estado: 'VENCIDO' }),
    fila({ fecha: 46200, importe: 1, estado: 'VENCIDO' }),
    fila({ fecha: 46244, importe: 2, estado: 'VENCIDO' }),
  ]
  assert.deepEqual(deudaPublicada(filas, HASTA).map((m) => m.importe), [1, 2, 3])
})

test('el encabezado NUNCA entra como movimiento', () => {
  assert.deepEqual(deudaPublicada([ENC], HASTA), [])
  assert.deepEqual(deudaPublicada([], HASTA), [])
})

test('la fila que se informa es la del ARCHIVO: el dueño la tiene que poder abrir', () => {
  const filas = [ENC, fila({ fecha: 46244, importe: 100, estado: 'VENCIDO' })]
  assert.equal(deudaPublicada(filas, HASTA)[0].filaSheet, 2, 'índice 1 del array = fila 2 del Sheet')
})

test('el corte "y del mes" se DERIVA: es el último día del mes, no un serial tipeado', () => {
  assert.equal(finDelMes(new Date(Date.UTC(2026, 7, 17))), serialDe('2026-08-31'))
  // Febrero de un bisiesto es el caso que rompe cualquier +30 escrito a mano.
  assert.equal(finDelMes(new Date(Date.UTC(2028, 1, 3))), serialDe('2028-02-29'))
  // Y diciembre tiene que cruzar el año en vez de dar un mes 13.
  assert.equal(finDelMes(new Date(Date.UTC(2026, 11, 9))), serialDe('2026-12-31'))
})

test('el serial de Sheets tiene la época correcta: el 1°/01/2026 es 46023', () => {
  // Un día de corrimiento mueve una obligación de mes en el Cash Flow Mensual sin dar un error.
  assert.equal(serialDe('2026-01-01'), 46023)
  assert.equal(serialDe('2026-08-31') - serialDe('2026-08-01'), 30)
})
