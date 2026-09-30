'use server'

// RESTITUIR (Y DESHACER) EL PRESENTISMO DE UNA PERSONA EN UNA QUINCENA — dueño, 30/09/2026.
//
// Cerraduras, en orden y antes de escribir: Zod · `permisoDeLiquidacion` (rol releído en el servidor: una server
// action es un endpoint) · estado de la cabecera releído · fechas perdidas recalculadas desde las presencias. La RLS
// (`liquida_sueldos()` + quincena abierta) es la cerradura que vale si alguna de éstas falla.
//
// Se escribe con la sesión de quien opera, no con la clave de servicio: la policy exige `restituido_por = auth.uid()`,
// y así la fila dice quién fue sin que la acción pueda mentirlo. Deshacer sella quién y cuándo, no borra. Cada escritura se lee de vuelta (`.select()`): un 204
// no prueba que la fila quedó.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getPerfilActual } from '@/features/auth/services/authService'
import { permisoDeLiquidacion } from './liquidacionPermiso'
import { decidirRestitucion, fechasPerdidasDe, MENSAJE_CERRADA } from './presentismoRestitucionRegla'
import { ausenciasPorPersona, tardanzasPorPersona } from './liquidacionGuardadas'

const RUTA = '/administracion/personas'
const ISO = /^\d{4}-\d{2}-\d{2}$/

const ventana = {
  persona_id: z.string().uuid(),
  desde: z.string().regex(ISO, 'Quincena inválida'),
  hasta: z.string().regex(ISO, 'Quincena inválida'),
}
const restituirSchema = z.object({ ...ventana, motivo: z.string().trim().max(300, 'El motivo admite hasta 300 caracteres.').optional() })
const deshacerSchema = z.object(ventana)

export type ResultadoRestitucion = { ok: true; mensaje: string } | { ok: false; error: string }

type Cliente = Awaited<ReturnType<typeof createClient>>

async function puerta(supabase: Cliente): Promise<{ id: string; nombre: string } | { error: string }> {
  const { data: perfil, error } = await getPerfilActual(supabase)
  const permiso = permisoDeLiquidacion(perfil?.rol, error)
  if (!permiso.ok) return { error: permiso.error }
  if (!perfil?.id) return { error: 'No pude verificar quién sos. No guardé nada.' }
  return { id: perfil.id, nombre: (perfil.nombre ?? '').trim() || 'Administración' }
}

/** FALLA CERRADO: sin el estado de la cabecera no se sabe si la quincena está sellada. */
async function estaCerrada(supabase: Cliente, desde: string, hasta: string): Promise<boolean | { error: string }> {
  const cab = await supabase.from('liquidacion_quincena').select('estado').eq('desde', desde).eq('hasta', hasta).eq('grupo', 'obreros')
  if (cab.error) return { error: `No pude leer el estado de la quincena: ${cab.error.message}` }
  return ((cab.data ?? []) as { estado: string }[]).some((c) => c.estado === 'cerrada')
}

export async function restituirPresentismo(entrada: unknown): Promise<ResultadoRestitucion> {
  const parsed = restituirSchema.safeParse(entrada)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const e = parsed.data
  const supabase = await createClient()
  const quien = await puerta(supabase)
  if ('error' in quien) return { ok: false, error: quien.error }
  const cerrada = await estaCerrada(supabase, e.desde, e.hasta)
  if (typeof cerrada === 'object') return { ok: false, error: cerrada.error }

  const pres = await supabase.from('asistencia_dia')
    .select('persona_id, fecha, estado, motivo, llego_tarde, salio_antes')
    .eq('persona_id', e.persona_id).gte('fecha', e.desde).lte('fecha', e.hasta)
  if (pres.error) return { ok: false, error: `No pude leer la asistencia: ${pres.error.message}` }
  const fechas = fechasPerdidasDe(
    tardanzasPorPersona(pres.data).get(e.persona_id) ?? [], ausenciasPorPersona(pres.data).get(e.persona_id) ?? [])
  const decision = decidirRestitucion({ estaCerrada: cerrada, fechasPerdidas: fechas })
  if (!decision.ok) return { ok: false, error: decision.error }

  const fila = {
    persona_id: e.persona_id, desde: e.desde, hasta: e.hasta, fechas: decision.fechas,
    motivo: e.motivo || null, restituido_por: quien.id, restituido_por_nombre: quien.nombre,
    restituido_en: new Date().toISOString(),
  }
  const { data, error } = await supabase.from('liquidacion_presentismo_restitucion')
    .insert(fila).select('id')
  // 23505 = ya hay una vigente: no se pisa lo anotado, se deshace primero.
  if (error?.code === '23505') return { ok: false, error: 'Ya hay una restitución vigente para esta persona en la quincena.' }
  if (error) return { ok: false, error: `No pude guardar la restitución: ${error.message}` }
  if (!data || data.length === 0) return { ok: false, error: 'No se guardó la restitución (la base no devolvió la fila). No cambió nada.' }
  revalidatePath(RUTA)
  return { ok: true, mensaje: 'Presentismo restituido.' }
}

export async function deshacerRestitucion(entrada: unknown): Promise<ResultadoRestitucion> {
  const parsed = deshacerSchema.safeParse(entrada)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const e = parsed.data
  const supabase = await createClient()
  const quien = await puerta(supabase)
  if ('error' in quien) return { ok: false, error: quien.error }
  const cerrada = await estaCerrada(supabase, e.desde, e.hasta)
  if (typeof cerrada === 'object') return { ok: false, error: cerrada.error }
  if (cerrada) return { ok: false, error: MENSAJE_CERRADA }
  const { data, error } = await supabase.from('liquidacion_presentismo_restitucion')
    .update({ deshecho_en: new Date().toISOString(), deshecho_por: quien.id, deshecho_por_nombre: quien.nombre })
    .eq('persona_id', e.persona_id).eq('desde', e.desde).eq('hasta', e.hasta).is('deshecho_en', null).select('id')
  if (error) return { ok: false, error: `No pude deshacer la restitución: ${error.message}` }
  if (!data || data.length === 0) return { ok: false, error: 'No había una restitución para deshacer.' }
  revalidatePath(RUTA)
  return { ok: true, mensaje: 'Restitución deshecha: el presentismo vuelve a figurar perdido.' }
}
