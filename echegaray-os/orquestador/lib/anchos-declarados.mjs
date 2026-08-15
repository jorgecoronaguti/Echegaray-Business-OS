// EL ANCHO DE UNA COLUMNA SIEMPRE TIENE DUEÑO — TAMBIÉN EN UNA PESTAÑA DE CARGA.
//
// ═══ EL DEFECTO (15/08) ═══
//
// `Cobranzas!H` es la orden de compra que carga el dueño: 58 a 74 caracteres en una columna de 336px.
// 25 de los 26 textos cortados de la pestaña están ahí, y ningún código los podía arreglar:
//
//   · `Cobranzas` es `carga: true` — NO TIENE GENERADOR. No hay ningún escritor que "sea el dueño de
//     esa pestaña" y pueda acomodarle el ancho, que es a quien `reparar-textos` deriva el trabajo.
//   · `reparar-textos` sí podría ensancharla, pero su tope es `ANCHO_MAX = 344` y H necesita 480.
//
// ═══ POR QUÉ NO SE SUBIÓ EL TOPE GLOBAL ═══
//
// Se midió antes de decidir, sobre las 21 pestañas del archivo. Subir `ANCHO_MAX` de 344 a 470 cambia
// hoy exactamente DOS columnas, y las dos son de Cobranzas (`H` 336→405 y `Z` 306→355). El impacto
// es acotado. Y aun así no alcanza, por dos razones que la medición dejó a la vista:
//
//   1. NO ARREGLA H. Tres de los 25 textos pasan de 64 caracteres (`ES_PARRAFO`) y quedan afuera
//      igual, tenga el tope el valor que tenga: los que llegan a 74 necesitan 480px. Habría que
//      mover DOS topes globales para arreglar una columna.
//   2. EL 344 SIGNIFICA ALGO. Está escrito en `reparar-textos`: es lo que mide la primera columna
//      cuando lleva el nombre de una línea del cash flow, o sea el techo de un RÓTULO. `Cobranzas!H`
//      no es un rótulo: es una columna de datos que el dueño tipea. Mover el número para contestar
//      otra pregunta lo deja sin querer decir nada, y con él queda sin criterio el corte entre
//      "ensanchar" y "que lo acorte el generador dueño" para las otras veinte pestañas.
//
// ═══ EL MECANISMO ═══
//
// El mismo patrón que ya usan `ANCHOS_PROVEEDORES` (lib/proveedores-frontera.mjs) y `ANCHOS_CONTROL`
// (scripts/cobranzas-control.mjs): el ancho se DECLARA en un solo lugar y un solo escritor lo aplica.
// La diferencia es para quién: aquéllos los declara el generador que escribe el bloque; éste es para
// las columnas que NO tienen generador. El ancho de una columna es de la COLUMNA ENTERA — o lo decide
// uno, o gana el último que corre.
//
// UN ANCHO DECLARADO ES UNA DECISIÓN, NO UNA MEDICIÓN, y por eso pisa a las dos heurísticas de
// `reparar-textos`: se aplica tal cual (no "lo que necesite el texto de hoy") y no lo frena
// `ES_PARRAFO`. Lo que NO pisa es el reporte: un texto que tampoco entra en el ancho declarado se
// sigue nombrando, porque ahí el problema pasó a ser la redacción.

/**
 * PESTAÑA → COLUMNA → PÍXELES. Sólo columnas SIN generador que las escriba.
 *
 * Cada número sale del peor texto medido en esa columna, con el mismo factor que usa el detector
 * (≈ 0,57 px por punto de cuerpo y por carácter) más 16px de aire.
 */
export const ANCHOS_DECLARADOS = Object.freeze({
  Cobranzas: Object.freeze({
    // H · ORDEN DE COMPRA. El peor texto son 74 caracteres a cuerpo 11 ("Anticipo inicio de obra 50%
    // Blanco $65.000.000 Playon de Azufre. Cargar OC") ⇒ 480px. Los 25 textos cortados de la columna
    // entran con esto. Es el ancho de HOY sobre datos que el dueño sigue tipeando: si mañana carga
    // uno más largo, `auditar-pantalla` lo va a reportar y la decisión de ensanchar de nuevo o
    // acortar el texto vuelve a ser de una persona. Perseguir el dato para siempre sería volver al
    // problema de origen.
    H: 480,
    // Z · el rótulo de la retención del 2,5%/3,5%, 54 caracteres a cuerpo 11 ⇒ 355px. Es uno de los
    // dos encabezados que el OS reconstruyó después de pisar los originales, y lleva la marca de que
    // el rótulo original se perdió. Se ensancha en vez de acortarlo porque esa marca es justamente
    // lo que le pide al dueño que lo restituya: sacarla para que entre sería borrar el pedido.
    Z: 360,
  }),
})

/**
 * NÚCLEO PURO: el ancho declarado para esta columna, o `null` si nadie lo declaró.
 *
 * @param {string} pestaña
 * @param {string} col la letra de la columna, tal como la emite `detectar`
 * @returns {number|null}
 */
export function anchoDeclarado(pestaña, col) {
  return ANCHOS_DECLARADOS[pestaña]?.[String(col).toUpperCase()] ?? null
}

/** NÚCLEO PURO: los anchos declarados de una pestaña. Un objeto vacío si no declara ninguno. */
export function anchosDe(pestaña) {
  return ANCHOS_DECLARADOS[pestaña] ?? {}
}
