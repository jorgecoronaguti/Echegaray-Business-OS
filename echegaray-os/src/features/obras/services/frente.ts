// DÓNDE CUELGA UNA ACTIVIDAD — una sola definición para las tres pantallas que la publican.
//
// `obra_wbs` arma `camino` concatenando los nombres con ' › ' (U+203A) e incluyendo el nombre
// propio al final. El panel (04) y el avance masivo (06) mostraban esa ruta recortada cada uno a
// su manera, y las dos maneras no coincidían: el masivo limpiaba la cola con `[\s·/>]+$` —que
// contiene el «mayor que» ASCII, NO el chevron tipográfico del separador— y dejaba en pantalla un
// «Estructura ›» colgando. Parecerse no es compartir fuente: acá queda la única definición.

/** El separador que usa `obra_wbs` al construir `camino`. */
export const SEPARADOR_CAMINO = ' › '

/**
 * El frente de la actividad: su camino SIN su propio nombre y sin el separador que quedaba colgando.
 *
 * Devuelve `null` cuando la actividad cuelga de la raíz (su camino es su nombre) o cuando lo que
 * queda es vacío: una etiqueta vacía se lee como un dato faltante y no lo es.
 */
export function frenteDeCamino(camino: string, nombre: string): string | null {
  const bruto = camino.endsWith(nombre) ? camino.slice(0, camino.length - nombre.length) : camino
  const limpio = bruto.replace(/[\s·/>›]+$/u, '').trim()
  if (limpio === '' || limpio === nombre) return null
  return limpio
}

/** El ÚLTIMO tramo del camino: el frente inmediato, que es el que identifica el trabajo en curso
 *  («Eje 5–8»), no la rama entera. Sin frente devuelve `null`. */
export function ultimoTramoDelCamino(camino: string, nombre: string): string | null {
  const frente = frenteDeCamino(camino, nombre)
  if (frente === null) return null
  const tramos = frente.split(SEPARADOR_CAMINO.trim()).map((t) => t.trim()).filter((t) => t !== '')
  return tramos.length === 0 ? null : tramos[tramos.length - 1]
}
