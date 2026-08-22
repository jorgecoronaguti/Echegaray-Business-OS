'use server'

// CUADRILLAS — las acciones que escriben.
//
// ═══ MOVER A ALGUIEN DE CUADRILLA NO ES UN UPDATE ═══
//
// El dueño: *"Una persona NO pertenece eternamente a una cuadrilla: los cambios conservan historial
// por asignaciones/vigencias."* Cambiar `cuadrilla_id` en la fila existente borraría el pasado. Lo
// que se hace es CERRAR el período abierto con `hasta` y ABRIR uno nuevo. El índice único
// `cuadrilla_integrante_una_vigente` es lo que garantiza que no queden dos abiertos: si el cierre
// falla, el alta rebota con 23505 y no queda a medio hacer.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import type { Resultado } from './personasActions'

const RUTA = '/administracion/personas/cuadrillas'

const cuadrillaSchema = z.object({
  nombre: z.string().trim().min(1, 'La cuadrilla necesita un nombre'),
  responsable_id: z.union([z.string().uuid(), z.literal('')]).optional(),
  notas: z.string().trim().optional(),
})

const uuidOpcional = (x: string | undefined) => (x && x.trim() ? x.trim() : null)

export async function crearCuadrilla(form: FormData): Promise<Resultado> {
  const parsed = cuadrillaSchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const d = parsed.data

  const supabase = await createClient()
  const { data, error } = await supabase.from('cuadrilla')
    .insert({ nombre: d.nombre, responsable_id: uuidOpcional(d.responsable_id), notas: d.notas || null })
    .select('id').single()
  if (error) {
    return { ok: false, error: error.code === '23505' ? 'Ya existe una cuadrilla con ese nombre.' : error.message }
  }
  revalidatePath(RUTA)
  return { ok: true, id: data.id as string }
}

export async function editarCuadrilla(cuadrillaId: string, form: FormData): Promise<Resultado> {
  const parsed = cuadrillaSchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const d = parsed.data

  const supabase = await createClient()
  const { error } = await supabase.from('cuadrilla')
    .update({ nombre: d.nombre, responsable_id: uuidOpcional(d.responsable_id), notas: d.notas || null })
    .eq('id', cuadrillaId)
  if (error) {
    return { ok: false, error: error.code === '23505' ? 'Ya existe una cuadrilla con ese nombre.' : error.message }
  }
  revalidatePath(RUTA)
  return { ok: true }
}

/** Archivar: la cuadrilla sale de las listas operativas y su historial queda. No se borra, porque
 *  las asignaciones a obra ya cargadas la siguen referenciando. */
export async function archivarCuadrilla(cuadrillaId: string, activa: boolean): Promise<Resultado> {
  const supabase = await createClient()
  const { error } = await supabase.from('cuadrilla').update({ activa }).eq('id', cuadrillaId)
  if (error) return { ok: false, error: error.message }
  revalidatePath(RUTA)
  return { ok: true }
}

const integranteSchema = z.object({
  persona_id: z.string().uuid('Elegí una persona del plantel'),
  desde: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida'), z.literal('')]).optional(),
})

/**
 * Sumar a alguien a la cuadrilla. Si venía de otra, esa pertenencia se CIERRA primero con el día
 * anterior: dos períodos abiertos para la misma persona los rechaza el índice único, y con razón —
 * la columna CUADRILLA del listado no sabría cuál de los dos mostrar.
 */
export async function agregarIntegrante(cuadrillaId: string, form: FormData): Promise<Resultado> {
  const parsed = integranteSchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const desde = parsed.data.desde || new Date().toISOString().slice(0, 10)
  const supabase = await createClient()

  const cierre = new Date(`${desde}T00:00:00Z`)
  cierre.setUTCDate(cierre.getUTCDate() - 1)
  const { error: errorCierre } = await supabase.from('cuadrilla_integrante')
    .update({ hasta: cierre.toISOString().slice(0, 10) })
    .eq('persona_id', parsed.data.persona_id).is('hasta', null)
  if (errorCierre) return { ok: false, error: errorCierre.message }

  const { error } = await supabase.from('cuadrilla_integrante')
    .insert({ cuadrilla_id: cuadrillaId, persona_id: parsed.data.persona_id, desde })
  if (error) {
    return {
      ok: false,
      error: error.code === '23514'
        ? 'La fecha de alta es anterior al período que se estaba cerrando. Elegí una fecha posterior.'
        : error.message,
    }
  }
  revalidatePath(RUTA)
  revalidatePath('/administracion/personas')
  return { ok: true }
}

const asignacionSchema = z.object({
  cuadrilla_id: z.string().uuid('Elegí a qué cuadrilla la mandás'),
})

/**
 * ASIGNAR DESDE EL POOL «Sin cuadrilla». La cuadrilla la elige quien asigna —por eso viaja en el
 * formulario y no atada en el `bind`— y el resto lo hace `agregarIntegrante`, sin copiar una línea:
 * cerrar el período anterior y abrir el nuevo es UNA regla, y tenerla dos veces garantiza que un día
 * una de las dos deje de cerrar el período viejo y queden dos cuadrillas vigentes para la misma
 * persona.
 */
export async function asignarACuadrilla(form: FormData): Promise<Resultado> {
  const parsed = asignacionSchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  return agregarIntegrante(parsed.data.cuadrilla_id, form)
}

/** Sacar a alguien: se cierra el período con la fecha de hoy. La fila NO se borra — es el historial
 *  de quién estuvo en esta cuadrilla, y es lo que respalda las horas cargadas en ese tiempo. */
export async function quitarIntegrante(integranteId: string): Promise<Resultado> {
  const supabase = await createClient()
  const { error } = await supabase.from('cuadrilla_integrante')
    .update({ hasta: new Date().toISOString().slice(0, 10) })
    .eq('id', integranteId).is('hasta', null)
  if (error) return { ok: false, error: error.message }
  revalidatePath(RUTA)
  revalidatePath('/administracion/personas')
  return { ok: true }
}
