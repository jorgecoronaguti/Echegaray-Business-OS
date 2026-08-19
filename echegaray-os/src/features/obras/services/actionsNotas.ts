'use server'

// NOTAS DE ACTIVIDAD — texto, autor y fecha. Nada más.
//
// NO ES UN SISTEMA DE COLABORACIÓN: sin hilos, sin menciones, sin edición. Una nota que hay que
// corregir se borra y se escribe otra; el registro de lo que se dijo vale más que la prolijidad.
//
// Y NO DUPLICA EL COMENTARIO DE UNA JORNADA: eso vive en el parte (`obra_ejecucion.comentario`) y se
// lee en «Ejecución reciente». Copiarlo acá daría dos versiones del mismo dicho.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import type { Resultado } from './actions'

const notaSchema = z.object({
  texto: z.string().trim().min(2, 'Escribí la nota').max(1000),
})

export async function agregarNota(obraId: string, actividadId: string, form: FormData): Promise<Resultado> {
  const parsed = notaSchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

  const supabase = await createClient()
  // La actividad tiene que ser DE ESTA OBRA: el id viaja en el cliente, y sin esto una nota podría
  // colgarse del trabajo de la obra de al lado.
  const { data: act } = await supabase.from('obra_actividad')
    .select('id').eq('id', actividadId).eq('obra_id', obraId).maybeSingle()
  if (!act) return { ok: false, error: 'Esa actividad no es de esta obra.' }

  const { data: sesion } = await supabase.auth.getUser()
  const { error } = await supabase.from('obra_actividad_nota').insert({
    obra_id: obraId,
    actividad_id: actividadId,
    texto: parsed.data.texto,
    creado_por: sesion?.user?.id ?? null,
  })
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/obras/${obraId}`)
  return { ok: true, mensaje: 'Nota agregada.' }
}

/** Borrar la propia. La policy de la base es la que manda: acá sólo se traduce su negativa. */
export async function borrarNota(obraId: string, notaId: string): Promise<Resultado> {
  const supabase = await createClient()
  const { error, count } = await supabase.from('obra_actividad_nota')
    .delete({ count: 'exact' }).eq('id', notaId).eq('obra_id', obraId)
  if (error) return { ok: false, error: error.message }
  if (!count) return { ok: false, error: 'Esa nota la escribió otra persona.' }
  revalidatePath(`/obras/${obraId}`)
  return { ok: true, mensaje: 'Nota borrada.' }
}
