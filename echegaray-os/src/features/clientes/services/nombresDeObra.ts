// EL NOMBRE DE UNA OBRA A PARTIR DE SU ID — una sola vez, para las tres pantallas 28/31/32.
//
// `certificado_cliente`, `esquema_pago` y `cliente_acceso` guardan `obra_id` (el id textual de
// `obra_canonica`) y NO el nombre: el nombre es de la obra, y duplicarlo en tres tablas garantiza
// que el día que se renombre una obra queden tres nombres distintos del mismo lugar.
//
// Se resuelve con UNA consulta por pantalla y un Map, no con un join embebido de PostgREST: el
// embebido obliga a nombrar la FK y se rompe callado cuando la FK cambia de nombre. Es el mismo
// patrón que ya usa `certificadosDe` en `clientesService`.

import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * `Map<obra_id, nombre>` de las obras pedidas. Ids vacíos ⇒ Map vacío y CERO consultas.
 *
 * Un id que no aparece en el resultado NO se completa con un texto de relleno: el que llama
 * devuelve `null`, que es «no se pudo resolver» y no «obra sin identificar» — un rótulo inventado
 * en una tabla de cobranzas se lee como si fuera el nombre real de una obra.
 */
export async function nombresDeObra(
  supabase: SupabaseClient,
  ids: (string | null)[],
): Promise<Map<string, string>> {
  const unicos = [...new Set(ids.filter((id): id is string => !!id))]
  if (!unicos.length) return new Map()
  const { data } = await supabase.from('obra_canonica').select('id, nombre').in('id', unicos)
  return new Map((data ?? []).map((o) => [o.id as string, o.nombre as string]))
}
