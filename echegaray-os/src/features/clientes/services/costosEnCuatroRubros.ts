// LO GASTADO EN CADA TRABAJO, EN LOS CUATRO RUBROS — la lectura que usan la ficha del cliente y la cartera.
//
// ═══ POR QUÉ UN VIAJE APARTE (auditoría 18/09/2026) ═══
//
// `pantalla_cliente` y `pantalla_clientes` traen `costo_obra` de `costo_de_obras_a_la_fecha`, y ésa la
// lee también el código PUBLICADO, que no conoce «otros». Cambiarla en la base antes de publicar dejó
// $ 22,6 M de costo invisibles en producción durante horas. Por eso la base guarda dos funciones con la
// MISMA regla de «a la fecha», el mismo IVA y la misma mano de obra:
//
//   costo_de_obras_a_la_fecha         tres rubros: la que lee lo publicado
//   costo_de_obras_a_la_fecha_rubros  cuatro rubros: la que lee esta rama
//
// Esta función pide la segunda para los mismos trabajos que ya trajo la pantalla. Si la pantalla no
// trajo costos (rol sin permiso o cara que no los dibuja), no se pide nada: `null` sigue siendo
// «no puedo decirlo». Si el viaje falla, también `null`: mezclar el mapa de tres rubros con una
// columna «Otros» vacía diría que el trabajo no tuvo otros costos, y no es cierto.
import type { SupabaseClient } from '@supabase/supabase-js'
import { armarCostosPorObra, type CostoDeObra } from './costosDeObra.ts'

export async function costosEnCuatroRubros(
  supabase: SupabaseClient, dePantalla: Map<string, CostoDeObra> | null,
): Promise<Map<string, CostoDeObra> | null> {
  if (dePantalla == null) return null
  if (dePantalla.size === 0) return dePantalla
  // SIN IVA NO: la ficha del cliente muestra lo pagado CON IVA (decisión del 17/09, con test), y lo dice
  // en el encabezado de la columna.
  const { data, error } = await supabase.rpc('costo_de_obras_a_la_fecha_rubros', {
    p_obras: [...dePantalla.keys()], p_desde: null, p_hasta: null, p_neto: false,
  })
  if (error || !Array.isArray(data)) return null
  return armarCostosPorObra(data)
}
