import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUsuarioActual } from '@/features/auth/services/authService'
import { getPerfilPropio } from '@/features/mi-cuenta/services/miCuentaService'
import { destinoDeVuelta, personaDePor, sufijoDeVuelta } from './logica'

// LO QUE TODA PANTALLA DEL MÓDULO NECESITA ANTES DE LEER: quién es, qué persona es, y adónde vuelve.
//
// Sin persona vinculada no hay «mi efectivo»: las entregas se hacen a una PERSONA, no a un usuario.
// La pantalla lo dice (`SinVinculo`) en vez de mostrar un vacío que se lee como «no tenés nada».

export interface ContextoEfectivo {
  supabase: Awaited<ReturnType<typeof createClient>>
  uid: string
  /** La persona cuyo efectivo se mira: la propia, o —si es Dirección/Administración y vino `por=`— la de otro. */
  personaId: string | null
  /** True cuando se actúa A NOMBRE de otra persona: los textos dejan de decir «tu». */
  porOtro: boolean
  vinculoDisponible: boolean
  /** `desde=obra&obra=…` o vacío: se pega a cada enlace entre pantallas del módulo. */
  sufijo: string
  /** Adónde vuelve la flecha de ESTA pantalla cuando es una del medio (firmar, rendir, …). */
  volverA: string
}

export async function contextoEfectivo(params: { desde?: string; obra?: string; por?: string }): Promise<ContextoEfectivo> {
  const supabase = await createClient()
  const user = await getUsuarioActual(supabase)
  if (!user) redirect('/login')
  const perfil = await getPerfilPropio(supabase, user.id)
  // `por=` sólo se honra si la base confirma `ve_economia()`: es la misma puerta que aplican las funciones de
  // rendir/confirmar (20260930T2200). Para cualquier otro nivel el parámetro se ignora, y la pantalla muestra lo
  // propio: ni siquiera se insinúa que existe un «por otro». Un Jefe de obra no pasa (es_administracion ≠ ve_economia).
  const por = personaDePor(params.por)
  const { data: puede } = por ? await supabase.rpc('ve_economia') : { data: false }
  const actuaPor = por && puede === true ? por : null
  return {
    supabase,
    uid: user.id,
    personaId: actuaPor ?? perfil.data?.persona_id ?? null,
    porOtro: actuaPor !== null && actuaPor !== (perfil.data?.persona_id ?? null),
    vinculoDisponible: perfil.data?.vinculoDisponible !== false,
    sufijo: sufijoDeVuelta(params.desde, params.obra, actuaPor),
    volverA: destinoDeVuelta(params.desde, params.obra, actuaPor),
  }
}
