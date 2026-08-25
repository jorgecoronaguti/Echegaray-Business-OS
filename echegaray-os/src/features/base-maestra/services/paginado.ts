// LEER UNA TABLA ENTERA SIN QUE POSTGREST LA CORTE EN SILENCIO.
//
// PostgREST tapa cualquier respuesta en 1.000 filas y NO devuelve error: la mitad de la tabla
// simplemente no llega. `analisis_linea` ya pasa ese tope, y una respuesta cortada haría que las
// tareas del final de la lista aparecieran sin composición —exactamente igual que una tarea sin
// análisis cargado—. Ese es el defecto que este módulo existe para impedir.
//
// Es el mismo patrón que `administracion/services/imputacionService`, con una diferencia: acá el
// error se DEVUELVE en vez de lanzarse, porque quien llama tiene que poder distinguir «no se pudo
// contar» de «contó cero» y decidir qué dibujar.

import type { SupabaseClient } from '@supabase/supabase-js'

export type Fila = Record<string, unknown>

const PAGINA = 1000
/** Tope duro: 30.000 filas. Sin él, una respuesta que siempre viene llena cicla para siempre. */
const MAX_PAGINAS = 30

export async function traerTodo(
  supabase: SupabaseClient, tabla: string, columnas: string,
): Promise<{ filas: Fila[]; error: string | null }> {
  const filas: Fila[] = []
  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    const desde = pagina * PAGINA
    const { data, error } = await supabase.from(tabla).select(columnas).range(desde, desde + PAGINA - 1)
    if (error) return { filas, error: error.message }
    const lote = (data ?? []) as unknown as Fila[]
    filas.push(...lote)
    if (lote.length < PAGINA) break
  }
  return { filas, error: null }
}
