// Los defectos que este matcheo existe para impedir. Cada uno tiene su factura pagada.
import test from 'node:test'
import assert from 'node:assert/strict'
import { MOTIVO, importeCoincide, registroPorArchivo, vincularLectura } from './vinculo.mjs'

/** Filas de `compra_sheet` como las devuelve la base. */
const COMPRAS = [
  { fila: 810, clave: 'c:33708332599|0121-00020719', comprobante: '0121-00020719', total: 60000.02 },
  { fila: 815, clave: 'c:30681641730|NC|0005-00000386', comprobante: '0005-00000386', total: -686070 },
  { fila: 816, clave: 'c:30681641730|0005-00000386', comprobante: '0005-00000386', total: 686070 },
  { fila: 814, clave: 'p:corralon progreso|0004-00003654', comprobante: '0004-00003654', total: 6234 },
  { fila: 900, clave: null, comprobante: null, total: 5200000 },
]

test('un comprobante que el bot cargó encuentra su fila por identidad', () => {
  const r = vincularLectura(
    { cuit: '33-70833259-9', tipo: 'F A', numero: '0121-00020719', total: 60000.02 }, COMPRAS)
  assert.equal(r.vinculado_por, 'match_numero')
  assert.equal(r.fila, 810)
  assert.equal(r.confianza, 0.95)
})

test('LA NOTA DE CRÉDITO NO SE CUELGA DE LA FACTURA QUE ANULA — costó $41,9M', () => {
  // Mismo CUIT, mismo número, mismo importe en valor absoluto. Lo único que las distingue es que una
  // es nota de crédito. Sin la marca en la clave, las dos serían la misma.
  const nota = vincularLectura(
    { cuit: '30-68164173-0', tipo: 'NC', numero: '0005-00000386', total: 686070 }, COMPRAS)
  const factura = vincularLectura(
    { cuit: '30-68164173-0', tipo: 'F A', numero: '0005-00000386', total: 686070 }, COMPRAS)
  assert.equal(nota.fila, 815)
  assert.equal(factura.fila, 816)
})

test('la pestaña guarda la nota en NEGATIVO y el papel dice positivo: igual coincide', () => {
  // La fila 815 tiene total -686070. Comparar con signo dejaría a TODAS las notas de crédito sin
  // respaldo. El signo ya lo decide la clave, no el importe.
  assert.equal(importeCoincide(-686070, 686070), true)
  const r = vincularLectura(
    { cuit: '30-68164173-0', tipo: 'NC', numero: '0005-00000386', total: 686070 }, COMPRAS)
  assert.equal(r.confianza, 0.95)
})

test('los ceros de relleno del punto de venta no impiden el match', () => {
  // El OCR devuelve `00121-00020719` (5 dígitos impresos) y la fila dice `0121-00020719`.
  const r = vincularLectura(
    { cuit: '33-70833259-9', tipo: 'F A', numero: '00121-00020719', total: 60000.02 }, COMPRAS)
  assert.equal(r.fila, 810)
})

test('DOS PROVEEDORES CON EL MISMO NÚMERO no se confunden', () => {
  const compras = [
    { fila: 10, clave: 'c:30111111117|0001-00000100', comprobante: '0001-00000100', total: 50000 },
    { fila: 20, clave: 'c:30222222225|0001-00000100', comprobante: '0001-00000100', total: 50000 },
  ]
  const r = vincularLectura(
    { cuit: '30-22222222-5', tipo: 'F A', numero: '0001-00000100', total: 50000 }, compras)
  assert.equal(r.fila, 20)
})

test('sin CUIT y con dos filas del mismo número, NO se elige: se declara ambiguo', () => {
  // Emparejar sólo por número ya produjo un reporte de $71.191.410 faltantes que era falso.
  const compras = [
    { fila: 10, clave: 'c:30111111117|0001-00000100', comprobante: '0001-00000100', total: 50000 },
    { fila: 20, clave: 'c:30222222225|0001-00000100', comprobante: '0001-00000100', total: 50000 },
  ]
  const r = vincularLectura({ numero: '0001-00000100', total: 50000 }, compras)
  assert.equal(r.vinculado_por, 'sin_vincular')
  assert.equal(r.motivo, MOTIVO.AMBIGUO)
  assert.deepEqual(r.candidatas, [10, 20])
})

test('la misma factura cargada DOS VECES en la pestaña no se resuelve a cara o cruz', () => {
  const compras = [
    { fila: 10, clave: 'c:30111111117|0001-00000100', comprobante: '0001-00000100', total: 50000 },
    { fila: 77, clave: 'c:30111111117|0001-00000100', comprobante: '0001-00000100', total: 50000 },
  ]
  const r = vincularLectura(
    { cuit: '30-11111111-7', tipo: 'F A', numero: '0001-00000100', total: 50000 }, compras)
  assert.equal(r.vinculado_por, 'sin_vincular')
  assert.equal(r.motivo, MOTIVO.AMBIGUO)
})

test('un papel sin número no se vincula a nada', () => {
  const r = vincularLectura({ cuit: '33-70833259-9', total: 60000.02 }, COMPRAS)
  assert.equal(r.vinculado_por, 'sin_vincular')
  assert.equal(r.motivo, MOTIVO.SIN_NUMERO)
})

test('un número que no está en la pestaña se declara faltante, no se cuelga del parecido', () => {
  const r = vincularLectura(
    { cuit: '33-70833259-9', tipo: 'F A', numero: '0121-99999999', total: 60000.02 }, COMPRAS)
  assert.equal(r.vinculado_por, 'sin_vincular')
  assert.equal(r.motivo, MOTIVO.SIN_FILA)
})

test('el punto decimal del tique no arrastra el importe: ±1 %, no ×100', () => {
  // El tique de Trielec imprime `95277.07`. Un importe cien veces mayor NO puede confirmar nada.
  assert.equal(importeCoincide(95277.07, 9527707), false)
  assert.equal(importeCoincide(95277.07, 95277.07), true)
  // Un redondeo de IVA sí entra.
  assert.equal(importeCoincide(60000.02, 60000), true)
  // Otra factura del mismo proveedor, no.
  assert.equal(importeCoincide(60000, 75000), false)
})

test('un importe en cero nunca confirma nada', () => {
  assert.equal(importeCoincide(0, 0), false)
  assert.equal(importeCoincide(0, 5000), false)
})

test('sin CUIT se cae al número + importe, y se afirma MENOS', () => {
  const r = vincularLectura(
    { proveedor: 'Otro Corralon', numero: '0004-00003654', total: 6234 }, COMPRAS)
  assert.equal(r.vinculado_por, 'match_numero')
  assert.equal(r.fila, 814)
  assert.ok(r.confianza < 0.95, 'sin CUIT la confianza no puede ser la misma que con CUIT')
})

test('identidad buena con importe distinto: vincula, pero lo dice', () => {
  const r = vincularLectura(
    { cuit: '33-70833259-9', tipo: 'F A', numero: '0121-00020719', total: 99999 }, COMPRAS)
  assert.equal(r.vinculado_por, 'match_numero')
  assert.equal(r.confianza, 0.6)
  assert.equal(r.aviso, MOTIVO.IMPORTE)
})

// ── EL REGISTRO ─────────────────────────────────────────────────────────────────────────────────

test('el registro del bot es un HECHO: fileId → clave, sin leer el papel', () => {
  const m = registroPorArchivo([
    { file_id: 'f1', clave: 'c:33708332599|0121-00020719', estado: 'cargado' },
    { file_id: 'f2', clave: 'p:google|0056-40188724', estado: 'cargado' },
  ])
  assert.equal(m.size, 2)
  assert.equal(m.get('f1').clave, 'c:33708332599|0121-00020719')
})

test('UN FAJO DESCARTADO NO VINCULA: esa foto no terminó en ninguna fila', () => {
  const m = registroPorArchivo([
    { file_id: 'f1', clave: 'c:33708332599|0121-00020719', estado: 'descartado' },
  ])
  assert.equal(m.size, 0)
})

test('el mismo archivo descartado y después cargado vincula por el cargado', () => {
  const m = registroPorArchivo([
    { file_id: 'f1', clave: 'c:1|0001-00000001', estado: 'descartado' },
    { file_id: 'f1', clave: 'c:33708332599|0121-00020719', estado: 'cargado' },
  ])
  assert.equal(m.get('f1').clave, 'c:33708332599|0121-00020719')
})

test('un item sin fileId o sin clave no entra al registro', () => {
  const m = registroPorArchivo([
    { file_id: null, clave: 'c:1|0001-00000001', estado: 'cargado' },
    { file_id: 'f9', clave: null, estado: 'cargado' },
  ])
  assert.equal(m.size, 0)
})

// ── EL REGISTRO → LA FILA DE HOY ────────────────────────────────────────────────────────────────

import { vincularPorRegistro } from './vinculo.mjs'

const ESPEJO = [
  { fila: 810, clave: 'c:33708332599|0121-00020719', comprobante: '0121-00020719' },
  { fila: 814, clave: 'p:corralon progreso|0004-00003654', comprobante: '0004-00003654' },
  { fila: 815, clave: 'c:30681641730|NC|0005-00000386', comprobante: '0005-00000386' },
]

test('la fila que guardó el registro se USA cuando sigue teniendo el mismo comprobante', () => {
  const r = vincularPorRegistro(
    { clave: 'c:33708332599|0121-00020719', fila: 810, numero: '0121-00020719' }, ESPEJO)
  assert.equal(r.vinculado_por, 'registro')
  assert.equal(r.fila, 810)
  assert.equal(r.confianza, 1)
})

test('SI LA FILA SE CORRIÓ, NO SE USA — un adjunto en la factura equivocada se ve como respaldo', () => {
  // El dueño insertó una fila arriba: el renglón 810 ahora tiene otro comprobante.
  const corrido = [{ fila: 810, clave: 'c:1|0009-00000009', comprobante: '0009-00000009' }]
  const r = vincularPorRegistro(
    { clave: 'c:33708332599|0121-00020719', fila: 810, numero: '0121-00020719' }, corrido)
  assert.equal(r.vinculado_por, 'sin_vincular')
  assert.equal(r.motivo, MOTIVO.SIN_FILA)
})

test('la fila se cae pero la clave está: se vincula igual, por la clave', () => {
  const r = vincularPorRegistro(
    { clave: 'c:33708332599|0121-00020719', fila: 9999, numero: '0121-00020719' }, ESPEJO)
  assert.equal(r.vinculado_por, 'registro')
  assert.equal(r.fila, 810)
})

test('el registro guarda el punto de venta VIEJO y la pestaña el nuevo: la fila lo resuelve', () => {
  // `clavesEquivalentes` traduce de la forma nueva a la vieja, no al revés. Sin el respaldo por fila
  // estos quedaban sin vincular: 33 de 70 al 25/08.
  const r = vincularPorRegistro(
    { clave: 'c:33708332599|00121-00020719', fila: 810, numero: '00121-00020719' }, ESPEJO)
  assert.equal(r.vinculado_por, 'registro')
  assert.equal(r.fila, 810)
})

test('la pestaña no tiene CUIT y el registro sí: la fila los une', () => {
  // La fila 814 se identifica `p:corralon progreso|…` porque la columna CUIT está vacía (385 de 882
  // lo están); el registro leyó el CUIT del papel y dice `c:…`. Es la misma compra.
  const r = vincularPorRegistro(
    { clave: 'c:30691111574|0004-00003654', fila: 814, numero: '0004-00003654' }, ESPEJO)
  assert.equal(r.vinculado_por, 'registro')
  assert.equal(r.fila, 814)
  assert.equal(r.clave, 'p:corralon progreso|0004-00003654')
})

test('sin fila y sin clave conocida, no se inventa un vínculo', () => {
  const r = vincularPorRegistro(
    { clave: 'c:99999999999|0001-00000001', fila: null, numero: '0001-00000001' }, ESPEJO)
  assert.equal(r.vinculado_por, 'sin_vincular')
})
