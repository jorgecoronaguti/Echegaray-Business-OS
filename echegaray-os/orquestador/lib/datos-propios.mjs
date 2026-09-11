// LOS DATOS PROPIOS DEL OS — los que no viven en ninguna pestaña ni en ninguna tabla.
//
// ═══ POR QUÉ EXISTE (11/09/2026) ═══
//
// Hay datos que son de la empresa y no de ninguna fuente externa: el cronograma de un préstamo, el
// día en que vence la cuota de un plan de ARCA, qué planes existen. Vivían tipeados adentro de filas
// de la pestaña Compras —que el dueño está vaciando— o clavados en una constante de un módulo.
//
// Un archivo en `orquestador/datos/` es mejor que una constante por dos razones concretas: se edita
// sin tocar código (el dueño puede dictar un cambio y se aplica en un commit de una línea) y viaja en
// git con su historia, así que se puede ver cuándo cambió un importe y por qué.
//
// ═══ FALLA BLANDO Y LO DICE ═══
//
// Si el archivo no está o está roto devuelve `null` con un aviso, nunca un objeto a medias con
// defaults: un cronograma incompleto produce cuotas plausibles y equivocadas, y el consumidor que
// recibe `null` ya sabe que tiene que no proyectar nada. Es la misma asimetría que el generador del
// libro aplica con la pestaña Estructura: incompleto y gritado se puede decidir, equivocado y
// silencioso no.

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

/** La carpeta se resuelve desde este archivo y no desde el cwd: un script corre desde cualquier lado. */
const CARPETA = join(dirname(fileURLToPath(import.meta.url)), '..', 'datos')

/**
 * Lee un JSON de `orquestador/datos/`. Devuelve `null` —con aviso— si no está o no parsea.
 *
 * @param {string} nombre por ejemplo 'prestamo-prendario.json'
 * @param {(m:string)=>void} aviso
 * @returns {Promise<object|null>}
 */
export async function leerDatos(nombre, aviso = () => {}) {
  try {
    const crudo = await readFile(join(CARPETA, nombre), 'utf8')
    const datos = JSON.parse(crudo)
    if (!datos || typeof datos !== 'object') {
      aviso(`datos-propios: ${nombre} no contiene un objeto. No lo uso: un dato a medias es peor que ninguno.`)
      return null
    }
    return datos
  } catch (e) {
    aviso(`datos-propios: no pude leer ${nombre} (${e.message}). El consumidor no va a proyectar nada `
      + 'con esta fuente — y eso es correcto: el cronograma no se adivina.')
    return null
  }
}
