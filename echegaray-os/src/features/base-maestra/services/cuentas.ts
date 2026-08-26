// LOS CONTADORES DE LA BANDA DE NIVEL 3 — tres `count` sin filas, no tres lecturas.
//
// El canónico pone un número al lado de cada solapa. Se piden con `head: true`, así que la base
// devuelve el conteo y CERO filas: es lo más barato que se puede pedir y lo hace en la misma tanda
// que el resto de la pantalla.
//
// ═══ DOS SOLAPAS NO LLEVAN NÚMERO, Y ES A PROPÓSITO ═══
//
// «Mano de obra» muestra las categorías de la ESCALA VIGENTE del convenio y «Versiones de precio»
// las tandas (fecha, fuente) de `recurso_precio`: ninguno de los dos es el `count` de una tabla —el
// primero exige resolver qué vigencia rige hoy, el segundo agrupar la tabla entera—. Poner el count
// de `categoria_obra` o de `recurso_precio` en su lugar sería un número parecido y falso. Sin
// número es lo que hace la barra cuando la fuente no se puede contar barato.
//
// UN ERROR DE CONTEO DEVUELVE NULL, NO CERO: «Recursos 0» mandaría a alguien a cargar 409 recursos
// que están cargados.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { FilaRecursoSenal, FilaTareaSenal } from './senalesBaseMaestra.ts'

export type CuentasBaseMaestra = {
  tareas: number | null
  recursos: number | null
  plantillas: number | null
  /**
   * SÓLO `costo_base`, de los recursos activos: es lo que alimenta la señal «recursos sin precio»
   * de la primera línea (`senalesBaseMaestra`). `null` = la lectura falló, y eso NO es cero.
   *
   * Se trae la columna en vez de contarla porque no hay forma de pedirle a PostgREST «cuántos
   * activos NO tienen precio»: el precio vive en otra tabla y `recurso_costo` es la vista que ya
   * los junta. Son 409 filas de una columna — más barato que los tres `count` de arriba juntos, y
   * sirve a las dos sub-vistas sin que ninguna tenga que leer la cartera entera.
   */
  precios: FilaRecursoSenal[] | null
  /**
   * Qué tareas tipo activas tienen análisis vigente — la materia prima de la señal «tareas tipo sin
   * análisis». Se arma cruzando dos lecturas de UNA columna cada una: `tarea_tipo.id` de las
   * activas y `analisis_costo.tarea_tipo_id` de las vigentes. Es el MISMO cruce que hace
   * `getTareasTipo` para llenar `analisis_id`, así que las dos sub-vistas dicen el mismo número.
   *
   * `null` = alguna de las dos lecturas falló, y eso NO es «ninguna sin análisis».
   */
  analisis: FilaTareaSenal[] | null
}

export async function getCuentasBaseMaestra(supabase: SupabaseClient): Promise<CuentasBaseMaestra> {
  const [tareas, recursos, plantillas, precios, activas, vigentes] = await Promise.all([
    supabase.from('tarea_tipo').select('id', { count: 'exact', head: true }).eq('activo', true),
    supabase.from('recurso').select('id', { count: 'exact', head: true }).eq('activo', true),
    supabase.from('plantilla_secuencia').select('id', { count: 'exact', head: true }),
    supabase.from('recurso_costo').select('costo_base').eq('activo', true),
    supabase.from('tarea_tipo').select('id').eq('activo', true),
    supabase.from('analisis_costo').select('tarea_tipo_id, analisis_id').eq('vigente', true),
  ])
  const conAnalisis = new Map<string, string>()
  for (const c of (vigentes.data ?? []) as { tarea_tipo_id: string; analisis_id: string }[]) {
    conAnalisis.set(String(c.tarea_tipo_id), String(c.analisis_id))
  }
  return {
    tareas: tareas.error ? null : tareas.count,
    recursos: recursos.error ? null : recursos.count,
    plantillas: plantillas.error ? null : plantillas.count,
    precios: precios.error ? null : ((precios.data ?? []) as { costo_base: number | null }[]),
    analisis: activas.error || vigentes.error
      ? null
      : ((activas.data ?? []) as { id: string }[]).map((t) => ({
          analisis_id: conAnalisis.get(String(t.id)) ?? null,
        })),
  }
}

/** Sólo los tres números de la banda de nivel 3: lo demás es materia prima de las señales. */
export function contadores(c: CuentasBaseMaestra) {
  return { tareas: c.tareas, recursos: c.recursos, plantillas: c.plantillas }
}
