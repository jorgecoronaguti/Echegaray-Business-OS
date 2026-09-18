// COMPRAS PARA EL CARGADOR DEL CHAT — leída desde su fila de rótulos y devuelta con la forma B..O.
//
// ═══ POR QUÉ (14/09/2026, inserción de «Obra» en Compras L) ═══
//
// `compras-vivas` (el duplicado y el vocabulario) y `auditoria` (el auditor de lo que cargó el bot)
// leían `Compras!B4:O` y después `r[13]`: el Total. Con «Obra» insertada en L, el rango B4:O corta en
// «IVA» y `r[13]` pasa a ser el IVA. El duplicado deja de encontrar la factura por total —y el bot la
// carga dos veces— y el auditor declara que ninguna fila cierra, sin un solo error en ningún lado.
//
// Sus núcleos puros (`indexarCompras`, `registroDeFila`) y sus tests indexan la forma B..O de
// referencia. No se tocan: lo que cambia es la LECTURA. Se lee desde la fila de rótulos en el mismo
// viaje (`conEncabezado`), cada columna se ubica por su rótulo, y la fila se reordena a B..O. La
// columna nueva viaja al final (`obraFila`), fuera del contrato viejo, para quien la quiera mirar.

import { COMPRAS_2508 } from '../encabezados-referencia.mjs'
import { conEncabezado } from '../columnas-lectura.mjs'
import { COMPRAS, PESTANAS, rangoFilas } from '../columnas-por-encabezado.mjs'

/** Las claves en el orden de la forma B..O de referencia (B = 0). Contrato con `EN` de los dos lectores. */
export const CLAVES_B_O = Object.freeze([
  'categoria', 'fecha', 'mes', 'proveedor', 'modalidad', 'tipo', 'numero',
  'unidad', 'obra', 'detalle', 'concepto', 'importe', 'iva', 'total',
])

// El rótulo sale del layout de referencia por posición UNA vez, acá: B..O del 25/08 son catorce
// rótulos únicos. Pedirlos por nombre contra la fila viva es lo que hace que la inserción no importe.
const PEDIDAS = Object.freeze({
  ...Object.fromEntries(CLAVES_B_O.map((k, i) => [k, COMPRAS_2508[i + 1]])),
  obraFila: COMPRAS.obra,
  // «Tipo pago» (Q) viaja desde el 18/09/2026: es la columna que el dueño completaba a mano en 85 de
  // las 131 filas que cargó el bot en un mes, y la única forma legítima de proponerla es lo que él
  // ya puso para ese proveedor. Ver `imputacion-historial.mjs` → `perfilesDePago`.
  tipoPago: COMPRAS.tipoPago,
})

/** Después de B..O van las columnas fuera del contrato viejo, en este orden. Contrato con `EN_EXTRA`. */
export const EXTRAS = Object.freeze(['obraFila', 'tipoPago'])

const ORDEN = Object.freeze([...CLAVES_B_O, ...EXTRAS])

/**
 * NÚCLEO PURO: lo leído desde la fila de rótulos → filas con la forma B..O (+ `obraFila` al final).
 * Un rótulo de B..O que falta rompe con su nombre: leer por posición daría un total que es el IVA.
 * @param {any[][]} filas empezando en la fila de rótulos (Compras!A3)
 * @returns {{filas:any[][], letras:Record<string,string|null>}}
 */
export function comprasDelCargador(filas) {
  const { cols, datos } = conEncabezado(filas, 'Compras', PEDIDAS)
  return {
    filas: datos.map((f) => ORDEN.map((k) => (cols[k] ? f?.[cols[k].indice] : undefined))),
    letras: Object.fromEntries(ORDEN.map((k) => [k, cols[k]?.letra ?? null])),
  }
}

/**
 * Lee Compras desde su fila de rótulos. Render por defecto (FORMATTED): los importes se parsean en
 * es-AR con `importeDeCompras`, igual que cuando se leía B4:O.
 * @param {{readSheetValues:Function}} google
 */
export async function leerComprasDelCargador(google, fileId) {
  const rango = rangoFilas('Compras', PESTANAS.Compras.filaEncabezado)
  return comprasDelCargador(await google.readSheetValues(fileId, rango))
}
