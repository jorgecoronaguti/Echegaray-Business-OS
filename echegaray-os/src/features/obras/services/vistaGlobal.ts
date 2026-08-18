// EL CONTEXTO QUE COMPARTEN LAS CINCO VISTAS GLOBALES DE `/obras/…`.
//
// Las cinco necesitan lo mismo: cómo se llama cada obra (para la columna «Obra» y para el filtro) y
// si quien mira es Administración (para no ofrecer una lista que la base va a devolver vacía). Se
// resuelve UNA vez acá y no cinco veces en cinco páginas, porque cinco copias del mismo preámbulo
// es donde una pantalla empieza a llamar a las obras distinto que la de al lado.
//
// ═══ LOS NOMBRES SALEN DE `obra_panel`, LA MISMA FUENTE QUE EL PORTAFOLIO ═══
//
// No de `obra_canonica` cruda, y no es un detalle: `obra_panel` enmascara `monto_contratado` para
// el nivel Obras (`20260819T0400_economia_comercial_solo_administracion.sql`). Leer la tabla cruda
// para "sólo sacar el nombre" es exactamente cómo se vuelve a filtrar un dato comercial que ya
// estaba cerrado.
//
// QUÉ OBRAS VUELVEN LO DECIDE EL RLS. Acá no hay un solo `if` sobre qué obras ve el usuario.

import type { SupabaseClient } from '@supabase/supabase-js'
import { getPortafolio } from './obrasService'

export interface ContextoGlobal {
  /** Las obras de la cartera, para el filtro. Las archivadas quedan afuera, igual que en el portafolio. */
  obras: { id: string; nombre: string }[]
  /** Cómo se llama cada obra, incluidas las archivadas: una fila suya sigue teniendo que decir de quién es. */
  nombreDeObra: Map<string, string>
  error: string | null
}

export async function getContextoGlobal(supabase: SupabaseClient): Promise<ContextoGlobal> {
  // NO SE LEE EL PERFIL. Estas cinco pantallas no toman una sola decisión por rol: qué obras
  // vuelven y qué columnas traen lo decide el RLS —incluido el contrato, que `obra_panel` enmascara
  // con una función `security definer`—. Un `esAdmin` acá sería una segunda definición del permiso,
  // y la de TypeScript no protege la llamada directa a PostgREST.
  const { data, error } = await getPortafolio(supabase)
  const todas = data ?? []
  return {
    obras: todas
      .filter((o) => o.estado !== 'cerrada')
      .map((o) => ({ id: o.obra_id, nombre: o.nombre })),
    nombreDeObra: new Map(todas.map((o) => [o.obra_id, o.nombre])),
    error,
  }
}

/** El enlace a la solapa equivalente de la obra. Una sola forma de armarlo para las cinco vistas. */
export const hrefObra = (obraId: string, vista: string, sub?: string) =>
  `/obras/${obraId}?vista=${vista}${sub ? `&sub=${sub}` : ''}`
