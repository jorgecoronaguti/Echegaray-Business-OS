'use server'

// REGISTRAR, LISTAR, DESCRIBIR Y DAR DE BAJA UN ADJUNTO DEL PARTE DIARIO.
//
// ═══ EL ARCHIVO NO PASA POR ACÁ ═══
//
// El cuerpo de una Server Action tiene 1 MB de techo en Next y 4,5 MB en Vercel; una foto de
// celular pesa 2–8 MB y un video, 60–100. La foto de Herramientas fallaba desde el teléfono por
// exactamente eso (23/09/2026). El navegador pone el objeto en el bucket con la sesión del usuario
// (`subidaAdjuntosDeParte.ts`) y acá llega SÓLO el renglón.
//
// ═══ LA CERRADURA ES POSTGRES ═══
//
// Las policies del bucket y de la tabla exigen `ve_obra()`, y el cliente de estas acciones es el
// del USUARIO. Lo que se hace acá es cruzar el `storage_path` contra obra y día ANTES de escribir,
// para poder explicar el «no» en castellano en vez de mostrar un «violates row-level security».

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { MAX_BYTES, TIPOS_ACEPTADOS, esRutaDelParte, traducirError } from './parteAdjuntos'
import { firmarAdjuntos, getAdjuntosDeParte, type AdjuntoFirmado } from './parteAdjuntosService'

export type Resultado<T = undefined> =
  | { ok: true; dato: T }
  | { ok: false; error: string }

const Id = z.string().uuid()
const Fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const Obra = z.string().regex(/^[A-Za-z0-9_-]{1,80}$/)

/** LO QUE LA ACCIÓN ACEPTA: el renglón. El archivo ya está en el bucket. */
const Alta = z.object({
  obraId: Obra,
  fecha: Fecha,
  actividadId: z.string().uuid().nullable().optional(),
  storagePath: z.string().min(10).max(300),
  nombreArchivo: z.string().trim().min(1).max(255),
  tipoMime: z.enum(TIPOS_ACEPTADOS as [string, ...string[]]),
  tamanoBytes: z.number().int().positive().max(MAX_BYTES.video),
  descripcion: z.string().trim().max(1000).nullable().optional(),
  /** ISO con zona, o null si el EXIF no se pudo leer. */
  tomadaEn: z.string().datetime({ offset: true }).nullable().optional(),
})
export type AltaDeAdjunto = z.infer<typeof Alta>

/**
 * REGISTRAR EL ADJUNTO QUE YA ESTÁ EN EL BUCKET. Se cruza la ruta contra obra y día como lo hace
 * `esRutaDelProveedor` con los contratos: sin ese cruce, esta acción sería un ariete para colgar la
 * foto de una obra en el parte de otra.
 */
export async function registrarAdjuntoDeParte(entrada: AltaDeAdjunto): Promise<Resultado<string>> {
  const p = Alta.safeParse(entrada)
  if (!p.success) return { ok: false, error: 'Faltan datos del archivo o son inválidos.' }

  const supabase = await createClient()
  const { data: usuario } = await supabase.auth.getUser()
  if (!usuario?.user) return { ok: false, error: 'Tenés que iniciar sesión.' }
  if (!esRutaDelParte(p.data.storagePath, p.data.obraId, p.data.fecha)) {
    return { ok: false, error: 'Ese archivo no corresponde a esta obra y este día.' }
  }

  const { data, error } = await supabase.from('obra_parte_adjunto').insert({
    obra_id: p.data.obraId,
    fecha: p.data.fecha,
    actividad_id: p.data.actividadId ?? null,
    storage_path: p.data.storagePath,
    nombre_archivo: p.data.nombreArchivo,
    tipo_mime: p.data.tipoMime,
    tamano_bytes: p.data.tamanoBytes,
    descripcion: p.data.descripcion?.trim() ? p.data.descripcion.trim() : null,
    tomada_en: p.data.tomadaEn ?? null,
    subido_por: usuario.user.id,
  }).select('id').single()

  if (error) return { ok: false, error: traducirError(error.message) }
  revalidatePath(`/obras/${p.data.obraId}`)
  return { ok: true, dato: String(data.id) }
}

/**
 * LOS ADJUNTOS DE UN DÍA, FIRMADOS. La pantalla los pide al cambiar de día y después de subir;
 * la firma dura diez minutos y se genera acá, nunca en el navegador ni con bucket público.
 */
export async function adjuntosDelDia(obraId: string, fecha: string): Promise<Resultado<AdjuntoFirmado[]>> {
  const o = Obra.safeParse(obraId)
  const f = Fecha.safeParse(fecha)
  if (!o.success || !f.success) return { ok: false, error: 'Obra o día inválidos.' }
  const supabase = await createClient()
  const filas = await getAdjuntosDeParte(supabase, o.data, { desde: f.data, hasta: f.data })
  if (filas.error !== null) return { ok: false, error: traducirError(filas.error) }
  return { ok: true, dato: await firmarAdjuntos(supabase, filas.data) }
}

const Edicion = z.object({
  id: Id,
  descripcion: z.string().trim().max(1000).nullable(),
  actividadId: z.string().uuid().nullable().optional(),
})

/** CAMBIAR LA DESCRIPCIÓN (y el frente) DE UN ADJUNTO. Quien subió o Administración: lo dice la policy. */
export async function describirAdjuntoDeParte(entrada: z.infer<typeof Edicion>): Promise<Resultado> {
  const p = Edicion.safeParse(entrada)
  if (!p.success) return { ok: false, error: 'Descripción inválida (hasta 1000 caracteres).' }
  const supabase = await createClient()
  const cambios: Record<string, unknown> = { descripcion: p.data.descripcion?.trim() ? p.data.descripcion.trim() : null }
  if (p.data.actividadId !== undefined) cambios.actividad_id = p.data.actividadId
  const { data, error } = await supabase.from('obra_parte_adjunto').update(cambios)
    .eq('id', p.data.id).is('borrado_en', null).select('obra_id').maybeSingle()
  if (error) return { ok: false, error: error.code === '42501' ? 'Sólo quien la subió o Administración puede cambiar la descripción.' : traducirError(error.message) }
  // CERO FILAS NO ES ÉXITO: la policy filtró, o ya estaba borrada.
  if (!data) return { ok: false, error: 'No se guardó: puede que no tengas permiso o que ya esté borrada.' }
  revalidatePath(`/obras/${String(data.obra_id)}`)
  return { ok: true, dato: undefined }
}

/** DAR DE BAJA — LÓGICA. El objeto del bucket queda. Quien subió o Administración. */
export async function borrarAdjuntoDeParte(adjuntoId: string): Promise<Resultado> {
  const id = Id.safeParse(adjuntoId)
  if (!id.success) return { ok: false, error: 'Ese archivo no existe.' }
  const supabase = await createClient()
  const { data: usuario } = await supabase.auth.getUser()
  if (!usuario?.user) return { ok: false, error: 'Tenés que iniciar sesión.' }
  const { data, error } = await supabase.from('obra_parte_adjunto').update({
    borrado_en: new Date().toISOString(), borrado_por: usuario.user.id,
  }).eq('id', id.data).is('borrado_en', null).select('obra_id').maybeSingle()
  if (error) return { ok: false, error: error.code === '42501' ? 'Sólo quien la subió o Administración puede borrarla.' : traducirError(error.message) }
  if (!data) return { ok: false, error: 'No se borró: puede que ya lo estuviera o que no tengas permiso.' }
  revalidatePath(`/obras/${String(data.obra_id)}`)
  return { ok: true, dato: undefined }
}
