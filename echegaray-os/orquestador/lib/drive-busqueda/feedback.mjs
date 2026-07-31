// "NO ERA ESE" — leer la respuesta de una persona a un resultado, sin llamar a nadie.
//
// El buscador ya elegía bien la mayoría de las veces. Lo que no tenía era manera de enterarse
// cuando elegía mal: la persona escribía "no, ese no" y el OS lo trataba como una búsqueda
// nueva de la palabra "no". La corrección más barata que existe —alguien diciéndote que te
// equivocaste, gratis, en el momento— se perdía entera.
//
// Es un vocabulario cerrado y chico. No es un clasificador: son las cuatro maneras en que la
// gente contesta a un archivo que le pasaron. Determinístico como todo el resto — misma
// entrada, misma salida, cero modelo.

import { plano } from './normalizar.mjs'

export const FEEDBACK = Object.freeze({
  CONFIRMA: 'confirma',
  RECHAZA: 'rechaza',
  EXPLICA: 'explica',
  CIERRE: 'cierre',
})

/** "Sí, ese era". Confirma lo que el OS propuso: es lo único que genera aprendizaje. */
const CONFIRMA = new Set([
  'si', 'sisi', 'si si', 'dale', 'ok', 'oka', 'okey', 'listo', 'perfecto', 'correcto',
  'ese es', 'ese era', 'esa es', 'esa era', 'ese si', 'era ese', 'era esa', 'justo ese',
  // "gracias" a secas NO está acá: agradecer no dice CUÁL documento era, y tomarlo como
  // confirmación era inventar una preferencia a partir de un modal. "correcto gracias" sí,
  // porque lo que confirma es el "correcto".
  'exacto', 'ese mismo si', 'bien ahi', 'ese si era', 'correcto gracias', 'gracias era ese',
])

/** "No era ese". No elige otro: sólo dice que el propuesto está mal. */
const RECHAZA = new Set([
  'no', 'nop', 'no era ese', 'no era esa', 'ese no', 'esa no', 'ese no era', 'esa no era',
  'no es ese', 'no es esa', 'no era', 'ninguno', 'ninguna', 'ni ese', 'nada que ver',
  'no es lo que buscaba', 'no era lo que buscaba', 'ese no es', 'mal', 'esta mal',
])

/**
 * "Gracias". Cierra la conversación: no confirma el documento ni pide nada.
 *
 * Existe por un caso concreto y feo: agradecer después de un resultado devolvía el catálogo
 * entero de lo que el OS sabe hacer. Nadie que dice "gracias" está preguntando qué se puede
 * hacer. No es un sistema conversacional — son las cinco maneras de terminar un pedido.
 *
 * NO incluye "perfecto" ni "listo": ésas ya significan "sí, ese era" y confirman (arriba). Un
 * "perfecto" sobre un archivo propuesto es una confirmación, y tratarlo como cortesía sería
 * tirar a la basura la señal más barata que da el buscador.
 */
const CIERRE = new Set([
  'gracias', 'graciasss', 'muchas gracias', 'mil gracias', 'gracias os', 'gracias bot',
  'genial', 'buenisimo', 'barbaro', 'joya', 'de diez', 'excelente', 'gracias che',
])

/** "¿Por qué ese?". Pide el desglose de la decisión. */
const EXPLICA = new Set([
  'por que', 'porque', 'por que ese', 'porque ese', 'por que ese', 'por que lo elegiste',
  'como lo elegiste', 'por que gano', 'explicame', 'explica', 'por que ese y no otro',
  'de donde sacaste ese', 'por que ese archivo',
])

/**
 * Texto → qué dijo la persona sobre el resultado anterior. `null` si no dijo nada de eso.
 *
 * El `null` importa tanto como los otros tres: significa "esto no es una respuesta a mi
 * resultado, es otra cosa", y deja que el router siga su camino normal en vez de inventar una
 * interpretación.
 */
export function interpretarFeedback(texto) {
  const t = plano(texto).replace(/[¿?¡!.,]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!t || t.length > 40) return null
  if (CONFIRMA.has(t)) return FEEDBACK.CONFIRMA
  if (RECHAZA.has(t)) return FEEDBACK.RECHAZA
  if (EXPLICA.has(t)) return FEEDBACK.EXPLICA
  if (CIERRE.has(t)) return FEEDBACK.CIERRE
  return null
}
