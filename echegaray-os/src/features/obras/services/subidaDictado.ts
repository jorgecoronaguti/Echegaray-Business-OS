'use client'

// SUBIR EL AUDIO DICTADO: el navegador pone el WAV en el bucket con la sesión del usuario y después
// registra la fila. El archivo no pasa por la Server Action (1 MB de techo; tres minutos son 5,8 MB).
// La ruta `obra/<obra>/<fecha>/<uuid>.wav` es parte de la cerradura: la policy le pregunta a
// `ve_obra()` por la 2ª carpeta y el CHECK de la tabla cruza la 3ª con la fecha.

import { createClient } from '@/lib/supabase/client'
import { crearDictado } from './dictadoParteActions'

export const BUCKET_DICTADOS = 'partes-dictados'

export async function subirDictado(obraId: string, fecha: string, wav: Blob, segundos: number, esCorreccion = false): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const ruta = `obra/${obraId}/${fecha}/${crypto.randomUUID()}.wav`
  const supabase = createClient()
  const { error } = await supabase.storage.from(BUCKET_DICTADOS).upload(ruta, wav, { contentType: 'audio/wav', upsert: false })
  if (error) {
    const m = error.message ?? ''
    return { ok: false, error: /row-level|security|403|Unauthorized/i.test(m) ? 'No tenés permiso para dictar el parte de esta obra.' : `No se pudo subir el audio: ${m}` }
  }
  const r = await crearDictado({ obraId, fecha, audioPath: ruta, bytes: wav.size, duracionS: Math.max(0.1, segundos), esCorreccion })
  return r.ok ? { ok: true, id: r.dato } : { ok: false, error: r.error }
}
