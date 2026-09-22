'use server'

// LAS ACCIONES DE LOS RECIBOS DE PAGO. Cada una llama a UNA función de la base y devuelve su palabra.
//
// La base decide quién puede (`liquida_sueldos()` / `mi_persona_id()`), en qué estado y si el recibo
// sigue al día. Acá se valida la forma de la entrada con Zod y se traduce el rechazo; no se repite
// ninguna regla de permiso, porque una server action es un endpoint y la única cerradura que no se
// saltea es la función `security definer`.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

export type Resultado = { ok: true; mensaje?: string } | { ok: false; error: string }

const ISO = /^\d{4}-\d{2}-\d{2}$/
const uuid = z.string().uuid('Recibo inválido')

const revalidar = () => {
  revalidatePath('/administracion/personas')
  revalidatePath('/administracion/personas/recibos')
  revalidatePath('/mi-informacion/recibos')
}

const error = (e: { message: string }): Resultado => ({ ok: false, error: e.message })

const emitirSchema = z.object({
  desde: z.string().regex(ISO, 'Quincena inválida'),
  hasta: z.string().regex(ISO, 'Quincena inválida'),
  persona: z.string().uuid().nullable().default(null),
})

/** EMITIR: la quincena entera o una persona. Lo rechazado vuelve con su motivo, no se esconde. */
export async function emitirRecibosAction(entrada: z.input<typeof emitirSchema>): Promise<Resultado> {
  const p = emitirSchema.safeParse(entrada)
  if (!p.success) return { ok: false, error: p.error.issues[0].message }
  const supabase = await createClient()
  const { data, error: e } = await supabase.rpc('emitir_recibos_pago', {
    p_desde: p.data.desde, p_hasta: p.data.hasta, p_persona: p.data.persona,
  })
  if (e) return error(e)
  revalidar()
  const r = (data ?? {}) as { emitidos?: { codigo: string }[]; rechazados?: { nombre: string; motivo: string }[] }
  const emitidos = r.emitidos ?? []
  const rechazados = r.rechazados ?? []
  if (emitidos.length === 0 && rechazados.length > 0) {
    return { ok: false, error: rechazados.map((x) => `${x.nombre}: ${x.motivo}`).join(' · ') }
  }
  const partes = [`${emitidos.length} recibo${emitidos.length === 1 ? '' : 's'} para firmar`]
  if (rechazados.length) partes.push(`${rechazados.length} sin emitir (${rechazados.map((x) => `${x.nombre}: ${x.motivo}`).join(' · ')})`)
  return { ok: true, mensaje: partes.join(' · ') }
}

const firmarSchema = z.object({ recibo: uuid, trazo: z.string().min(1, 'Falta la firma').max(60_000, 'La firma es demasiado larga') })

/** M10: la firma con el dedo. La base comprueba que quien firma es la persona del recibo. */
export async function firmarReciboAction(entrada: z.input<typeof firmarSchema>): Promise<Resultado> {
  const p = firmarSchema.safeParse(entrada)
  if (!p.success) return { ok: false, error: p.error.issues[0].message }
  const supabase = await createClient()
  const { error: e } = await supabase.rpc('firmar_recibo_pago', { p_recibo: p.data.recibo, p_trazo: p.data.trazo })
  if (e) return error(e)
  revalidar()
  return { ok: true, mensaje: 'Recibo firmado.' }
}

const papelSchema = z.object({
  recibo: uuid,
  ruta: z.string().regex(/^[0-9a-f-]{36}\/recibo\/[0-9a-f-]{36}-\d+\.(jpg|png|webp|heic|heif|pdf)$/, 'Ruta de la foto inválida'),
})

/**
 * M11: LA FOTO DEL PAPEL FIRMADO. El archivo ya está en el bucket: lo subió el NAVEGADOR con la sesión
 * de la persona (`SubirPapel.tsx`), porque el cuerpo de una Server Action tiene 1 MB de techo y Vercel
 * corta en 4,5 MB (`subidaComprobantes.ts`, 25/08). Acá llega sólo la ruta, y la base comprueba que el
 * objeto exista y esté en la carpeta de quien llama. Si la base lo rechaza, el que borra es el navegador.
 */
export async function registrarPapelReciboAction(entrada: z.input<typeof papelSchema>): Promise<Resultado> {
  const p = papelSchema.safeParse(entrada)
  if (!p.success) return { ok: false, error: p.error.issues[0].message }
  const supabase = await createClient()
  const { error: e } = await supabase.rpc('subir_papel_recibo_pago', { p_recibo: p.data.recibo, p_path: p.data.ruta })
  if (e) return error(e)
  revalidar()
  return { ok: true, mensaje: 'Enviado. Administración lo verifica y lo archiva en tu legajo.' }
}

const archivarSchema = z.object({
  recibo: uuid,
  verificacion: z.record(z.string(), z.boolean()).nullable().default(null),
})

/** D13: archivar el firmado. Lo verificado viaja con el recibo, como constancia. */
export async function archivarReciboAction(entrada: z.input<typeof archivarSchema>): Promise<Resultado> {
  const p = archivarSchema.safeParse(entrada)
  if (!p.success) return { ok: false, error: p.error.issues[0].message }
  const supabase = await createClient()
  const { error: e } = await supabase.rpc('archivar_recibo_pago', { p_recibo: p.data.recibo, p_verificacion: p.data.verificacion })
  if (e) return error(e)
  revalidar()
  return { ok: true, mensaje: 'Archivado. La VM lo sube al legajo en Drive.' }
}

const observarSchema = z.object({
  recibo: uuid,
  motivo: z.string().trim().min(3, 'Decí qué no coincide').max(500, 'Más corto: hasta 500 caracteres'),
  reemitir: z.boolean().default(false),
})

/**
 * OBSERVAR («Observar y pedir de nuevo», D13) o RECLAMAR («No coincide», M09): la misma función de la
 * base. Con `reemitir`, Administración emite en el acto la versión nueva; la observada queda como anterior.
 */
export async function observarReciboAction(entrada: z.input<typeof observarSchema>): Promise<Resultado> {
  const p = observarSchema.safeParse(entrada)
  if (!p.success) return { ok: false, error: p.error.issues[0].message }
  const supabase = await createClient()
  const { data: r, error: leer } = await supabase.from('recibo_pago').select('desde, hasta, persona_id').eq('id', p.data.recibo).maybeSingle()
  if (leer) return error(leer)
  const { error: e } = await supabase.rpc('observar_recibo_pago', { p_recibo: p.data.recibo, p_motivo: p.data.motivo })
  if (e) return error(e)
  revalidar()
  if (!p.data.reemitir || !r) return { ok: true, mensaje: 'Observado. Administración lo va a revisar.' }
  const fila = r as { desde: string; hasta: string; persona_id: string }
  const emitido = await emitirRecibosAction({ desde: String(fila.desde).slice(0, 10), hasta: String(fila.hasta).slice(0, 10), persona: fila.persona_id })
  return emitido.ok
    ? { ok: true, mensaje: `Observado y emitido de nuevo: ${emitido.mensaje ?? ''}`.trim() }
    : { ok: false, error: `Quedó observado, pero no se pudo emitir de nuevo: ${emitido.error}` }
}
