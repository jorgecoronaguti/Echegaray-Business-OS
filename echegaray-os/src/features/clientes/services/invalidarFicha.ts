// DESPUÉS DE ESCRIBIR, LA FICHA CACHEADA DEJA DE SERVIRSE.
//
// Desde 20260913T1500 Dirección lee la ficha del cliente de `ficha_cliente_cache`. Sin esta llamada,
// quien agrega una nota o corrige un monto vuelve a la ficha y NO ve lo que acaba de escribir durante
// hasta diez minutos: el guardado parece haber fallado y lo carga de nuevo. `revalidatePath` no
// alcanza — limpia la caché de Next, no la de la base.
//
// La RPC BORRA la fila: el próximo pedido calcula en vivo (lo que pasaba antes de la caché) y el cron
// la repone en menos de un minuto.

import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * `clienteId: null` = todas las fichas: las acciones de obra no saben de qué cliente es la obra, y
 * buscarlo sería otro viaje para ahorrar un recálculo.
 *
 * NO DEVUELVE ERROR A LA ACCIÓN, y es a propósito: la escritura ya ocurrió. Contestar «no se pudo»
 * por una invalidación fallida haría que se cargue dos veces lo que ya está guardado. El costo de
 * fallar acá está acotado —la fila vence sola a los diez minutos y la pantalla dice de cuándo es—, y
 * se deja en el log.
 */
export async function invalidarFichaCliente(
  supabase: SupabaseClient, clienteId: string | null,
): Promise<void> {
  const { error } = await supabase.rpc('invalidar_ficha_cliente_cache', { p_cliente_id: clienteId })
  if (error) console.error(`invalidar_ficha_cliente_cache (${clienteId ?? 'todas'}): ${error.message}`)
}
