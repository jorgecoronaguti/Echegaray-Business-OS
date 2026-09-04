// LA ESTRUCTURA DE UNA PESTAÑA NO LA BORRA NADIE A PROPÓSITO.
//
// ═══ EL DEFECTO MEDIDO EL 04/09/2026 ═══
//
// `huella-celda.mjs` protege lo que el dueño borra: si tiene huella propia de una celda y hoy esa
// celda está vacía, no la resucita («la vaciaste vos»). Es la regla correcta.
//
// Falla cuando el GENERADOR cambia el layout. «Impuestos y Financieros» pasó de 105 filas a 68 y las
// huellas quedaron apuntando a coordenadas donde hoy no hay nada, así que el generador se negó a
// escribir —entre otras— `A23` («Concepto», el encabezado del cuadro de IIBB) y `A42` («⇒ Total
// otros impuestos»). El resultado es visible y lo cuenta el auditor de patrón: dos filas con
// importes y sin nada en la columna A que diga qué son.
//
// ═══ POR QUÉ ESTE SEGURO Y NO INVALIDAR LAS HUELLAS DE CELDA ═══
//
// Las huellas de celda son lo único que impide resucitar un dato que el dueño borró a mano. Tirarlas
// enteras ante un cambio de layout sería desarmar esa protección justo cuando más se mueve la
// pestaña. Se recorta al mínimo: SÓLO se ignora la supresión cuando lo que el generador quiere
// escribir es ESTRUCTURA —el título de una sección, el encabezado de una tabla, la fila de un total—.
//
// El criterio no es nuevo: `respetar-ediciones.mjs` ya lo estableció el 23/07 con la misma razón
// escrita («hay borrados que nadie pide … si desaparecieron, el que falló fui yo»), y se le comió el
// subtítulo de esta misma pestaña antes de tenerlo. Acá se reusa esa función y se le suma el
// encabezado de tabla, que es la clase que faltaba: nadie borra la palabra «Concepto» de un cuadro y
// deja los doce importes debajo.
//
// Un IMPORTE, un texto libre y una nota siguen protegidos: si el dueño los borra, siguen borrados.

import { esEstructural } from './respetar-ediciones.mjs'
import { ES_ENCABEZADO } from './patron-pestana.mjs'

/**
 * NÚCLEO PURO: ¿esta celda es estructura de la pestaña, y por lo tanto su ausencia es un movimiento
 * mío y no un borrado del dueño?
 *
 * @param {unknown} v lo que el generador quiere escribir en la celda
 * @returns {boolean}
 */
export function esCeldaDeEstructura(v) {
  if (typeof v !== 'string') return false
  const t = v.trim()
  if (!t || t.startsWith('=')) return false
  if (esEstructural(t)) return true
  // Un encabezado de tabla ocupa su fila con los nombres de las columnas; la palabra que abre la
  // columna A es la dimensión del cuadro («Concepto», «Período», «Proveedor»). Se compara la fila
  // entera contra el patrón que la piel ya usa para dibujarlos, así que hay una sola definición.
  return ES_ENCABEZADO.test(t)
}
