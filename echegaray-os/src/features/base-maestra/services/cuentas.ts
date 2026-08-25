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

export type CuentasBaseMaestra = {
  tareas: number | null
  recursos: number | null
  plantillas: number | null
}

export async function getCuentasBaseMaestra(supabase: SupabaseClient): Promise<CuentasBaseMaestra> {
  const [tareas, recursos, plantillas] = await Promise.all([
    supabase.from('tarea_tipo').select('id', { count: 'exact', head: true }).eq('activo', true),
    supabase.from('recurso').select('id', { count: 'exact', head: true }).eq('activo', true),
    supabase.from('plantilla_secuencia').select('id', { count: 'exact', head: true }),
  ])
  return {
    tareas: tareas.error ? null : tareas.count,
    recursos: recursos.error ? null : recursos.count,
    plantillas: plantillas.error ? null : plantillas.count,
  }
}
