// DE DÓNDE SALIÓ LA IMPUTACIÓN DE ESTA FILA — NÚCLEO PURO, CERO RED, CERO RELOJ.
//
// ═══ EL DEFECTO (14/08) ═══
//
// El bot escribe obra, detalle, unidad y categoría deducidas del PERFIL ESTADÍSTICO del proveedor
// («este proveedor se imputó a San Francisco en 126 de sus 140 cargas»). Eso es legítimo —es el mismo
// umbral con el que el auditor declara defecto una celda vacía que el historial resolvía— pero la
// celda que queda es indistinguible de la que salió del papel. Tres meses después nadie puede decir
// si «San Francisco / Civil» la escribió el dueño en el remito o la dedujo un promedio, y esa
// distinción es justo la que separa un DATO REAL de una INFERENCIA.
//
// ═══ POR QUÉ EN EL TEXTO Y NO EN UNA NOTA ═══
//
// Una nota de celda no sirve: este repo ya decidió que ningún generador escribe notas nunca más —el
// dueño las borraba y volvían—. Y las columnas J (Obra), I (Unidad) y B (Categoría) tienen
// desplegable ESTRICTO: cualquier sufijo las deja en rojo y fuera del vocabulario de los cruces.
//
// Queda L (Concepto), que es texto libre y ya es la columna donde el OS deja el rastro de lo que leyó
// —`conceptoConAnotacion` le pega ahí la transcripción literal de lo escrito a mano—. La marca va al
// final, con un prefijo fijo y greppable, y NOMBRA las dimensiones: no es lo mismo que el historial
// haya puesto la obra que el detalle.
//
// ═══ Y NO ENVENENA EL APRENDIZAJE ═══
//
// El concepto alimenta `palabrasConcepto` en `imputacion-aprendida.mjs`, que refina la obra por
// coincidencia de palabras. Si la marca entrara al bag de palabras, «historial», «detalle» y
// «unidad» aparecerían en todas las obras de todos los proveedores marcados y el refinamiento
// perdería filo. Por eso la marca se QUITA antes de aprender (`sinMarcaDeOrigen`), y por eso las dos
// funciones viven en el mismo archivo: la que escribe y la que borra tienen que conocer el mismo
// formato o el día que cambie una, la otra deja de limpiar y nadie se entera.

/** El prefijo fijo. Cambiarlo rompe la limpieza de lo ya escrito: se agrega, no se reemplaza. */
export const PREFIJO_MARCA = '[historial:'

/** Reconoce la marca en cualquier parte del texto. `g` va aparte para no arrastrar `lastIndex`. */
const RE_MARCA = /\s*\[historial:[^\]]*\]/g

/** Las dimensiones que la marca sabe nombrar, en el orden en que se leen. Es contrato con el rótulo. */
export const DIMENSIONES = Object.freeze(['obra', 'detalle', 'unidad', 'categoria'])

/** Cómo se llama cada dimensión en la celda. Corto: la columna L la lee una persona. */
const ROTULO = Object.freeze({ obra: 'obra', detalle: 'detalle', unidad: 'unidad', categoria: 'categoría' })

/**
 * Las dimensiones que este comprobante tomó del historial, en orden estable.
 *
 * Se lee de los campos `*Via` que ya viajan en el comprobante desde `item.mjs` e `imputacion.mjs`.
 * Sólo cuenta `'historial'`: lo que salió del papel, del mensaje o de una elección de la persona es
 * un dato, no una inferencia, y marcarlo sería ensuciar la celda para no decir nada.
 *
 * @param {object} c  el comprobante
 * @returns {string[]}
 */
export function dimensionesInferidas(c = {}) {
  return DIMENSIONES.filter((d) => c?.[`${d}Via`] === 'historial')
}

/**
 * El concepto con la marca de origen pegada al final. Idempotente: si ya la tenía, se reemplaza.
 *
 * Devuelve el concepto TAL CUAL cuando no hay nada inferido — la fila que salió entera del papel no
 * lleva marca, que es lo que hace que la marca signifique algo cuando está.
 *
 * @param {string|null} concepto
 * @param {string[]} dims  las de `dimensionesInferidas`
 * @returns {string|null}
 */
export function conMarcaDeOrigen(concepto, dims = []) {
  const base = sinMarcaDeOrigen(concepto)
  const usadas = DIMENSIONES.filter((d) => dims.includes(d))
  if (!usadas.length) return base
  const marca = `${PREFIJO_MARCA} ${usadas.map((d) => ROTULO[d]).join(', ')}]`
  return base ? `${base} ${marca}` : marca
}

/**
 * El texto sin la marca. Es lo que tiene que ver cualquiera que APRENDA del concepto o lo compare:
 * la marca es metadato del OS, no algo que el proveedor haya facturado.
 */
export function sinMarcaDeOrigen(texto) {
  const s = String(texto ?? '').replace(RE_MARCA, '').trim()
  return s || null
}

/** ¿Este texto lleva marca de origen? Para poder afirmar sobre una fila ya escrita. */
export function tieneMarcaDeOrigen(texto) {
  return String(texto ?? '').includes(PREFIJO_MARCA)
}
