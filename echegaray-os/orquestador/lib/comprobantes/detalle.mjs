// LA COLUMNA K ("Detalles / Obra") ES TEXTO LIBRE, Y EL BOT LA TRATABA COMO UN DESPLEGABLE.
// NÚCLEO PURO, CERO MODELO Y CERO RED.
//
// ═══ LA DIFERENCIA REAL ENTRE LAS DOS VÍAS (13/08) ═══
//
// Reclamo textual del dueño: «no lee bien el contenido ni lo q esta en manuscrita no carga igual q si
// lo hiciera por esta via». Es verificable comparando filas del MISMO Sheet, del MISMO día:
//
//   Cargadas por Claude Code — la columna K llena y COMPUESTA:
//     831 · Combustibles Barcelo · "Diesel 500 (26,5135 l) + Nafta Super (9,…"
//     833 · Alumetal            · "retira Rodrigo · vto 04/08"
//     830 · Movistar            · "Pagada 07/08 MP tarjeta de débito · op…"
//
//   Cargadas por el bot — la columna K VACÍA:
//     840 · Rodamientos Cuyo · (y el propio bot había leído a mano "Taller")
//     841 · VILLA DEL PINO   · 842 · Ruviño Matias
//
// Ninguno de esos tres textos de Claude Code existe en ninguna lista. Son NOTAS COMPUESTAS mirando el
// papel: los litros, el vencimiento, quién retira, con qué se pagó. Y el bot sólo podía escribir en K
// un valor que YA estuviera en el vocabulario de esa obra — o sea, casi nunca. Ésa es la diferencia:
// **una vía compone y la otra elige de una lista cerrada, sobre una columna que no tiene lista.**
//
// La columna K no tiene desplegable (`listas.mjs` sólo lee E, J, I, B y P). No hay celda roja posible
// ni cruce que se rompa: lo único que se juega es que el texto sea útil o sea ruido.
//
// ═══ DÓNDE ESTÁ EL LÍMITE, PARA NO REVIVIR EL DEFECTO DEL 04/08 ═══
//
// El 04/08 el bot escribió `Rodrigo Echegaray` en K: un nombre sacado de las observaciones IMPRESAS de
// la factura, puesto donde va el frente de obra. La lección no fue "nunca escribas texto libre" —la
// fila 833 de Claude Code dice literalmente «retira Rodrigo» y el dueño la dio por buena—: fue que un
// dato impreso del proveedor no es una decisión de imputación.
//
// Por eso la nota compuesta:
//   · NO decide la obra. La obra sigue saliendo del desplegable estricto de J y del matcheo del
//     manuscrito. Un texto libre no puede imputar plata a ninguna parte.
//   · Cede SIEMPRE ante el vocabulario que el dueño ya usó en esa obra: si «Autoelevador» matchea,
//     va «Autoelevador», porque así los reportes agrupan.
//   · Se descarta si repite una palabra que el OCR inventó (el eco de «COMESTIBLES BARCELO»).
//   · Se acota a un renglón. K es una nota, no un párrafo.

import { ecoDelOcr } from './plausibilidad.mjs'

/** Largo máximo de la nota. Las de Claude Code entran holgadas; un párrafo no es una nota. */
export const MAX_DETALLE = 120

/** Ruido que el modelo devuelve cuando no tiene nada que decir. No es una nota: es un hueco. */
const VACIO = /^(null|n\/a|-|—|sin detalle|no aplica|ninguno?|s\/d)$/i

/**
 * La nota compuesta que va a la columna K, o null.
 *
 * @param {string|null} propuesta   lo que el modelo compuso mirando el papel
 * @param {object} [o]
 * @param {string[]} [o.inventadas] palabras que el OCR se inventó (ver `palabrasInventadas`)
 * @param {string|null} [o.yaElegido] el valor que ya ganó por el vocabulario de la obra: si lo hay,
 *                                    manda él y esto no se usa.
 * @returns {{valor:string, via:'compuesta'}|null}
 */
export function detalleCompuesto(propuesta, { inventadas = [], yaElegido = null } = {}) {
  if (yaElegido) return null
  const s = String(propuesta ?? '').replace(/\s+/g, ' ').trim()
  if (!s || VACIO.test(s)) return null
  // Una nota de una sola letra o un número suelto no dice nada y ensucia la columna.
  if (s.length < 3) return null
  if (ecoDelOcr(s, inventadas).contaminado) return null
  return { valor: s.slice(0, MAX_DETALLE), via: 'compuesta' }
}
