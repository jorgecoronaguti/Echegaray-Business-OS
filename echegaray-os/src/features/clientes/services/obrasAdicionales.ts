// UN ADICIONAL SE DIBUJA DEBAJO DE SU OBRA MAYOR — la regla, suelta y sin Supabase.
//
// Dueño (11/09/2026): «hay obras cuyo nombre indica que es "adicional" y quiero que estén a un
// subnivel que se vea debajo de la obra mayor, por más que tengan OC distinta en individual».
//
// La relación vive en `obra_canonica.obra_padre_id` (migración 20260911T2000) y su evidencia —una
// por una, con el archivo de Drive o la celda del Sheet que la prueba— en
// `docs/engineering/OBRAS-ADICIONALES-2026-09-11.md`. Acá sólo se DIBUJA lo que la base dice.
//
// ═══ POR QUÉ ESTA REGLA NO VIVE EN EL COMPONENTE ═══
//
// La cartera de `/clientes` y la ficha del cliente dibujan la misma jerarquía en dos tablas
// distintas. Escrita dos veces, el día que una aprenda algo —un huérfano, un total— la otra va a
// decir otra cosa sobre las mismas obras, que es exactamente el defecto que el módulo Clientes ya
// pagó con el contratado. Y suelta se puede probar sin montar una pantalla.

/** Lo mínimo que hace falta para ubicar una obra en el árbol. */
export interface ObraConPadre {
  obra_id: string
  /** La obra mayor de la que es adicional. `null`/ausente = no es adicional de ninguna. */
  obra_padre_id?: string | null
}

/** El rótulo de la fila hija. Una sola definición: lo escriben las dos tablas. */
export const ROTULO_ADICIONAL = 'adicional'

/**
 * LO QUE DICE UN ADICIONAL CUYA OBRA MAYOR NO ESTÁ EN LA LISTA.
 *
 * Pasa de verdad: `bsa-adicional` está `cerrada` y su madre `messina-bsa` está `activa`, así que en
 * cualquier recorte por estado uno de los dos se queda afuera. La fila NO se esconde ni se dibuja
 * como si fuera una obra mayor: se dibuja arriba, marcada, diciendo que le falta la madre. Una obra
 * que desaparece de la lista de su cliente es peor defecto que una sangría mal puesta.
 */
export const SIN_OBRA_MAYOR = 'adicional · sin obra mayor a la vista'

export interface FilaDeObra<T> {
  obra: T
  /** `0` = obra mayor · `1` = adicional, dibujado con sangría debajo de su madre. */
  nivel: 0 | 1
  esAdicional: boolean
  /** `true` = es adicional pero su obra mayor no está en esta lista. Se dibuja en nivel 0. */
  huerfano: boolean
  /** Los adicionales que cuelgan de esta fila. Vacío en una fila hija. */
  hijos: T[]
}

/**
 * LA LISTA EN DOS NIVELES, conservando el orden en que llegó.
 *
 * Cada obra mayor queda seguida INMEDIATAMENTE por sus adicionales. El orden de entrada se respeta
 * —lo decide quien consulta (`orden`, `nombre`)— y esta función no reordena nada más que eso.
 *
 * GARANTÍA: toda obra de la entrada sale EXACTAMENTE UNA VEZ. El barrido final no es paranoia: una
 * relación que el trigger de la base no pudo rechazar (por ejemplo un padre que dejó de ser
 * visible) haría desaparecer filas, y el cliente vería menos trabajos de los que tiene.
 */
export function jerarquiaDeObras<T extends ObraConPadre>(obras: T[]): FilaDeObra<T>[] {
  const porId = new Map(obras.map((o) => [o.obra_id, o]))
  const esVisible = (o: T): string | null => {
    const p = o.obra_padre_id ?? null
    return p && p !== o.obra_id && porId.has(p) ? p : null
  }

  const hijosDe = new Map<string, T[]>()
  for (const o of obras) {
    const p = esVisible(o)
    if (p) hijosDe.set(p, [...(hijosDe.get(p) ?? []), o])
  }

  const filas: FilaDeObra<T>[] = []
  const puestas = new Set<string>()
  const poner = (fila: FilaDeObra<T>) => {
    if (puestas.has(fila.obra.obra_id)) return
    puestas.add(fila.obra.obra_id)
    filas.push(fila)
  }

  for (const o of obras) {
    if (esVisible(o)) continue // lo dibuja su madre, más abajo
    const hijos = hijosDe.get(o.obra_id) ?? []
    const adicional = !!(o.obra_padre_id ?? null)
    poner({ obra: o, nivel: 0, esAdicional: adicional, huerfano: adicional, hijos })
    for (const h of hijos) poner({ obra: h, nivel: 1, esAdicional: true, huerfano: false, hijos: [] })
  }
  // EL BARRIDO: lo que no salió por ningún camino sale igual, en nivel 0 y marcado.
  for (const o of obras) {
    poner({ obra: o, nivel: 0, esAdicional: !!(o.obra_padre_id ?? null), huerfano: true, hijos: [] })
  }
  return filas
}

/**
 * EL RECORTE POR ESTADO, CON LOS ADICIONALES SIGUIENDO A SU MADRE.
 *
 * La ficha del cliente parte las obras en «en curso» y «terminados». Si el recorte se hiciera obra
 * por obra, un adicional `activa` con la madre `cerrada` —o al revés, que es el caso real de
 * `bsa-adicional`— aparecería en un grupo y su madre en el otro: el subnivel que el dueño pidió no
 * existiría en ninguna de las dos tablas.
 *
 * Manda el estado de la MADRE para decidir el grupo; la palabra que se ve en la columna Estado
 * sigue siendo la del hijo. Un adicional sin madre visible se recorta por su propio estado.
 */
export function recortarPorEstado<T extends ObraConPadre & { estado: string }>(
  obras: T[], estado: string,
): T[] {
  const porId = new Map(obras.map((o) => [o.obra_id, o]))
  const madreDe = (o: T): T => {
    const p = o.obra_padre_id ?? null
    const madre = p && p !== o.obra_id ? porId.get(p) : undefined
    return madre ?? o
  }
  return obras.filter((o) => madreDe(o).estado === estado)
}

/**
 * EL TOTAL CONSOLIDADO DE UNA OBRA MAYOR: lo suyo + sus adicionales.
 *
 * `propio` es lo que ya dibujaba la fila. `total` es la suma, y sólo existe cuando TODOS los
 * componentes tienen base: con un adicional sin precio, el consolidado sería más chico que la
 * realidad y se leería como un hecho. Ahí `total` queda en `null` y `sinPrecio` dice cuántos
 * faltan — la misma regla de «o suma completa, o nada» que ya usa el KPI de la ficha.
 *
 * SIN ADICIONALES, `total` ES `propio` (y `adicionales` es `null`, porque no hay ninguno). Es lo que
 * permite que la celda dibuje SIEMPRE `total`: la primera versión devolvía `null` cuando no había
 * hijos y la fila de un adicional —que no tiene hijos— se quedaba sin número.
 */
export interface Consolidado {
  propio: number | null
  /** La suma de los adicionales. `null` = no hay ninguno, o a alguno le falta el precio. */
  adicionales: number | null
  total: number | null
  /** Cuántos adicionales cuelgan de esta obra. */
  n: number
  /** Cuántos de ellos no tienen base contractual. */
  sinPrecio: number
}

export function consolidar<T>(fila: FilaDeObra<T>, base: (o: T) => number | null): Consolidado {
  const propio = base(fila.obra)
  const valores = fila.hijos.map(base)
  const sinPrecio = valores.filter((v) => v === null).length
  const adicionales = fila.hijos.length && sinPrecio === 0
    ? valores.reduce((a: number, v) => a + (v as number), 0)
    : null
  const total = propio === null || sinPrecio > 0 ? null : propio + (adicionales ?? 0)
  return { propio, adicionales, total, n: fila.hijos.length, sinPrecio }
}

/**
 * LA SUMA DE LA LISTA, SIN CONTAR NINGUNA OBRA DOS VECES.
 *
 * Es la cuenta que se rompe sola cuando la obra mayor empieza a publicar el consolidado: sumar la
 * columna tal como se ve daría madre+adicional EN LA MADRE y otra vez el adicional en su propia
 * fila. Acá cada obra entra UNA vez, por su `propio`.
 *
 * `total` en `null` = a alguna obra le falta la base, y entonces no hay total que publicar (la ficha
 * escribe qué falta en vez de una suma parcial disfrazada de total).
 *
 * SE SUMA `f.obra` Y NUNCA `f.hijos`: cada obra de la entrada sale como UNA fila de la jerarquía —el
 * adicional tiene la suya, en nivel 1—, así que recorrer también los `hijos` de la madre contaría el
 * adicional dos veces. Así estaba escrita la primera versión de esta función y el test la puso roja
 * por $10.000.000 sobre Messina.
 */
export function sumaSinDobleConteo<T>(
  filas: FilaDeObra<T>[], base: (o: T) => number | null,
): { total: number | null; faltan: number } {
  const valores = filas.map((f) => base(f.obra))
  const faltan = valores.filter((v) => v === null).length
  return {
    total: valores.length && faltan === 0
      ? valores.reduce((a: number, v) => a + (v as number), 0)
      : null,
    faltan,
  }
}
