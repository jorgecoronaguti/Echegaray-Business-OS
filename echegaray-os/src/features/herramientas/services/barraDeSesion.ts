// LA BARRA DE ABAJO DEL NIVEL EN LAS PANTALLAS DE HERRAMIENTAS DEL TELÉFONO (regla del 24/09: una sola barra
// por nivel en todo el teléfono; revisión por nivel del 25/09). Qué destinos ve cada rol lo decide
// `barraTelefonoDe`, puro y probado: acá sólo se lee el rol de la sesión.
import { createClient } from '@/lib/supabase/server'
import { getPerfilActual } from '@/features/auth/services/authService'
import { barraTelefonoDe, type ItemBarraTelefono } from '@/features/auth/types/barraTelefono'

export async function barraDeSesion(): Promise<ItemBarraTelefono[]> {
  try {
    const supabase = await createClient()
    const perfil = await getPerfilActual(supabase)
    return barraTelefonoDe(perfil.data?.rol ?? null)
  } catch {
    return []
  }
}
