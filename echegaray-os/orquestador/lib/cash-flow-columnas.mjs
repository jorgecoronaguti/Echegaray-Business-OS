// LAS COLUMNAS DE LA DERECHA DEL CUADRO — UNA COLUMNA DE TEXTO DECLARA QUE ES TEXTO.
//
// ═══ POR QUÉ EXISTE (05/08/2026) ═══
//
// El auditor de pantalla contaba 42 defectos en el Cash Flow Semanal y 34 de ellos eran la MISMA
// causa: la columna "Naturaleza del dato" caía dentro de la banda de moneda del cuerpo. Cada glosa
// ("COBRADO · ya entró, con fecha de cobro") vivía en una celda con formato CURRENCY.
//
// No era un descuido de formato: era una ARITMÉTICA DUPLICADA. La grilla escribía la naturaleza en
// `n+2` y la piel pintaba de moneda `[colTotal+1, colTotal+3)` = `[n+2, n+4)`. Las dos calculaban por
// su cuenta dónde empezaba cada cosa, y el día que se insertó la naturaleza delante de "Real
// (Compras)" sólo se corrigió una. El resultado: la naturaleza pintada de moneda, "Proyectado"
// —que es plata— pintado de texto, y ningún error en ninguna celda. Un corrimiento de una columna no
// da #REF: da una pestaña mal dibujada que nadie puede explicar.
//
// ACÁ VIVE LA ÚNICA DEFINICIÓN. La grilla pregunta en qué índice va cada clave; la piel pregunta qué
// especie y qué ancho tiene cada índice. Ninguna de las dos vuelve a sumar. Si mañana se agrega una
// columna, se agrega en esta lista y las dos se enteran.
//
// ═══ Y POR QUÉ SON COLUMNAS Y NO UN BLOQUE AL PIE ═══
//
// "Dónde está el detalle" era un bloque de 23 filas al pie que repetía el nombre de cada línea para
// decir de dónde salía. Tres cosas en contra: (1) repetía en prosa lo que el hipervínculo de la
// columna A ya hace con un click; (2) su texto largo vivía en la columna B, de 96 px, y ahí nacían
// los 6 "texto_cortado" restantes; (3) obligaba a bajar 23 filas para saber de dónde sale la línea
// que se está mirando. Como columna, la respuesta está AL LADO del número. Menos filas, misma
// trazabilidad, cero texto cortado.

/**
 * Una columna de metadatos. `tipo` es lo que la piel necesita saber para no dibujarla mal, y `px` lo
 * que necesita para que su contenido entre. Nada más: el VALOR lo pone la grilla, que es la única que
 * conoce la geometría de las fórmulas.
 *
 * @typedef {{clave:string, titulo:string, tipo:'texto'|'moneda', px:number}} ColumnaMeta
 */

/** Qué es el número: hecho, promesa, orden de pago o modelo. Regla absoluta de la skill de tesorería. */
const NATURALEZA = { clave: 'naturaleza', titulo: 'Naturaleza del dato', tipo: 'texto', px: 300 }
/** De qué pestaña sale, en una línea. Reemplaza al bloque "DÓNDE ESTÁ EL DETALLE". */
const DONDE = { clave: 'donde', titulo: 'Dónde está el detalle', tipo: 'texto', px: 320 }
/** Sólo en el mensual: el total del año mezcla lo cargado y lo proyectado, y hay que poder separarlo. */
const REAL = { clave: 'real', titulo: 'Real (Compras)', tipo: 'moneda', px: 118 }
const PROYECTADO = { clave: 'proyectado', titulo: 'Proyectado', tipo: 'moneda', px: 118 }
const ORIGEN = { clave: 'origen', titulo: 'Con qué criterio se proyecta', tipo: 'texto', px: 300 }

/** @type {Object<string, ColumnaMeta[]>} */
export const COLUMNAS_META = {
  // El semanal NO lleva Real/Proyectado: sus 13 columnas son todas futuro o presente, así que separar
  // "lo real del año" no significa nada. La naturaleza y el origen sí, y son las dos que se leen.
  semanal: [NATURALEZA, DONDE],
  mensual: [NATURALEZA, DONDE, REAL, PROYECTADO, ORIGEN],
}

/** Las columnas de metadatos de una pestaña, en orden. PURA. */
export function columnasMeta(periodo) {
  const c = COLUMNAS_META[periodo]
  if (!c) throw new Error(`no hay columnas de metadatos declaradas para "${periodo}"`)
  return c
}

/**
 * El índice 0-based de una columna de metadatos dentro de la fila.
 *
 * La geometría del cuadro es: A(0) · n columnas de período (1..n) · el total (n+1) · los metadatos.
 * Por eso el primer metadato es n+2. Ese "+2" aparece UNA sola vez en todo el repo, acá.
 *
 * @param {'semanal'|'mensual'} periodo · @param {string} clave · @param {number} n columnas de período
 */
export function indiceMeta(periodo, clave, n) {
  const i = columnasMeta(periodo).findIndex((c) => c.clave === clave)
  // Romper y no devolver -1: un índice negativo escribe en el final del array y el defecto aparece a
  // tres pasos de acá, con la columna equivocada llena de glosas.
  if (i < 0) throw new Error(`la columna "${clave}" no existe en el cuadro ${periodo}`)
  return n + 2 + i
}

/** Cuántas columnas tiene el rectángulo entero: A + períodos + total + metadatos. PURA. */
export function anchoConMeta(periodo, n) {
  return n + 2 + columnasMeta(periodo).length
}

/**
 * Lo que la piel necesita: por cada columna de metadatos, su índice 0-based, su especie y su ancho.
 * Que salga de la MISMA lista que usó la grilla es todo el punto de este archivo.
 */
export function bandasMeta(periodo, n) {
  return columnasMeta(periodo).map((c, i) => ({ ...c, indice: n + 2 + i }))
}
