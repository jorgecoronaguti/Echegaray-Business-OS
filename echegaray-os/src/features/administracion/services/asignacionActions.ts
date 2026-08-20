'use server'

// CERRAR UNA ASIGNACIÓN DESDE LA FICHA DE LA PERSONA.
//
// Existe además de la de la obra (`features/obras/services/actionsPersonal.ts`) porque el guardia
// cambia de eje: allá la acción está atada a UNA obra y por eso filtra por `obra_id`; acá está atada
// a UNA persona, cuyas asignaciones pueden ser de varias obras, y el filtro que impide tocar una
// fila ajena es `persona_id`. Sin ese `eq`, un id copiado de otra ficha cerraría la asignación de
// otro. Las dos escriben la MISMA tabla y la RLS (`ve_obra`) sigue mandando por encima.
//
// CERRAR NO BORRA: escribe `hasta`. El período trabajado queda, y con él el respaldo de las horas
// que se imputaron mientras estuvo.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { Resultado } from './personasActions'

export async function cerrarAsignacionDePersona(
  personaId: string, asignacionId: string, hasta?: string | null,
): Promise<Resultado> {
  const supabase = await createClient()
  const valor = hasta?.trim() ? hasta.trim() : new Date().toISOString().slice(0, 10)
  const { error } = await supabase
    .from('obra_asignacion').update({ hasta: valor })
    .eq('id', asignacionId).eq('persona_id', personaId)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/administracion/personas/${personaId}`)
  revalidatePath('/administracion/personas')
  return { ok: true }
}
