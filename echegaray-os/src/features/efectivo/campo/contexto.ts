import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUsuarioActual } from '@/features/auth/services/authService'
import { getPerfilPropio } from '@/features/mi-cuenta/services/miCuentaService'
import { destinoDeVuelta, sufijoDeVuelta } from './logica'

// LO QUE TODA PANTALLA DEL MÓDULO NECESITA ANTES DE LEER: quién es, qué persona es, y adónde vuelve.
//
// Sin persona vinculada no hay «mi efectivo»: las entregas se hacen a una PERSONA, no a un usuario.
// La pantalla lo dice (`SinVinculo`) en vez de mostrar un vacío que se lee como «no tenés nada».

export interface ContextoEfectivo {
  supabase: Awaited<ReturnType<typeof createClient>>
  uid: string
  personaId: string | null
  vinculoDisponible: boolean
  /** `desde=obra&obra=…` o vacío: se pega a cada enlace entre pantallas del módulo. */
  sufijo: string
  /** Adónde vuelve la flecha de ESTA pantalla cuando es una del medio (firmar, rendir, …). */
  volverA: string
}

export async function contextoEfectivo(params: { desde?: string; obra?: string }): Promise<ContextoEfectivo> {
  const supabase = await createClient()
  const user = await getUsuarioActual(supabase)
  if (!user) redirect('/login')
  const perfil = await getPerfilPropio(supabase, user.id)
  return {
    supabase,
    uid: user.id,
    personaId: perfil.data?.persona_id ?? null,
    vinculoDisponible: perfil.data?.vinculoDisponible !== false,
    sufijo: sufijoDeVuelta(params.desde, params.obra),
    volverA: destinoDeVuelta(params.desde, params.obra),
  }
}
