import test from 'node:test'
import assert from 'node:assert/strict'

import {
  ESLABON, clasificarAdjunto, conciliarCanal, motivoDeDescarte, ningunoAfuera,
} from './auditoria-canal.mjs'

const FOTO = { file_id: 'f1', nombre: 'IMG_1.jpg', media_type: 'image/jpeg', bytes: 2_000_000 }
const COMPRAS = [
  { fila: 812, clave: 'p:rodamientos cuyo|0012-00050057', proveedor: 'Rodamientos Cuyo' },
  { fila: 941, clave: 'c:33708332599|0113-00015009', proveedor: 'Combustibles Barcelo' },
]

// El defecto: un CSV del banco contado como comprobante faltante. El reporte nunca cerraba en
// 196/196 y por eso se dejaba de mirar.
test('el CSV del banco y el zip se descartan con motivo, no se cuentan como faltantes', () => {
  const csv = { file_id: 'c', nombre: 'movimientos.csv', media_type: 'text/csv', bytes: 12_000 }
  assert.match(motivoDeDescarte(csv), /no es un comprobante/)
  assert.equal(clasificarAdjunto(csv).eslabon, ESLABON.DESCARTADO)
  assert.equal(motivoDeDescarte(FOTO), null)
})

test('cada eslabón se reporta donde se corta y no más abajo', () => {
  // Sin respaldo no se puede afirmar «no se leyó»: de un archivo que nunca se bajó no se sabe nada.
  assert.equal(clasificarAdjunto(FOTO, { respaldo: null }).eslabon, ESLABON.SIN_RESPALDO)
  assert.equal(clasificarAdjunto(FOTO, { respaldo: {} }).eslabon, ESLABON.SIN_LECTURA)
  const sinFila = clasificarAdjunto(FOTO, {
    respaldo: {}, lectura: { clave: 'c:30714340677|0015-00015751' }, compras: COMPRAS,
  })
  assert.equal(sinFila.eslabon, ESLABON.SIN_FILA)
  assert.equal(sinFila.clave, 'c:30714340677|0015-00015751')
})

// El defecto: `vincularAdjunto` ya escribió la clave y el auditor la volvía a deducir. Recalcular un
// hecho es la manera de terminar contradiciéndolo.
test('el vínculo ya escrito manda sobre cualquier deducción', () => {
  const r = clasificarAdjunto(FOTO, {
    respaldo: { compra_clave: 'c:33708332599|0113-00015009', fila_compras: 941, vinculado_por: 'match_manual' },
    lectura: { clave: 'c:99999999999|0001-00000001' }, compras: COMPRAS,
  })
  assert.equal(r.eslabon, ESLABON.EN_COMPRAS)
  assert.equal(r.fila, 941)
})

// El defecto medido el 09/09: 16 papeles leídos con visión volvían a salir «sin_lectura» porque su
// lectura quedó en `compra_adjunto.lectura` y el auditor sólo miraba el registro del bot. El reporte
// pedía pagar el modelo otra vez por algo que ya estaba leído.
test('la lectura guardada en compra_adjunto cuenta como lectura', () => {
  const respaldo = { lectura: { cuit: '30561078927', numero: '0012-00050057', proveedor: 'Rodamientos Cuyo' } }
  const r = clasificarAdjunto(FOTO, { respaldo, lectura: null, compras: COMPRAS })
  assert.notEqual(r.eslabon, ESLABON.SIN_LECTURA)
  assert.equal(r.eslabon, ESLABON.EN_COMPRAS)
  assert.equal(r.fila, 812)

  const mudo = clasificarAdjunto(FOTO, { respaldo: { lectura: { proveedor: 'X' } } })
  assert.equal(mudo.eslabon, ESLABON.SIN_LECTURA)
  assert.match(mudo.motivo, /se leyó el papel/)
})

// La conciliación c: ↔ p: es la que rescató 4 papeles el 09/09: el lector arma la clave con CUIT y
// la fila del Sheet vuelve sin CUIT. Exigir la clave idéntica los dejaba afuera para siempre.
test('la fila con clave por proveedor se encuentra igual si el proveedor la confirma', () => {
  const r = clasificarAdjunto(FOTO, {
    respaldo: {}, lectura: { clave: 'c:30561078927|0012-00050057', proveedor: 'Rodamientos Cuyo' },
    compras: COMPRAS,
  })
  assert.equal(r.eslabon, ESLABON.EN_COMPRAS)
  assert.equal(r.fila, 812)
})

test('el resumen cuenta los 196 una sola vez y «ninguno afuera» puede dar rojo', () => {
  const archivos = [
    { ...FOTO, file_id: 'a' },
    { ...FOTO, file_id: 'b' },
    { file_id: 'z', nombre: 'x.zip', media_type: 'application/zip', bytes: 900 },
  ]
  const { resumen, total } = conciliarCanal({
    archivos,
    respaldos: new Map([['a', { compra_clave: 'c:33708332599|0113-00015009', fila_compras: 941 }]]),
    compras: COMPRAS,
  })
  assert.equal(total, 3)
  assert.equal(Object.values(resumen).reduce((s, n) => s + n, 0), 3)
  assert.equal(resumen[ESLABON.EN_COMPRAS], 1)
  assert.equal(resumen[ESLABON.SIN_RESPALDO], 1)
  assert.equal(resumen[ESLABON.DESCARTADO], 1)
  // Rojo con un faltante, verde cuando sólo quedan descartes declarados.
  assert.equal(ningunoAfuera(resumen), false)
  assert.equal(ningunoAfuera({ [ESLABON.EN_COMPRAS]: 194, [ESLABON.DESCARTADO]: 2 }), true)
})
