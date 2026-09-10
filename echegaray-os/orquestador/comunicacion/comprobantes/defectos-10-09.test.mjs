// LOS DEFECTOS DEL 10/09/2026 — reclamo textual del dueño: «está leyendo mal los comprobantes y por
// ende carga mal tanto en el Sheet Flujo de Fondos como en la sección Compras de app.ecsas.com.ar».
//
// El primero (la letra que viajaba con la clave equivocada) vive en `lib/comprobantes/`. Éste es el
// segundo, y es del ARMADO de la fila: **un comprobante sin nombre de proveedor pero CON CUIT válido
// no consultaba el padrón**. `armarItem` entraba al matcheo sólo `if (comprobante.proveedor)`, así
// que un papel cuya razón social no se pudo leer dejaba la columna E vacía aunque el CUIT estuviera
// impreso, fuera válido y el desplegable tuviera a ese proveedor con ese mismo CUIT.
//
// El CUIT es la identidad del proveedor en este OS (`matchProveedor` lo mira PRIMERO, antes que el
// nombre, justamente porque «DUBOS UGARTE PEDRO LUIS RAUL» es DUPEC). Tenerlo y no usarlo porque el
// membrete salió borroso es tirar la evidencia más fuerte del papel.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { armarItem } from '../../lib/comprobantes/item.mjs'

/** Los desplegables ESTRICTOS de Compras, como los arma `circuito.mjs`. */
const LISTAS = {
  ok: true,
  proveedores: ['DUPEC', 'Corralon Progreso', 'Combustibles Barcelo'],
  obras: [], unidades: [], categorias: ['B', 'N'], detalles: {}, detallesFirmes: {},
  // CUIT → nombre EXACTO del desplegable (sale de la pestaña Proveedores).
  porCuit: new Map([['20287737824', 'DUPEC']]),
  // CUIT → los otros nombres que ese CUIT tiene en el padrón y en ARCA.
  nombresPorCuit: new Map([['23369111574', ['PEREZ GARCIA MARISOL BIBIANA', 'Corralon Progreso']]]),
}

/** La lectura de un PDF de factura electrónica al que no se le pudo leer la razón social. */
const sinNombre = (cuit) => ({
  legible: true, emisor: null, cuit, letra: 'A', numero: '0011-00002105',
  fecha: '08/09/2026', neto_gravado: 68181.82, iva_21: 14318.18, total: 82500,
  es_nota_credito: false, es_nota_debito: false, es_presupuesto_o_remito: false,
})

test('sin nombre pero con CUIT del desplegable, el proveedor se resuelve por CUIT', () => {
  const it = armarItem({ lectura: sinNombre('20287737824'), adjunto: { nombre: 'f.pdf' }, listas: LISTAS })
  assert.equal(it.comprobante.proveedor, 'DUPEC',
    'el CUIT identifica al proveedor: dejar E vacía teniéndolo es tirar la evidencia más fuerte del papel')
  assert.equal(it.proveedorNuevo, false)
})

test('sin nombre y con CUIT que sólo conoce el padrón, se prueban esos nombres contra el desplegable', () => {
  const it = armarItem({ lectura: sinNombre('23369111574'), adjunto: { nombre: 'f.pdf' }, listas: LISTAS })
  assert.equal(it.comprobante.proveedor, 'Corralon Progreso')
  assert.equal(it.proveedorNuevo, false)
})

test('sin nombre y con un CUIT que nadie conoce, la celda queda VACÍA — no se elige el más parecido', () => {
  const it = armarItem({ lectura: sinNombre('30500008454'), adjunto: { nombre: 'f.pdf' }, listas: LISTAS })
  assert.equal(it.comprobante.proveedor ?? null, null)
  assert.equal(it.proveedorNuevo, false, 'no hay nombre que dar de alta: inventar uno sería peor que la celda vacía')
  assert.ok(it.faltantes.includes('proveedor'), 'y se sigue declarando que falta')
})

test('un CUIT que no pasa el dígito verificador no resuelve nada', () => {
  // `normalizar_lectura` descarta el CUIT que no cierra por módulo 11: con un dígito mal leído la
  // clave sería otra y el duplicado no se vería. Sin CUIT válido no hay a quién preguntarle.
  const it = armarItem({ lectura: sinNombre('20287737825'), adjunto: { nombre: 'f.pdf' }, listas: LISTAS })
  assert.equal(it.comprobante.cuit, null)
  assert.equal(it.comprobante.proveedor ?? null, null)
})

test('con nombre legible nada cambia: sigue mandando el desplegable', () => {
  const it = armarItem({
    lectura: { ...sinNombre('23369111574'), emisor: 'PEREZ GARCIA MARISOL BIBIANA' },
    adjunto: { nombre: 'f.pdf' }, listas: LISTAS,
  })
  assert.equal(it.comprobante.proveedor, 'Corralon Progreso')
})

test('la categoría de una factura con letra y número es B, nunca N', () => {
  const it = armarItem({ lectura: sinNombre('20287737824'), adjunto: { nombre: 'f.pdf' }, listas: LISTAS })
  assert.equal(it.comprobante.categoria, 'B')
})
