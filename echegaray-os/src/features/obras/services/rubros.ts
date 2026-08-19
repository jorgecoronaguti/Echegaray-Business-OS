// EL RUBRO — el agrupador de trabajo de una obra. Módulo NEUTRAL: lo usan el servidor y el cliente.
//
// ═══ EL RUBRO NO ES UNA TABLA, Y NO DEBE SERLO ═══
//
// Ya está cargado 153 veces en `obra_actividad`: una fila `tipo = 'resumen'` es la cabecera del
// rubro, y la `seccion` de sus hijas dice a cuál pertenecen. Una tabla `obra_rubro` sería la segunda
// definición del mismo agrupador, con su propio id que habría que mantener sincronizado contra un
// texto que ya existe en 309 filas.
//
// Lo que faltaba no era el modelo: era poder CREARLO, RENOMBRARLO, ORDENARLO y MOVER actividades.
// Todo eso son escrituras sobre columnas que existen desde el día uno.
//
// ═══ EL DUPLICADO ACCIDENTAL SE CORTA EN EL ALTA, NO CON UN ÍNDICE ═══
//
// «Mampostería», «MAMPOSTERIA» y «Mampostería » son el mismo rubro escrito tres veces. Pero un único
// sobre el nombre sería falso: en los datos reales «Hormigonado» aparece SEIS veces en San Francisco
// y seis en Quattropani, porque el tracker repite el mismo paso en distintas partes de la obra —eso
// es estructura legítima, no desprolijidad—. Por eso el choque se detecta en el alta, donde todavía
// hay una persona a quien preguntarle, y no con una restricción que rechazaría datos buenos.

import type { Actividad } from '../types'

/**
 * La forma comparable de un nombre de rubro: sin mayúsculas, sin tildes, sin espacios de más.
 *
 * Las tildes se sacan con NFD porque «Mampostería» y «Mamposteria» los escribe la misma persona en
 * dos días distintos, y sin esto serían dos rubros.
 */
export function normalizarRubro(nombre: string): string {
  return nombre
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

export interface Rubro {
  /** El nombre tal como se escribió. Es la clave real: `seccion` guarda este texto. */
  nombre: string
  /** La fila `tipo='resumen'` que lo encabeza, si existe. Puede faltar: hay rubros que sólo viven
   *  como `seccion` de sus hijas, y siguen siendo un rubro. */
  cabeceraId: string | null
  /** Cuántas actividades cuelgan de él (sin contar la cabecera ni las tareas). */
  n: number
  /** El orden en el que aparece en el cronograma. Sale de la primera fila que lo menciona. */
  orden: number
}

/**
 * LOS RUBROS DE UNA OBRA, en el orden del cronograma.
 *
 * Se arma con la MISMA regla que `agruparActividades` —el grupo de una fila de resumen es su propio
 * nombre, y el de una actividad es su `seccion`—: si esta lista usara otra, el selector de «mover a
 * otro rubro» ofrecería rubros que el Gantt no dibuja.
 */
export function rubrosDe(actividades: Actividad[]): Rubro[] {
  const por = new Map<string, Rubro>()
  const tomar = (nombre: string, orden: number): Rubro => {
    const k = normalizarRubro(nombre)
    let r = por.get(k)
    if (!r) { r = { nombre, cabeceraId: null, n: 0, orden }; por.set(k, r) }
    return r
  }
  for (const a of actividades) {
    if (a.actividad_padre_id) continue
    if (a.tipo === 'resumen') {
      const r = tomar(a.nombre, a.orden)
      if (r.cabeceraId === null) r.cabeceraId = a.id
    } else if (a.seccion?.trim()) {
      tomar(a.seccion.trim(), a.orden).n++
    }
  }
  return [...por.values()].sort((x, y) => x.orden - y.orden)
}

/** El rubro ya existente que chocaría con este nombre, o `null`. Devuelve el nombre REAL —el que
 *  está cargado— para poder decirlo en el mensaje en vez de repetir lo que la persona escribió. */
export function rubroQueChoca(nombre: string, existentes: readonly string[]): string | null {
  const k = normalizarRubro(nombre)
  return existentes.find((e) => normalizarRubro(e) === k) ?? null
}

/** Una fila del cronograma, en lo mínimo que hace falta para ordenarla. */
export interface FilaOrdenable { id: string; orden: number }

/**
 * CRUZAR DOS BLOQUES DEL CRONOGRAMA sin tocar el resto de la obra.
 *
 * ═══ POR QUÉ NO SE RENUMERA DE 1 A N ═══
 *
 * El `orden` que trae el tracker NO es 1..N: tiene huecos y saltos. Renumerando la obra entera,
 * casi todas las filas quedaban con un número distinto y subir un rubro disparaba 124 escrituras —
 * una por una, dentro de una server action— en la obra más grande.
 *
 * Acá se toman los números que YA ocupan los dos bloques juntos, se ordenan, y se reparten sobre las
 * filas en el orden nuevo. Los dos bloques se cruzan de lugar y ninguna otra fila cambia de número.
 *
 * Devuelve SÓLO las filas cuyo orden cambió: mandar las que quedan igual sería pisar con el mismo
 * valor algo que otro pudo haber corregido en el medio.
 */
export function cruzarBloques(
  arriba: readonly FilaOrdenable[], abajo: readonly FilaOrdenable[],
): { id: string; orden: number }[] {
  const huecos = [...arriba, ...abajo].map((f) => f.orden).sort((a, b) => a - b)
  const nuevo = [...abajo, ...arriba]
  return nuevo
    .map((f, k) => ({ id: f.id, orden: huecos[k] }))
    .filter((c, k) => c.orden !== nuevo[k].orden)
}
