'use server'

// LAS ESCRITURAS DE «EFECTIVO A RENDIR» — todas por las funciones de la base (migración 20260922T1500).
//
// Nunca un insert/update a `efectivo_*`: las tablas no tienen grant de escritura y las reglas (obra XOR
// estructura, no devolver más de lo que tiene, no anular con rendiciones, no descartar lo que ya está en
// Compras) las hace cumplir la base. Acá se valida la forma (Zod + `formularios.ts`) y se traduce el error.
//
// ═══ LA WEB NO ESCRIBE COMPRAS (dueño, 22/09/2026) ═══
// El ticket rendido lo carga a Compras el worker de la VM, solo, con Tipo pago «A rendir» y la obra de la
// entrega. Por eso no hay acá ninguna acción que «impute»: la pantalla revisa, observa o descarta.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { mensajeDeError, validarEntrega, validarMonto } from '../logica/formularios'

export type Resultado<T = null> = { ok: true; dato: T } | { ok: false; error: string }

const uuid = z.string().uuid('Falta la entrega')
const texto = (max: number) => z.string().trim().max(max)

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

const entregarSchema = z.object({
  persona: z.string(),
  destino: z.enum(['obra', 'estructura']).nullable(),
  obra: z.string(),
  monto: z.string(),
  paraQue: texto(400),
})

/** D02 — cuatro datos. Devuelve el código de la entrega (ER-0148). */
export async function entregarEfectivoAction(entrada: z.input<typeof entregarSchema>): Promise<Resultado<string>> {
  const p = entregarSchema.safeParse(entrada)
  if (!p.success) return { ok: false, error: 'El formulario llegó incompleto.' }
  const v = validarEntrega(p.data)
  if (!v.ok) return { ok: false, error: v.error }
  if (!z.string().uuid().safeParse(v.dato.persona).success) return { ok: false, error: 'Elegí a quién se le entrega.' }
  return rpc<string>('entregar_efectivo', {
    p_persona: v.dato.persona, p_obra: v.dato.obra, p_estructura: v.dato.estructura,
    p_monto: v.dato.monto, p_para_que: v.dato.paraQue, p_fecha: null,
  })
}

const devolucionSchema = z.object({
  entrega: uuid,
  monto: z.string(),
  recibidaPor: z.string().uuid().nullable(),
  cerrar: z.boolean(),
})

/** D06 — el vuelto vuelve a Efectivo. Devuelve lo que le queda en su poder. */
export async function registrarDevolucionAction(entrada: z.input<typeof devolucionSchema>): Promise<Resultado<number>> {
  const p = devolucionSchema.safeParse(entrada)
  if (!p.success) return { ok: false, error: p.error.issues[0].message }
  const m = validarMonto(p.data.monto)
  if (!m.ok) return { ok: false, error: m.error }
  const r = await rpc<number | string>('registrar_devolucion_efectivo', {
    p_entrega: p.data.entrega, p_monto: m.dato, p_recibida_por: p.data.recibidaPor,
    p_cerrar: p.data.cerrar, p_nota: null, p_fecha: null,
  })
  return r.ok ? { ok: true, dato: Number(r.dato) } : r
}

/**
 * D06 — cerrar una entrega RENDIDA ENTERA (en su poder = 0). Migración 20260922T1700: la base la
 * rechaza si queda plata en su poder o un ticket todavía en camino.
 */
export async function cerrarEntregaAction(entrega: string): Promise<Resultado> {
  const p = uuid.safeParse(entrega)
  if (!p.success) return { ok: false, error: 'Entrega inválida' }
  return rpc<null>('cerrar_entrega_efectivo', { p_entrega: p.data })
}

const motivoSchema = z.object({ id: uuid, motivo: texto(400).min(1, 'Escribí el motivo') })

/** Sólo un error de carga, antes de que tenga rendiciones o devoluciones (lo exige la base). */
export async function anularEntregaAction(entrada: z.input<typeof motivoSchema>): Promise<Resultado> {
  const p = motivoSchema.safeParse(entrada)
  if (!p.success) return { ok: false, error: p.error.issues[0].message }
  return rpc<null>('anular_entrega_efectivo', { p_entrega: p.data.id, p_motivo: p.data.motivo })
}

const faltaSchema = z.object({ id: uuid, falta: texto(400).min(1, 'Decí qué falta') })

/** D04/D05 — «Observar y pedir el dato»: queda observado con el motivo, y a la persona le llega el pedido. */
export async function observarComprobanteAction(entrada: z.input<typeof faltaSchema>): Promise<Resultado> {
  const p = faltaSchema.safeParse(entrada)
  if (!p.success) return { ok: false, error: p.error.issues[0].message }
  return rpc<null>('observar_comprobante_rendicion', { p_comprobante: p.data.id, p_falta: p.data.falta })
}

/** D04 — descartar un ticket que no rinde nada (repetido, ilegible sin arreglo). No toca Compras. */
export async function descartarComprobanteAction(entrada: z.input<typeof motivoSchema>): Promise<Resultado> {
  const p = motivoSchema.safeParse(entrada)
  if (!p.success) return { ok: false, error: p.error.issues[0].message }
  return rpc<null>('descartar_comprobante_rendicion', { p_comprobante: p.data.id, p_motivo: p.data.motivo })
}

const papelSchema = z.object({ entrega: uuid, ruta: z.string().min(3).max(300) })

/**
 * D03 · Papeles — la conformidad en papel: la foto ya subida al bucket, en la carpeta de quien la sube
 * (`<uid>/conformidad/…`, la policy `comprobantes_sube_administracion`). La firma con el dedo es del
 * teléfono de quien recibió y no se ofrece acá.
 */
export async function conformidadEnPapelAction(entrada: z.input<typeof papelSchema>): Promise<Resultado> {
  const p = papelSchema.safeParse(entrada)
  if (!p.success) return { ok: false, error: 'Falta el papel firmado.' }
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user || !p.data.ruta.startsWith(`${data.user.id}/conformidad/`)) {
    return { ok: false, error: 'El papel tiene que estar en tu carpeta.' }
  }
  return rpc<null>('firmar_conformidad_entrega', { p_entrega: p.data.entrega, p_trazo: null, p_papel_url: p.data.ruta })
}
