'use server'

// EFECTIVO: EDITAR Y BORRAR TODO (dueño, 25/09/2026) — las escrituras. Todas por las funciones de la
// migración 20260925T1200, que son de Administración (`ve_economia()`) y PROPAGAN: la fila de Compras por la
// cola del worker, CAJA por la réplica `_EFECTIVO_RAW`, los avisos en cola, y la bitácora `entidad_cambio`.
// Acá sólo se valida la forma y se traduce el error.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { mensajeDeError, validarMonto } from '../logica/formularios'
import { validarEdicion, type BorradorEdicion } from '../logica/edicion'

export type Resultado<T = null> = { ok: true; dato: T } | { ok: false; error: string }

const id = z.string().uuid('Falta qué se edita')

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<Resultado<T>> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc(fn, args)
    if (error) return { ok: false, error: mensajeDeError(error) }
    revalidatePath('/administracion/compras')
    return { ok: true, dato: data as T }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'No se pudo conectar con la base' }
  }
}

// ─── la entrega ───

export async function editarEntregaAction(entrega: string, b: BorradorEdicion): Promise<Resultado<{ codigo: string; firma_borrada: boolean }>> {
  if (!id.safeParse(entrega).success) return { ok: false, error: 'Entrega inválida' }
  const v = validarEdicion(b)
  if (!v.ok) return { ok: false, error: v.error }
  if (!z.string().uuid().safeParse(v.dato.persona).success) return { ok: false, error: 'Elegí a quién se le entregó.' }
  return rpc('editar_entrega_efectivo', {
    p_entrega: entrega, p_persona: v.dato.persona, p_obra: v.dato.obra, p_estructura: v.dato.estructura,
    p_monto: v.dato.monto, p_para_que: v.dato.paraQue, p_fecha: v.dato.fecha,
  })
}

const estadoSchema = z.object({ entrega: id, estado: z.enum(['abierta', 'cerrada', 'anulada']), motivo: z.string().trim().max(400).nullable() })

export async function cambiarEstadoAction(entrada: z.input<typeof estadoSchema>): Promise<Resultado> {
  const p = estadoSchema.safeParse(entrada)
  if (!p.success) return { ok: false, error: p.error.issues[0].message }
  return rpc('cambiar_estado_entrega_efectivo', { p_entrega: p.data.entrega, p_estado: p.data.estado, p_motivo: p.data.motivo || null })
}

export async function borrarEntregaAction(entrega: string): Promise<Resultado<string>> {
  if (!id.safeParse(entrega).success) return { ok: false, error: 'Entrega inválida' }
  return rpc('borrar_entrega_efectivo', { p_entrega: entrega })
}

/** Borra la firma de conformidad (trazo y papel) y le vuelve a pedir la firma a la persona. */
export async function borrarFirmaAction(entrega: string): Promise<Resultado> {
  if (!id.safeParse(entrega).success) return { ok: false, error: 'Entrega inválida' }
  return rpc('borrar_firma_entrega_efectivo', { p_entrega: entrega, p_repedir: true })
}

// ─── rendiciones y tickets ───

export async function editarRendicionAction(rendicion: string, monto: string, entrega: string): Promise<Resultado> {
  if (!id.safeParse(rendicion).success || !id.safeParse(entrega).success) return { ok: false, error: 'Rendición inválida' }
  const m = validarMonto(monto)
  if (!m.ok) return { ok: false, error: m.error }
  return rpc('editar_rendicion_efectivo', { p_rendicion: rendicion, p_monto: m.dato, p_entrega: entrega })
}

export async function borrarRendicionAction(rendicion: string): Promise<Resultado> {
  if (!id.safeParse(rendicion).success) return { ok: false, error: 'Rendición inválida' }
  return rpc('borrar_rendicion_efectivo', { p_rendicion: rendicion, p_motivo: null })
}

export async function moverComprobanteAction(comprobante: string, entrega: string): Promise<Resultado> {
  if (!id.safeParse(comprobante).success || !id.safeParse(entrega).success) return { ok: false, error: 'Comprobante inválido' }
  return rpc('mover_comprobante_efectivo', { p_comprobante: comprobante, p_entrega: entrega })
}

export async function borrarComprobanteAction(comprobante: string): Promise<Resultado> {
  if (!id.safeParse(comprobante).success) return { ok: false, error: 'Comprobante inválido' }
  return rpc('borrar_comprobante_efectivo', { p_comprobante: comprobante })
}

// ─── devoluciones ───

const devolucionSchema = z.object({
  devolucion: id,
  monto: z.string(),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Poné la fecha'),
  recibidaPor: z.string().uuid().nullable(),
  nota: z.string().trim().max(400),
  firmaRecibe: z.string().max(60_000).nullable(),
  borrarFirmaEntrega: z.boolean(),
  borrarFirmaRecibe: z.boolean(),
})

export async function editarDevolucionAction(entrada: z.input<typeof devolucionSchema>): Promise<Resultado> {
  const p = devolucionSchema.safeParse(entrada)
  if (!p.success) return { ok: false, error: p.error.issues[0].message }
  const m = validarMonto(p.data.monto)
  if (!m.ok) return { ok: false, error: m.error }
  return rpc('editar_devolucion_efectivo', {
    p_devolucion: p.data.devolucion, p_monto: m.dato, p_fecha: p.data.fecha, p_recibida_por: p.data.recibidaPor,
    p_nota: p.data.nota || null, p_firma_recibe: p.data.firmaRecibe,
    p_borrar_firma_entrega: p.data.borrarFirmaEntrega, p_borrar_firma_recibe: p.data.borrarFirmaRecibe,
  })
}

export async function borrarDevolucionAction(devolucion: string): Promise<Resultado> {
  if (!id.safeParse(devolucion).success) return { ok: false, error: 'Devolución inválida' }
  return rpc('borrar_devolucion_efectivo', { p_devolucion: devolucion })
}

// ─── avisos ───

export async function editarAvisoAction(aviso: string, texto: string): Promise<Resultado> {
  if (!id.safeParse(aviso).success) return { ok: false, error: 'Aviso inválido' }
  if (!texto.trim()) return { ok: false, error: 'El aviso no puede quedar vacío.' }
  return rpc('editar_aviso_efectivo', { p_aviso: aviso, p_texto: texto.trim().slice(0, 2000) })
}

export async function borrarAvisoAction(aviso: string): Promise<Resultado> {
  if (!id.safeParse(aviso).success) return { ok: false, error: 'Aviso inválido' }
  return rpc('borrar_aviso_efectivo', { p_aviso: aviso })
}
