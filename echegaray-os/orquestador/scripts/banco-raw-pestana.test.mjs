import test from 'node:test'
import assert from 'node:assert/strict'
import { fila, bloqueDeclarado, COLUMNAS, COL, FILA0, DECL, RANGO_SALDO, RANGO_SALDO_FECHA } from './banco-raw-pestana.mjs'
import { VACIO } from '../lib/preservar-anotaciones.mjs'

test('un saldo que falta va con el centinela, nunca en cero', () => {
  // Un 0 en la columna de saldos hacía que la disponibilidad de CAJA —que toma la última celda no
  // vacía— mostrara cero pesos en el banco.
  const f = fila({ fecha: '2026-07-23', concepto: 'Compra con tarjeta de debito', importe: -168730.09, saldo: null })
  assert.equal(f[3], VACIO)
  assert.equal(f[4], 'sale')
})

// ═══ EL SALDO DECLARADO TIENE DÓNDE VIVIR (23/07) ═══
//
// El detalle del extracto termina en el último saldo CONFIRMADO —los movimientos del día llegan sin
// saldo corrido— así que sin este bloque CAJA mostraba la plata de ayer: $4.982.191,63 contra los
// $4.813.461,54 que declaraba el banco.
test('el bloque del saldo declarado escribe fecha, saldo y origen', () => {
  const b = bloqueDeclarado({ fecha: '2026-07-23', saldo: 4813461.54, origen: 'extracto del 23/07' })
  assert.deepEqual(b.map(([r]) => r), ['SALDO DECLARADO', 'Fecha', 'Saldo', 'Origen'])
  assert.equal(b[1][1], '2026-07-23')
  assert.equal(b[2][1], 4813461.54)
  assert.equal(b[3][1], 'extracto del 23/07')
})

test('sin saldo declarado el bloque se LIMPIA, no deja el de anteayer', () => {
  // Con cadena vacía la fusión preserva lo que hubiera de antes: el saldo viejo seguiría publicado
  // bajo el nombre SALDO_BANCO_DECLARADO y CAJA lo mostraría como si fuera de hoy.
  const b = bloqueDeclarado(null)
  for (const [, v] of b.slice(1)) assert.equal(v, VACIO)
})

test('el bloque no invade las columnas de las que cuelgan las fórmulas', () => {
  // De la A a la F cuelgan por rango abierto CAJA, Impuestos y Cheques. Un rótulo metido ahí se
  // sumaría como si fuera un movimiento.
  assert.ok(DECL.iCol >= COLUMNAS.length, `el bloque arranca en la columna ${DECL.col}, dentro de la tabla`)
  assert.equal(COL.saldo, 'D')
  assert.equal(FILA0, 4)
})

test('los rangos con nombre son el contrato con CAJA', () => {
  // CAJA no cita _BANCO_RAW!$I$3: cita el nombre. Si estos cambian, hay que cambiarlos de los dos
  // lados a la vez — el test existe para que no se cambie uno solo.
  assert.equal(RANGO_SALDO, 'SALDO_BANCO_DECLARADO')
  assert.equal(RANGO_SALDO_FECHA, 'SALDO_BANCO_FECHA')
})
