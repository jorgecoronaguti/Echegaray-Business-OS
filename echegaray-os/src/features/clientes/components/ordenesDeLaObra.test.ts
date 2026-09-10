// EL RÓTULO DE UNA OC EN LA FILA DE LA OBRA: «OC 1984 · 18/06 · $4.336.587».
//
// ═══ QUÉ DEFECTO ATRAPA ═══
//
// El 10/09/2026 a la mañana estos números se retiraron de la pantalla; a las 16:20 el dueño,
// mirando producción: «esta pantalla sigue sin mostrar el nº de OC». Con el total solo, ME - BSA
// muestra «5 OC» y NINGÚN número — y el número es lo que se busca: es lo que el cliente cita en su
// orden de pago y en su factura.
//
// Estos casos impiden las tres formas de mentir de un rótulo así: inventar una fecha que el PDF no
// trae, inventar un número, y publicar el importe a quien no ve precios.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { MAX_OC_EN_FILA, rotuloDeOC } from '../services/papelesCliente.ts'
import type { Orden } from '../services/papelesCliente'

const oc = (p: Partial<Orden> = {}): Orden => ({
  clave: 'oc::2-1984', clase: 'oc', numeroCorto: '1984', numeroCanonico: '2-1984',
  fecha: '2026-06-18', importe: 4_336_586.76, moneda: 'ARS', obraId: 'messina-bsa',
  archivoId: 'a1', driveFileId: null, ids: ['a1'], facturas: [], retenciones: [],
  pagadaPor: [], cita: null, ...p,
})

test('el rótulo identifica la orden: número, día e importe', () => {
  assert.equal(rotuloDeOC(oc(), true), 'OC 1984 · 18/06 · $4.336.587')
  // Sin centavos: la fila tiene el ancho que tiene y los centavos de una orden de siete cifras no
  // cambian ninguna decisión. El importe exacto está en el panel.
  assert.equal(rotuloDeOC(oc({ importe: 78_650_000 }), true), 'OC 1984 · 18/06 · $78.650.000')
  assert.equal(rotuloDeOC(oc({ moneda: 'USD', importe: 63_000 }), true), 'OC 1984 · 18/06 · U$S 63.000')
})

test('sin fecha se OMITE la fecha, y sin número se dice «s/n»', () => {
  // Nunca un guión que parezca un dato: el PDF no la trajo y eso es lo único que se sabe.
  assert.equal(rotuloDeOC(oc({ fecha: null }), true), 'OC 1984 · $4.336.587')
  assert.equal(rotuloDeOC(oc({ numeroCorto: null }), true), 'OC s/n · 18/06 · $4.336.587')
})

test('sin importe NO se escribe un cero: una OC por $ 0 sería falsa sobre un contrato', () => {
  assert.equal(rotuloDeOC(oc({ importe: null }), true), 'OC 1984 · 18/06')
})

test('sin permiso económico va el papel, no el precio', () => {
  // El importe de una OC ES el precio de venta de la obra. El jefe de obra ve QUÉ orden hay.
  assert.equal(rotuloDeOC(oc(), false), 'OC 1984 · 18/06')
})

// ═══ LO QUE EL DUEÑO FIJÓ, Y NO ES NEGOCIABLE POR COMODIDAD ═══

const codigo = () => readFileSync(fileURLToPath(new URL('./OrdenesDeLaObra.tsx', import.meta.url)), 'utf8')

test('«+N» recién a partir de la QUINTA', () => {
  assert.equal(MAX_OC_EN_FILA, 4, 'cuatro entran en la línea; la quinta empieza a empujar')
})

test('tipografía NORMAL: el mono de esta tabla es para lo que se compara de arriba abajo', () => {
  const src = codigo()
  assert.doesNotMatch(src, /font-mono/, 'un rótulo que se lee en línea no se compara con nada')
  assert.doesNotMatch(src, /tabular-nums/)
})

test('cada número abre SU PDF, y el evento se corta para no navegar además a la obra', () => {
  const src = codigo()
  assert.match(src, /hrefDelPapel\(o\)/, 'Drive si está subido, el proxy si todavía no')
  assert.match(src, /preventDefault\(\); e\.stopPropagation\(\)/)
  // `<button>` y no `<a>`: esto vive dentro del `<Link>` de la fila y un ancla adentro de otra es
  // HTML inválido — el navegador desarma el anidado y la fila navega a cualquier lado.
  assert.doesNotMatch(src, /<a\s/)
})

test('NINGUNA orden de pago en esta línea', () => {
  // «OP 5146 · 03/09 · $15.328.174 · OC 2162 · +8» en el mismo renglón fue lo que el dueño no pudo
  // leer. Lo que ordenó pagar se resume en la columna del cliente.
  assert.doesNotMatch(codigo(), /'OP |`OP /)
})
