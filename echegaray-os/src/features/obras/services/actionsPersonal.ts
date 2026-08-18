'use server'

// PERSONAL DE OBRA — las acciones que ESCRIBEN sobre `obra_asignacion`.
//
// Una asignación es un VÍNCULO, no una persona: quitarla saca a alguien de la obra y no toca su
// legajo. Por eso ésta es la única entidad del módulo que sí se borra —no se archiva—: el archivo
// de una asignación terminada es la fecha `hasta`, y una asignación cargada por error no tiene
// historia que preservar.
//
// El rol lo decide la RLS: `obra_asignacion` sólo admite escritura de dirección, administración y
// jefe de obra. Si alguien más lo intenta, la base rechaza y el error se muestra tal cual.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import type { Resultado } from './actions'

const asignacionSchema = z.object({
  persona_id: z.string().uuid('Elegí una persona del plantel'),
  rol: z.enum(['responsable', 'integrante']).optional(),
  cuadrilla: z.string().trim().optional(),
  // La actividad es opcional a propósito: la mayoría del plantel se asigna a la obra entera, y
  // exigir una actividad obligaría a inventar una.
  actividad_id: z.union([z.string().uuid(), z.literal('')]).optional(),
  desde: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida'), z.literal('')]).optional(),
  notas: z.string().trim().optional(),
})

export async function asignarPersona(obraId: string, form: FormData): Promise<Resultado> {
  const parsed = asignacionSchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const d = parsed.data
  const supabase = await createClient()

  const { error } = await supabase.from('obra_asignacion').insert({
    obra_id: obraId,
    persona_id: d.persona_id,
    rol: d.rol ?? 'integrante',
    cuadrilla: d.cuadrilla || null,
    actividad_id: d.actividad_id || null,
    desde: d.desde || null,
    notas: d.notas || null,
  })
  // El índice único `obra_asignacion_unica` es el que impide asignar dos veces a la misma persona a
  // lo mismo. Se traduce, porque "duplicate key value violates unique constraint" no le dice nada a
  // un jefe de obra.
  if (error) {
    return {
      ok: false,
      error: error.code === '23505'
        ? 'Esa persona ya está asignada a esta obra (o a esa misma actividad).'
        : error.message,
    }
  }
  revalidatePath(`/obras/${obraId}`)
  return { ok: true }
}

export async function quitarAsignacion(obraId: string, asignacionId: string): Promise<Resultado> {
  const supabase = await createClient()
  // El `eq('obra_id')` no sobra: sin él, un id de otra obra borraría una asignación ajena.
  const { error } = await supabase.from('obra_asignacion').delete().eq('id', asignacionId).eq('obra_id', obraId)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/obras/${obraId}`)
  return { ok: true }
}
