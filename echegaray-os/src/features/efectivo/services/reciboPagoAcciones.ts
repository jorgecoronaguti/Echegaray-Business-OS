'use server'

// EMITIR Y ANULAR EL RECIBO DE PAGO EN EFECTIVO A UN TERCERO — las dos únicas escrituras, por las funciones de
// la base (`emitir_recibo_pago_efectivo`, `anular_recibo_pago_efectivo`, migración 20261002T2300): ellas exigen
// Administración, toman el número RP y no dejan reescribir lo emitido. Acá se valida la forma (Zod + la misma
// regla que el panel) y se traduce el error. La tabla no tiene grant de escritura: no hay otro camino.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { faltaMigracion, mensajeDeError } from '../logica/formularios'
import { diaAR } from '../logica/entregas'
import { validarReciboPago } from '../logica/reciboPago'
import { MIGRACION_RECIBO_PAGO, leerPersonasParaRecibo } from './reciboPagoDatos'

export type ResultadoRecibo<T> = { ok: true; dato: T } | { ok: false; error: string }

const FALTA = `El recibo de pago todavía no está publicado en la base (migración ${MIGRACION_RECIBO_PAGO}): no se emitió nada.`

const emitirSchema = z.object({
  /** Lo genera el panel al abrirse: la misma emisión que llega dos veces devuelve el mismo recibo. */
  id: z.string().uuid(),
  aNombreDe: z.string().max(200),
  documento: z.string().max(30),
  importe: z.string().max(30),
  fecha: z.string().max(10),
  concepto: z.string().max(400),
  obra: z.string().max(200),
  obraId: z.string().max(100).nullable(),
  proveedorId: z.string().uuid().nullable(),
  personaId: z.string().uuid().nullable(),
  compraFila: z.number().int().positive().nullable(),
})

/** Devuelve el código impreso (RP-000123). */
export async function emitirReciboPagoAction(e: z.input<typeof emitirSchema>): Promise<ResultadoRecibo<string>> {
  const p = emitirSchema.safeParse(e)
  if (!p.success) return { ok: false, error: 'El formulario llegó incompleto.' }
  const v = validarReciboPago(p.data, diaAR(new Date().toISOString()))
  if (!v.ok) return v
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('emitir_recibo_pago_efectivo', {
      p_id: p.data.id, p_fecha: v.dato.fecha, p_a_nombre_de: v.dato.aNombreDe, p_documento: v.dato.documento,
      p_importe: v.dato.importe, p_concepto: v.dato.concepto, p_obra: v.dato.obra, p_obra_id: p.data.obraId,
      p_proveedor_id: p.data.proveedorId, p_persona_id: p.data.personaId, p_compra_fila: p.data.compraFila,
    })
    if (faltaMigracion(error)) return { ok: false, error: FALTA }
    if (error) return { ok: false, error: mensajeDeError(error) }
    if (typeof data !== 'string' || !data) return { ok: false, error: 'La base no devolvió el número del recibo.' }
    revalidatePath('/administracion/compras')
    return { ok: true, dato: data }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'No se pudo conectar con la base' }
  }
}

/**
 * A nombre de quién sale el recibo de una persona del plantel (Liquidación · «Recibo por la diferencia»): nombre
 * legal y DNI/CUIL del legajo. Sólo lectura; la RLS de `personas` y `persona_legajo` decide qué ve la sesión.
 */
export async function personaParaReciboAction(personaId: string): Promise<ResultadoRecibo<{ nombre: string; documento: string | null }>> {
  if (!z.string().uuid().safeParse(personaId).success) return { ok: false, error: 'Persona inválida.' }
  try {
    const p = (await leerPersonasParaRecibo([personaId])).get(personaId)
    return p ? { ok: true, dato: p } : { ok: false, error: 'No encontré a la persona en el padrón.' }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'No se pudo conectar con la base' }
  }
}

const anularSchema =z.object({ id: z.string().uuid(), motivo: z.string().trim().min(5, 'Escribí por qué se anula (al menos 5 letras).').max(400) })

export async function anularReciboPagoAction(e: z.input<typeof anularSchema>): Promise<ResultadoRecibo<null>> {
  const p = anularSchema.safeParse(e)
  if (!p.success) return { ok: false, error: p.error.issues[0].message }
  try {
    const supabase = await createClient()
    const { error } = await supabase.rpc('anular_recibo_pago_efectivo', { p_id: p.data.id, p_motivo: p.data.motivo })
    if (faltaMigracion(error)) return { ok: false, error: FALTA }
    if (error) return { ok: false, error: mensajeDeError(error) }
    revalidatePath('/administracion/compras')
    return { ok: true, dato: null }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'No se pudo conectar con la base' }
  }
}
