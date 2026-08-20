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

/** La coma como decimal: en un teclado en español es lo que sale. */
function aNumero(v: string): number | null {
  const s = limpiar(v).replace(/\./g, '').replace(',', '.')
  if (!s) return null
  const n = Number(s)
  return Number.isFinite(n) && n > 0 ? n : null
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
  const antes = new Map(actuales.map((a) => [a.id, a]))
  const propuesto = new Map<string, { unidad?: string | null; cantidad?: number | null }>()

  for (const [clave, valor] of entradas) {
    const m = CLAVE.exec(clave)
    if (!m || typeof valor !== 'string') continue
    const id = m[2].toLowerCase()
    const fila = propuesto.get(id) ?? {}
    if (m[1].toLowerCase() === 'unidad') fila.unidad = limpiar(valor) || null
    else fila.cantidad = aNumero(valor)
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
  return cambios
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
