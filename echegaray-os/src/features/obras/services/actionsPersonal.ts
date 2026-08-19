'use server'

// PERSONAL DE OBRA — las acciones que ESCRIBEN sobre `obra_asignacion`.
//
// `obra_asignacion` es LA relación canónica persona ↔ obra ↔ actividad. La lee la solapa Personal de
// la obra y la lee la ficha de la persona en Administración: dos pantallas, una sola tabla. Por eso
// no hay ningún campo "obra actual" guardado en `personas` ni en `cuadrilla` — se deriva de acá.
//
// ═══ CERRAR NO ES QUITAR, Y LA DIFERENCIA IMPORTA ═══
//
// CERRAR pone `hasta`: la persona dejó de trabajar en la obra ese día y el período queda escrito.
// Es lo que respalda las horas que imputó mientras estuvo. QUITAR borra la fila, y sólo existe para
// la asignación cargada por error, que no tiene historia que preservar. Si las dos hicieran lo
// mismo, cada rotación de plantel borraría el pasado de la obra.
//
// El rol lo decide la RLS: `obra_asignacion` sólo admite escritura de dirección, administración y
// jefe de obra, y siempre dentro de `ve_obra(obra_id)`.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import type { Resultado } from './actions'

const fechaOpcional = z.union([
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida'), z.literal(''),
]).optional()

const asignacionSchema = z.object({
  persona_id: z.string().uuid('Elegí una persona del plantel'),
  rol: z.enum(['responsable', 'integrante']).optional(),
  cuadrilla_id: z.union([z.string().uuid(), z.literal('')]).optional(),
  // La actividad es opcional a propósito: la mayoría del plantel se asigna a la obra entera, y
  // exigir una actividad obligaría a inventar una.
  actividad_id: z.union([z.string().uuid(), z.literal('')]).optional(),
  desde: fechaOpcional,
  hasta: fechaOpcional,
  notas: z.string().trim().max(300).optional(),
})

const YA_ASIGNADA = 'Esa persona ya está asignada a esta obra (o a esa misma actividad) y sigue vigente.'

export async function asignarPersona(obraId: string, form: FormData): Promise<Resultado> {
  const parsed = asignacionSchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const d = parsed.data
  const supabase = await createClient()

  const { error } = await supabase.from('obra_asignacion').insert({
    obra_id: obraId,
    persona_id: d.persona_id,
    rol: d.rol ?? 'integrante',
    cuadrilla_id: d.cuadrilla_id || null,
    actividad_id: d.actividad_id || null,
    desde: d.desde || null,
    hasta: d.hasta || null,
    notas: d.notas || null,
  })
  // ═══ EL ÚNICO AHORA ES SOBRE LA ASIGNACIÓN **VIGENTE** (19/08/2026) ═══
  //
  // Antes el índice miraba (obra, persona, actividad) sin importar si el período estaba cerrado, así
  // que alguien que trabajó en marzo, se fue, y volvió en junio chocaba con 23505: la pantalla decía
  // "ya está asignada" y la única salida era REABRIR la vieja, que borra los dos meses que estuvo
  // afuera. El módulo prometía que el historial no se pisa y el índice obligaba a pisarlo.
  //
  // Con `obra_asignacion_una_vigente … where hasta is null`, volver a asignar a alguien que ya se
  // fue es un alta normal y el período anterior queda intacto. El 23505 ahora significa lo que dice:
  // esa persona está asignada AHORA MISMO a eso.
  if (error) return { ok: false, error: error.code === '23505' ? YA_ASIGNADA : error.message }
  revalidatePath(`/obras/${obraId}`)
  return { ok: true }
}

/** Cerrar la asignación: la persona sale de la obra y el período queda escrito. Sin fecha explícita
 *  se usa hoy, que es el caso normal —alguien avisa que se fue— y tipear la fecha del día sólo
 *  agrega una forma de equivocarse. */
export async function cerrarAsignacion(
  obraId: string, asignacionId: string, hasta?: string | null,
): Promise<Resultado> {
  const supabase = await createClient()
  const valor = hasta?.trim() ? hasta.trim() : new Date().toISOString().slice(0, 10)
  const { error } = await supabase
    .from('obra_asignacion').update({ hasta: valor })
    .eq('id', asignacionId).eq('obra_id', obraId)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/obras/${obraId}`)
  return { ok: true }
}

/** Reabrir: se borra la fecha de fin. Para el cierre puesto por error. */
export async function reabrirAsignacion(obraId: string, asignacionId: string): Promise<Resultado> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('obra_asignacion').update({ hasta: null }).eq('id', asignacionId).eq('obra_id', obraId)
  if (error) return { ok: false, error: error.code === '23505' ? YA_ASIGNADA : error.message }
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

const cuadrillaAObraSchema = z.object({
  cuadrilla_id: z.string().uuid('Elegí una cuadrilla'),
  obra_id: z.string().trim().min(1, 'Elegí una obra'),
  actividad_id: z.union([z.string().uuid(), z.literal('')]).optional(),
  desde: fechaOpcional,
})

/**
 * Mandar una cuadrilla entera a una obra.
 *
 * Genera UNA asignación por integrante vigente, todas con `cuadrilla_id`. No existe una tabla
 * "cuadrilla asignada a obra": la cuadrilla en la obra ES el conjunto de sus integrantes asignados,
 * y por eso la obra los ve uno por uno y puede sacar a uno sin desarmar la cuadrilla.
 *
 * A quien ya estaba asignado a esa obra se lo saltea y se dice cuántos fueron: el índice único
 * rechazaría el lote entero por un solo repetido, y quedarse sin poder mandar a los otros nueve
 * porque uno ya estaba es exactamente el modo de falla que hace abandonar una pantalla.
 */
export async function asignarCuadrillaAObra(form: FormData): Promise<Resultado> {
  const parsed = cuadrillaAObraSchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const d = parsed.data
  const supabase = await createClient()

  const { data: integrantes, error: errorIntegrantes } = await supabase
    .from('cuadrilla_integrante').select('persona_id').eq('cuadrilla_id', d.cuadrilla_id).is('hasta', null)
  if (errorIntegrantes) return { ok: false, error: errorIntegrantes.message }
  const personas = (integrantes ?? []).map((f) => (f as { persona_id: string }).persona_id)
  if (personas.length === 0) return { ok: false, error: 'La cuadrilla no tiene integrantes vigentes.' }

  const actividad = d.actividad_id || null
  let consulta = supabase.from('obra_asignacion').select('persona_id')
    .eq('obra_id', d.obra_id).in('persona_id', personas)
  consulta = actividad ? consulta.eq('actividad_id', actividad) : consulta.is('actividad_id', null)
  const { data: existentes, error: errorExistentes } = await consulta
  if (errorExistentes) return { ok: false, error: errorExistentes.message }

  const yaEstaban = new Set((existentes ?? []).map((f) => (f as { persona_id: string }).persona_id))
  const nuevos = personas.filter((p) => !yaEstaban.has(p))
  if (nuevos.length === 0) return { ok: false, error: 'Todos los integrantes ya estaban asignados a esa obra.' }

  const { error } = await supabase.from('obra_asignacion').insert(nuevos.map((persona_id) => ({
    obra_id: d.obra_id,
    persona_id,
    rol: 'integrante',
    cuadrilla_id: d.cuadrilla_id,
    actividad_id: actividad,
    desde: d.desde || null,
  })))
  if (error) return { ok: false, error: error.code === '23505' ? YA_ASIGNADA : error.message }

  revalidatePath(`/obras/${d.obra_id}`)
  revalidatePath('/administracion/personas/cuadrillas')
  revalidatePath('/administracion/personas')
  return {
    ok: true,
    mensaje: yaEstaban.size > 0
      ? `${nuevos.length} asignados. ${yaEstaban.size} ya estaban en esa obra.`
      : `${nuevos.length} asignados a la obra.`,
  }
}
