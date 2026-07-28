// LA PESTAÑA PROVEEDORES LIMPIA SU PROPIO FOOTPRINT — sin borrar nada del dueño.
//
// EL CASO REAL (27/07). La pestaña tenía, en las columnas D–I de sus filas ESTRUCTURALES (los
// TOTALES y los conteos de ARCA), seriales de fecha pintados como moneda ($46.162, $46.164…) y
// rótulos viejos ("Fecha correcta", "Tipo", "Factura A"). Eran fantasmas de una versión más ancha:
// el generador escribía cadena vacía '' en esas celdas y la FUSIÓN las PRESERVA (no borra lo que el
// dueño pudo haber escrito). Al acortarse el layout, el texto viejo sobrevivía.
//
// EL FIX. En SUS filas estructurales conocidas, las columnas que el generador sabe que van vacías se
// marcan con el centinela VACIO (estructural()) en vez de '': así la fusión las BORRA de verdad. Es
// quirúrgico —sólo esas filas, sólo sus '' internos— y no toca ni notas del dueño (que viven en las
// filas de detalle / el bloque de deuda, no en los totales) ni las notas de conciliación legítimas
// del propio generador (la col I de los cruces ARCA, que es no-vacía y por eso se conserva).
import test from 'node:test'
import assert from 'node:assert/strict'
import { estructural } from './proveedores-materiales-pestana.mjs'
import { fusionar, VACIO } from '../lib/preservar-anotaciones.mjs'

test('estructural: convierte los \'\' en VACIO y deja intacto todo lo no-vacío', () => {
  const out = estructural(['TOTAL', '', 0, '=SUM(A1:A2)', '', 'nota'])
  assert.equal(out[0], 'TOTAL', 'un rótulo no se toca')
  assert.equal(out[1], VACIO, 'un vacío pasa a VACIO')
  assert.equal(out[2], 0, 'el cero es contenido, no vacío: no se toca')
  assert.equal(out[3], '=SUM(A1:A2)', 'una fórmula no se toca')
  assert.equal(out[4], VACIO, 'otro vacío pasa a VACIO')
  assert.equal(out[5], 'nota', 'una nota no se toca')
})

test('(a) una fila de TOTAL con basura previa en col D queda VACÍA tras fusionar', () => {
  // La fila "TOTAL SIN CARGAR": su total va en col E (índice 4); D (índice 3) va vacía.
  const generado = estructural(['TOTAL SIN CARGAR', '', '', '', '=SUM($E$1:$E$9)', '', '', '', ''])
  // Lo que había en la pestaña: un serial de fecha pintado como moneda en D y rótulos viejos en F/I.
  const existente = ['TOTAL SIN CARGAR', '', '', 46162, '=SUM($E$1:$E$9)', 'Tipo', 'Factura A', '', 'Fecha correcta']
  const out = fusionar([generado], [existente])[0]
  assert.equal(out[3], '', 'el $46.162 fantasma de la col D se borra')
  assert.equal(out[5], '', 'el rótulo viejo "Tipo" (col F) se borra')
  assert.equal(out[6], '', 'el rótulo viejo "Factura A" (col G) se borra')
  assert.equal(out[8], '', 'el rótulo viejo "Fecha correcta" (col I) se borra')
  assert.equal(out[0], 'TOTAL SIN CARGAR', 'el rótulo del total queda')
  assert.equal(out[4], '=SUM($E$1:$E$9)', 'la fórmula del total queda')
})

test('(b) una nota del dueño en esa zona NO se borra — porque estructural NO se aplica al detalle', () => {
  // Una fila de DETALLE (una nota de crédito) NO pasa por estructural(): el generador deja '' donde no
  // llena, y la fusión conserva lo que el dueño anotó ahí. Es el límite quirúrgico del fix.
  const detalle = ['ALUMETAL S A', '0001-00000005', '10/5', 100, 'Devolución — el costo baja', '', '', '', '']
  const existente = ['ALUMETAL S A', '0001-00000005', '10/5', 90, 'Devolución — el costo baja', '', '', 'ojo: confirmar con Rodrigo', '']
  const out = fusionar([detalle], [existente])[0]
  assert.equal(out[7], 'ojo: confirmar con Rodrigo', 'la nota del dueño en la col H se conserva')
  // Y para dejarlo explícito: si esa MISMA celda hubiera venido de estructural(), el '' sería VACIO y
  // se limpiaría — por eso estructural() se reserva a las filas estructurales, nunca al detalle.
  const comoEstructural = estructural(detalle)
  assert.equal(comoEstructural[7], VACIO)
})

test('(c) la nota de conciliación LEGÍTIMA en col I de los cruces ARCA se conserva', () => {
  // La fila "· cargados en Compras, por N° de comprobante" lleva en col I (índice 8) una nota real del
  // generador. estructural() sólo toca los '': la nota, al ser no-vacía, queda — y D–H se limpian.
  const nota = 'Conciliación del OS al 2026-07-27 — no es una fórmula: el cruce normaliza números.'
  const generado = estructural(['  · cargados en Compras, por N° de comprobante', 5, 1000, '', '', '', '', '', nota])
  assert.equal(generado[8], nota, 'estructural conserva la nota legítima de col I')
  assert.equal(generado[3], VACIO, 'estructural marca la col D como VACIO')
  // Al fusionar sobre un fantasma viejo en col D, la nota de col I sigue puesta y el fantasma se va.
  const existente = ['  · cargados en Compras, por N° de comprobante', 5, 1000, 46213, '', '', '', '', 'nota vieja']
  const out = fusionar([generado], [existente])[0]
  assert.equal(out[8], nota, 'gana la nota nueva del generador, no la vieja')
  assert.equal(out[3], '', 'el $46.213 fantasma de col D se borra')
})
