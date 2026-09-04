// LA NORMALIZACIÓN DE UN NOMBRE. UNA SOLA DEFINICIÓN PARA TODO EL OS.
//
// ═══ POR QUÉ ES UN ARCHIVO PROPIO Y NO UNA FUNCIÓN ADENTRO DE `embeddings.mjs` ═══
//
// Porque la necesitan los dos extremos: el resolver del servidor —que sí carga un modelo de 500 MB—
// y la pantalla de Compras, que confirma un alias y tiene que escribir la MISMA `alias_norm` que el
// resolver después va a buscar. Vivía adentro de `embeddings.mjs`, y eso obligaba al build de Next a
// arrastrar `@huggingface/transformers` a una acción del servidor: el build falla, y la salida
// obvia —copiar la función en TypeScript— sería crear una segunda definición de «el mismo nombre».
// Dos normalizaciones distintas del mismo texto son dos identidades distintas.
//
// Un alias guardado bajo una clave que el resolver nunca busca queda escrito y sin efecto: la
// confirmación de la persona se pierde en silencio, que es la peor forma de perderla.
//
// No importa nada. Ésa es la característica principal del archivo, no un detalle.

/** Las marcas diacríticas de Unicode, escritas con escape a propósito: pegadas literalmente son
 *  caracteres invisibles que nadie puede revisar en un diff. */
const DIACRITICOS = /[\u0300-\u036f]/g

/**
 * NORMALIZACIÓN DE UN NOMBRE. No es cosmética: "S.R.L." y "SRL" tienen que dar el MISMO resultado
 * para que la comparación mida el nombre y no la puntuación.
 */
export function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD').replace(DIACRITICOS, '')
    .toUpperCase()
    .replace(/[^A-Z0-9\u00d1\u00dc\s.-]/g, ' ')
    .replace(/\b(S\.?R\.?L|S\.?A\.?S?|S\.?H|SOCIEDAD ANONIMA|SRL|SA|SAS)\b\.?/g, ' ')
    .replace(/[.\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
