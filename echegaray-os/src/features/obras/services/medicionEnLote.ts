import { leerNumeroEsAR } from '../../../shared/lib/numeroEsAR.ts'

// LA MEDICIÓN DE MUCHAS ACTIVIDADES DE UNA VEZ — el parser, separado de quien escribe.
//
// Ponerle unidad y cantidad objetivo a cuarenta actividades de a una, abriendo el panel cada vez,
// son cuarenta idas y vueltas al servidor. En la Lista se cargan todas y se guarda una vez.
//
// ═══ SÓLO LO QUE CAMBIÓ ═══
//
// El formulario manda las cuarenta filas, cambiadas o no. Escribir las cuarenta pisaría con el mismo
// valor lo que alguien acaba de corregir en otra pestaña, y dejaría cuarenta líneas de historial por
// un cambio. Se compara contra lo que había y se devuelven las diferencias.
//
// ═══ VACIAR ES UNA DECISIÓN, NO UN OLVIDO ═══
//
// Borrar el contenido de una celda que tenía valor SÍ es un cambio: significa «esto no va». Por eso
// el vacío viaja como `null` en vez de ignorarse — que es lo que haría imposible desmedir algo mal
// cargado.

// ═══ QUÉ TEXTO LLEGA, Y CON QUÉ SE LEE (auditoría, 18/09/2026) ═══
//
// El lector de antes sacaba TODOS los puntos antes de cambiar la coma: «8.5» se leía 85 y «12.50», 1250. Y la
// Lista que alimentaba esto (19–22/08/2026, retirada después) precargaba cada campo con `defaultValue` =
// el número de JavaScript: un objetivo de 12,5 se dibujaba «12.5». Guardar el lote SIN tocar esa fila lo
// leía 125, lo veía distinto y lo escribía: una reescritura ×10 silenciosa de una fila que nadie tocó.
//
// Dos lados, un solo contrato, los dos acá:
//   · LO QUE SE PRECARGA sale de `textoDeCantidad`: coma decimal, sin separador de miles («12,5», «1250,5»).
//   · LO QUE SE LEE pasa por `leerNumeroEsAR`: el punto con tres dígitos detrás separa miles, la coma los
//     decimales. «1.500» es mil quinientos; «12,5» es doce y medio.
// Con los dos lados atados, la fuente no es ambigua. Un test prueba la ida y vuelta: lo precargado, reenviado
// sin tocar, no es un cambio.
//
// LO ILEGIBLE NO VACÍA. «abc» antes se leía `null`, y `null` es «desmedir»: una fila con 180 quedaba sin
// medición por un tipeo. Ahora una cantidad que no se entiende se devuelve como ilegible y no se guarda nada.

const CLAVE = /^(unidad|cantidad)_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i

export interface MedicionDeFila {
  actividad_id: string
  unidad: string | null
  cantidad_objetivo: number | null
}

/** Lo que había, para poder comparar. */
export interface MedicionActual {
  id: string
  unidad: string | null
  cantidad_objetivo: number | null
}

const limpiar = (v: string) => v.trim()

/** Vacío = `null` («esto no se mide así»); un número positivo en es-AR; cualquier otra cosa, ilegible. */
function aNumero(v: string): number | null | 'ilegible' {
  if (!limpiar(v)) return null
  const l = leerNumeroEsAR(v)
  return l.ok && l.valor != null && l.valor > 0 ? l.valor : 'ilegible'
}

/** Cómo se precarga una cantidad en el campo: el MISMO formato que `aNumero` lee. Coma decimal, sin miles. */
export function textoDeCantidad(n: number | null | undefined): string {
  return n == null ? '' : String(n).replace('.', ',')
}

/** Una cantidad que no se entendió: cuál fila, y qué decía. */
export interface CantidadIlegible {
  actividad_id: string
  texto: string
}

/**
 * Las filas que CAMBIARON respecto de lo que había.
 *
 * `entradas` es el `FormData` entero; `actuales`, lo que la base tiene hoy. Una actividad que no
 * viene en el formulario no se toca: puede estar fuera del filtro que la persona tenía puesto.
 */
export function cambiosDeMedicion(
  entradas: Iterable<[string, FormDataEntryValue]>, actuales: MedicionActual[],
): MedicionDeFila[] {
  return leerMedicion(entradas, actuales).cambios
}

/**
 * Lo mismo que `cambiosDeMedicion`, más las cantidades que no se pudieron leer. Quien escribe tiene que
 * rechazar el lote entero si hay alguna: guardar las otras cuarenta en silencio dejaría a la persona creyendo
 * que cargó una que no entró.
 */
export function leerMedicion(
  entradas: Iterable<[string, FormDataEntryValue]>, actuales: MedicionActual[],
): { cambios: MedicionDeFila[]; ilegibles: CantidadIlegible[] } {
  const antes = new Map(actuales.map((a) => [a.id, a]))
  const propuesto = new Map<string, { unidad?: string | null; cantidad?: number | null }>()
  const ilegibles: CantidadIlegible[] = []

  for (const [clave, valor] of entradas) {
    const m = CLAVE.exec(clave)
    if (!m || typeof valor !== 'string') continue
    const id = m[2].toLowerCase()
    const fila = propuesto.get(id) ?? {}
    if (m[1].toLowerCase() === 'unidad') fila.unidad = limpiar(valor) || null
    else {
      const n = aNumero(valor)
      // ILEGIBLE: la cantidad de esa fila no se toca —ni se vacía— y se informa.
      if (n === 'ilegible') ilegibles.push({ actividad_id: id, texto: limpiar(valor) })
      else fila.cantidad = n
    }
    propuesto.set(id, fila)
  }

  const cambios: MedicionDeFila[] = []
  for (const [id, p] of propuesto) {
    const a = antes.get(id)
    if (!a) continue
    const unidad = p.unidad === undefined ? a.unidad : p.unidad
    const cantidad = p.cantidad === undefined ? a.cantidad_objetivo : p.cantidad
    // `NaN === NaN` es falso, así que comparar los nulos convertidos a número marcaba como cambio
    // toda fila que seguía sin cantidad. Los nulos se comparan como nulos.
    const mismaCantidad = cantidad == null || a.cantidad_objetivo == null
      ? cantidad == null && a.cantidad_objetivo == null
      : Number(cantidad) === Number(a.cantidad_objetivo)
    const igual = unidad === a.unidad && mismaCantidad
    if (!igual) cambios.push({ actividad_id: id, unidad, cantidad_objetivo: cantidad })
  }
  return { cambios, ilegibles }
}

/**
 * El método que le corresponde a una fila después de medirla.
 *
 * Cargar unidad Y objetivo es declarar que esa actividad se mide por producción: sin esto habría que
 * volver a entrar al panel de cada una para decirlo, y la carga masiva no serviría de nada. Sacarle
 * la medición la devuelve a declarar el avance a mano; dejarla en 'cantidad' sin objetivo la dejaría
 * sin avance calculable y con el CHECK de la base en contra.
 */
export function metodoTrasMedir(f: MedicionDeFila, metodoActual: string): string {
  if (f.unidad && f.cantidad_objetivo != null) return 'cantidad'
  return metodoActual === 'cantidad' ? 'manual' : metodoActual
}
