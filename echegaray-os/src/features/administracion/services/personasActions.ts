'use server'

// PERSONAS — las acciones que ESCRIBEN el legajo.
//
// El permiso lo decide la RLS de Postgres, no esta capa: desde el 19/08/2026 `personas` sólo admite
// lectura y escritura de dirección y administración. Si alguien más lo intenta, la base responde y
// el error se muestra tal cual — no se simula un éxito ni se traduce a "algo salió mal".

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

export type Resultado = { ok: true; id?: string } | { ok: false; error: string }

/** Un documento es su serie de dígitos, igual que el CUIT: con puntos y sin puntos es el mismo. */
const soloDigitos = z.string().trim().transform((v) => v.replace(/\D/g, ''))

const personaSchema = z.object({
  nombre_completo: z.string().trim().min(3, 'El nombre completo es obligatorio'),
  dni: soloDigitos.refine((v) => v === '' || (v.length >= 7 && v.length <= 8), 'El DNI tiene 7 u 8 dígitos').optional(),
  cuil: soloDigitos.refine((v) => v === '' || v.length === 11, 'El CUIL tiene 11 dígitos').optional(),
  // La categoría se acepta libre a propósito: hay tres personas con códigos mal importados y
  // rechazarlos impediría abrir su ficha para corregirlos. La pantalla ofrece las de convenio.
  categoria: z.string().trim().optional(),
  especialidad: z.string().trim().optional(),
  fecha_ingreso: z.string().trim().optional(),
  notas: z.string().trim().optional(),
})

/** Una fecha vacía es `null`, no la cadena vacía: Postgres rechaza '' como date y el error que
 *  devuelve ("invalid input syntax for type date") no le dice nada a quien está cargando. */
const fecha = (v: string | undefined) => (v && v.trim() ? v.trim() : null)
const texto = (v: string | undefined) => (v && v.trim() ? v.trim() : null)

export async function crearPersona(form: FormData): Promise<Resultado> {
  const parsed = personaSchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const d = parsed.data

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('personas')
    .insert({
      nombre_completo: d.nombre_completo,
      dni: texto(d.dni),
      cuil: texto(d.cuil),
      categoria: texto(d.categoria),
      especialidad: texto(d.especialidad),
      fecha_ingreso: fecha(d.fecha_ingreso),
      notas: texto(d.notas),
    })
    .select('id')
    .single()
  if (error) return { ok: false, error: error.message }
  revalidatePath('/administracion/personas')
  return { ok: true, id: data.id as string }
}

export async function editarPersona(personaId: string, form: FormData): Promise<Resultado> {
  const parsed = personaSchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const d = parsed.data

  const supabase = await createClient()
  const { error } = await supabase
    .from('personas')
    .update({
      nombre_completo: d.nombre_completo,
      dni: texto(d.dni),
      cuil: texto(d.cuil),
      categoria: texto(d.categoria),
      especialidad: texto(d.especialidad),
      fecha_ingreso: fecha(d.fecha_ingreso),
      notas: texto(d.notas),
    })
    .eq('id', personaId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/administracion/personas')
  return { ok: true }
}

/**
 * Dar de baja del plantel: se escribe la FECHA de egreso, no una bandera.
 *
 * `fecha_egreso` ya es lo que decide quién está disponible para asignar a una obra
 * (`personalService.getPersonas` filtra por `is null`). Agregar un `activo` al lado daría dos
 * verdades sobre el mismo hecho, y el día que se contradigan no habría forma de saber cuál manda.
 *
 * Sin fecha explícita se usa hoy: es el caso normal —alguien avisa que se fue— y obligar a tipear
 * la fecha del día sólo agrega una forma de equivocarse.
 */
export async function darDeBaja(personaId: string, fechaEgreso?: string | null): Promise<Resultado> {
  const supabase = await createClient()
  const valor = fechaEgreso?.trim() ? fechaEgreso.trim() : new Date().toISOString().slice(0, 10)
  const { error } = await supabase.from('personas').update({ fecha_egreso: valor }).eq('id', personaId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/administracion/personas')
  return { ok: true }
}

/** Reincorporar: se borra la fecha de egreso. La historia de asignaciones queda intacta. */
export async function reincorporar(personaId: string): Promise<Resultado> {
  const supabase = await createClient()
  const { error } = await supabase.from('personas').update({ fecha_egreso: null }).eq('id', personaId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/administracion/personas')
  return { ok: true }
}
