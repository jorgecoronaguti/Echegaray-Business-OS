import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

// DÓNDE ESTÁ HOY EL MOTOR INTERACTIVO DEL OS — la URL del túnel que publica `os-tunnel.sh` en
// `public.os_runtime.interactive_endpoint`.
//
// Hasta el 25/09/2026 las tres rutas que la usan (`/api/os/*`, `/api/oauth/start`, `/api/oauth/callback`)
// la leían con la clave ANÓNIMA, y por eso `os_runtime` era legible sin sesión: cualquiera con la clave
// pública (está en el JS del sitio) obtenía las URLs de los túneles del chat y del motor. Desde
// 20260926T0007 la tabla es sólo de Dirección y del servidor: esto la lee con la clave de servicio,
// del lado del servidor, y la URL nunca viaja al navegador.
export async function endpointInteractivo(): Promise<string | null> {
  try {
    const { data, error } = await createAdminClient()
      .from('os_runtime').select('value').eq('key', 'interactive_endpoint').maybeSingle()
    if (error) return null
    return (data as { value?: string } | null)?.value ?? null
  } catch {
    return null
  }
}
