// NINGUNA CELDA CON BASURA — la puerta única entre lo que leyó el modelo y una columna con
// desplegable ESTRICTO. NÚCLEO PURO.
//
// ═══ LO QUE PASÓ EL 04/08 ═══
//
// El bot escribió en la columna P ("Tipo pago", desplegable de seis valores) las palabras `Importe` y
// `30 DIAS FECHA FACTURA`. Las dos celdas quedaron en ROJO. No son formas de pago: son pedazos del
// texto de la factura que el modelo copió en el campo equivocado, y nadie los comparó contra nada
// antes de escribirlos.
//
// ═══ LA REGLA, Y POR QUÉ NO ADMITE "LO MÁS PARECIDO" ═══
//
// **El valor está EXACTO en la lista, o no se escribe nada.** No hay tercera opción y no hay
// aproximación: una celda vacía la completa alguien en dos segundos mirando la fila; una celda en rojo
// rompe el desplegable, rompe los cruces que dependen de esa columna, y hay que salir a buscarla.
//
// Lo único que se tolera es la forma de ESCRIBIR el mismo valor —mayúsculas y tildes—, y eso porque
// "EFECTIVO" y "Efectivo" no son dos respuestas distintas. Esa tolerancia vive en `tipoPagoValido`
// (contrato de columnas), no acá.
//
// ═══ POR QUÉ ESTO NO ESTÁ ADENTRO DEL FLUJO ═══
//
// Porque es la misma decisión para cinco columnas y tiene que poder probarse sola, sin Mattermost,
// sin Google y sin modelo: dado lo que devolvió la visión y dadas las listas, qué entra y qué no.

import { tipoPagoValido } from '../carga-comprobantes.mjs'

/**
 * El valor de `lista` que es EXACTAMENTE `v`, o null. Se compara el texto tal cual —sólo se recortan
 * los espacios de los bordes— porque lo que se va a escribir tiene que ser idéntico al rótulo del
 * desplegable: una tilde de menos ya es otro valor para Google.
 */
export function valorDeLista(v, lista) {
  const s = String(v ?? '').trim()
  if (!s || !Array.isArray(lista)) return null
  return lista.find((x) => String(x) === s) ?? null
}

/**
 * Lo que el modelo propuso para las columnas con lista, ya filtrado contra las listas REALES.
 *
 * Devuelve sólo lo que sobrevivió. Un valor inventado no aparece: queda como si el modelo no hubiera
 * contestado esa columna, y el flujo la pregunta con el menú, que es lo que corresponde.
 *
 * EL DETALLE (K) NO ESTÁ ACÁ a propósito: no tiene desplegable propio, su lista depende de la obra
 * que termine eligiéndose, y esa obra puede no ser la que propuso el modelo. Lo resuelve quien ya
 * sabe cuál quedó.
 *
 * @param {object} crudo    el JSON de la visión
 * @param {{obras?:string[], unidades?:string[], categorias?:string[], tiposPago?:string[]}} listas
 * @returns {{obra?:string, unidad?:string, categoria?:string, formaPago?:string}}
 */
export function imputacionDelModelo(crudo = {}, listas = {}) {
  const out = {}
  const obra = valorDeLista(crudo?.obra, listas?.obras)
  if (obra) out.obra = obra
  const unidad = valorDeLista(crudo?.unidad_negocio, listas?.unidades)
  if (unidad) out.unidad = unidad
  const categoria = valorDeLista(crudo?.categoria, listas?.categorias)
  if (categoria) out.categoria = categoria
  // El tipo de pago pasa además por `tipoPagoValido`, que es el que sabe que "EFECTIVO" y "Efectivo"
  // son el mismo valor y que "30 DIAS FECHA FACTURA" no es ninguno. Vive en el contrato de columnas
  // porque el cargador de línea de comandos —que no lee listas— también lo necesita.
  const pago = tipoPagoValido(crudo?.forma_pago, listas?.tiposPago)
  if (pago) out.formaPago = pago
  return out
}
