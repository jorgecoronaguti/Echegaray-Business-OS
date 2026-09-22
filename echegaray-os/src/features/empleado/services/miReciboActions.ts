'use server'

// M10 y M11 · LO QUE LA PERSONA HACE CON SU RECIBO — firmarlo con el dedo, subir el papel firmado, o decir
// que no coincide.
//
// ═══ NADIE FIRMA POR OTRO ═══
//
// Acá NO se pasa ningún `persona_id`: la base compara contra `mi_persona_id()` adentro de
// `firmar_recibo_liquidacion`. Un parámetro con la persona sería la puerta para firmar a nombre ajeno, y
// esto es una conformidad laboral: es la firma lo que se está guardando.
//
// ═══ EL ACUSE NO ES EVIDENCIA ═══
//
// Después de cada RPC se lee la fila de vuelta y se devuelve el estado LEÍDO. Una firma que la pantalla dio
// por guardada y la base no tiene es peor que un error: la persona se va convencida de que firmó.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { esTrazoGuardable } from '@/shared/firma/firma'

export type Resultado = { ok: true; mensaje: string } | { ok: false; error: string }

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  'No sé de qué recibo se trata.')

/** La ruta de la foto dentro del bucket. La carpeta la impone la policy: `<uid>/recibo/…`. */
const rutaSchema = z.string().min(5).max(300).regex(/^[0-9a-f-]{36}\/recibo\/[\w.-]+$/i, 'La foto no está en tu carpeta.')

async function leerEstado(id: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('recibo_liquidacion').select('id, estado, firmado_en, papel_subido_en').eq('id', id).maybeSingle()
  if (error || !data?.id) return null
  return data as { estado: string; firmado_en: string | null; papel_subido_en: string | null }
}

function refrescar(id: string) {
  revalidatePath('/mi-informacion/recibos')
  revalidatePath(`/mi-informacion/recibos/quincena/${id}`)
}

// ── M10 · FIRMAR CON EL DEDO ─────────────────────────────────────────────────────────────────────
export async function firmarMiReciboAction(entrada: { recibo: string; trazo: string }): Promise<Resultado> {
  const id = uuid.safeParse(entrada.recibo)
  if (!id.success) return { ok: false, error: id.error.issues[0].message }
  // LA MISMA FORMA QUE PIDE LA BASE, ANTES DE VIAJAR: así el «no tiene forma de firma» se dice en castellano
  // y no vuelve como un error de expresión regular de Postgres.
  if (!entrada.trazo || !esTrazoGuardable(entrada.trazo)) {
    return { ok: false, error: 'Firmá arriba de la línea: el trazo es muy corto.' }
  }
  const supabase = await createClient()
  const { error } = await supabase.rpc('firmar_recibo_liquidacion', {
    p_recibo: id.data, p_trazo: entrada.trazo,
  })
  if (error) return { ok: false, error: error.message }

  const leido = await leerEstado(id.data)
  if (!leido) return { ok: false, error: 'No pude leer el recibo de vuelta: no doy la firma por guardada.' }
  if (!leido.firmado_en) {
    return { ok: false, error: 'La base respondió que sí pero el recibo sigue sin firma. Probá de nuevo.' }
  }
  refrescar(id.data)
  return { ok: true, mensaje: 'Firmado. Queda en tu legajo y ya lo tiene Administración.' }
}

// ── M11 · EL PAPEL FIRMADO ───────────────────────────────────────────────────────────────────────
// La foto ya está en el bucket cuando se llama a esto (la sube el navegador directo: una Server Action tiene
// techo de 1 MB y una foto de celular pesa hasta 5). La base verifica que el objeto EXISTA antes de anotarlo:
// una fila que apunte a una foto que no llegó es una conformidad que nadie puede mirar.
export async function subirPapelDeMiReciboAction(entrada: { recibo: string; ruta: string }): Promise<Resultado> {
  const id = uuid.safeParse(entrada.recibo)
  if (!id.success) return { ok: false, error: id.error.issues[0].message }
  const ruta = rutaSchema.safeParse(entrada.ruta)
  if (!ruta.success) return { ok: false, error: ruta.error.issues[0].message }

  const supabase = await createClient()
  const { error } = await supabase.rpc('subir_papel_recibo_liquidacion', {
    p_recibo: id.data, p_path: ruta.data,
  })
  if (error) return { ok: false, error: error.message }

  const leido = await leerEstado(id.data)
  if (!leido) return { ok: false, error: 'No pude leer el recibo de vuelta: no lo doy por cargado.' }
  if (!leido.papel_subido_en) {
    return { ok: false, error: 'La base respondió que sí pero el papel no quedó anotado. Probá de nuevo.' }
  }
  refrescar(id.data)
  return { ok: true, mensaje: 'Papel firmado cargado. Administración lo verifica y lo archiva.' }
}

// ── «NO COINCIDE» (M09) ──────────────────────────────────────────────────────────────────────────
// Antes de firmar. Después de firmar el reclamo va por otra vía, y eso lo dice la base, no la pantalla.
export async function observarMiReciboAction(entrada: { recibo: string; motivo: string }): Promise<Resultado> {
  const id = uuid.safeParse(entrada.recibo)
  if (!id.success) return { ok: false, error: id.error.issues[0].message }
  const motivo = entrada.motivo.trim()
  if (!motivo) return { ok: false, error: 'Contá qué no coincide con lo que trabajaste.' }
  if (motivo.length > 400) return { ok: false, error: 'Más corto: hasta 400 caracteres.' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('observar_recibo_liquidacion', { p_recibo: id.data, p_motivo: motivo })
  if (error) return { ok: false, error: error.message }

  const leido = await leerEstado(id.data)
  if (!leido || leido.estado !== 'observado') {
    return { ok: false, error: 'No pude confirmar que quedara anotado. Avisale a Administración.' }
  }
  refrescar(id.data)
  return { ok: true, mensaje: 'Queda anotado. Administración lo revisa y te emite el recibo corregido.' }
}
