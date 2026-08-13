// EL TIPO DE CAMBIO EN USO, LEÍDO DE UN SOLO LUGAR.
//
// POR QUÉ EXISTE (13/08/2026). El rango con nombre `TIPO_CAMBIO_USD` lo publica el anexo de CAJA y ya
// lo citaban las fórmulas del archivo; el que lo necesitaba desde JavaScript lo leía a mano
// (`scripts/obras-pestana.mjs`). Cuando apareció el SEGUNDO consumidor —el extractor de Cobranzas del
// Libro, que valúa los cobros en dólares— la opción era copiar seis líneas. Copiar la lectura es
// copiar el CRITERIO: qué cuenta como tipo de cambio válido y qué no. Dos copias se desincronizan, y
// la que se olvide de descartar el vacío convierte una venta de U$S 15.400 en $0 sin dar un error.
//
// UN TC INVÁLIDO ES `null`, NUNCA CERO NI UNO. Cada consumidor decide qué hacer con la falta —la
// pestaña OBRAS aborta siempre porque todas sus fórmulas lo citan; el extractor sólo si hay filas en
// dólares que valuar—, pero ninguno puede confundir "no lo sé" con "vale 1" (dejaría los dólares
// contados como pesos, que es el defecto original) ni con "vale 0" (los borraría del cuadro).

import { RANGO_TC } from './caja-disponibilidades.mjs'

export { RANGO_TC }

/**
 * NÚCLEO PURO: qué tipo de cambio declara lo que se leyó del rango con nombre.
 *
 * Se lee con `UNFORMATTED_VALUE`, así que un tipo de cambio sano llega como NÚMERO. Un string
 * ("1.492,524" en es-AR, o el `""` que deja `IFERROR(GOOGLEFINANCE(...);"")` cuando la cotización no
 * responde) NO se intenta parsear: `Number('')` es 0 y `Number('1.492,524')` es NaN. Parsear acá sería
 * inventarle un formato a un dato que ya debería venir como número — y el modo de falla de acertar a
 * medias es un tipo de cambio de 1,492 que subvalúa mil veces sin gritar.
 *
 * @param {Array<Array>|null} leido lo que devolvió `readSheetValues` sobre el rango
 * @returns {number|null} null es DESCONOCIDO: ni cero ni uno
 */
export function tipoCambioDeCelda(leido) {
  const v = leido?.[0]?.[0]
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null
}

/**
 * El tipo de cambio en uso del archivo. NO tira: un rango que no existe hace fallar la lectura entera
 * y eso también es "no lo sé". El que aborta es el consumidor, que es el único que sabe si puede
 * seguir sin él y qué decirle al dueño.
 *
 * @returns {Promise<{tc:number|null, crudo:any}>} `crudo` viaja para que el mensaje de error pueda
 *   mostrar QUÉ se leyó — "no trae un tipo de cambio" sin el valor no se puede diagnosticar.
 */
export async function leerTipoCambio(google, id) {
  const crudo = await google.readSheetValues(id, RANGO_TC, { render: 'UNFORMATTED_VALUE' }).catch(() => null)
  return { tc: tipoCambioDeCelda(crudo), crudo }
}
