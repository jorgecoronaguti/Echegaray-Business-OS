'use server'

// DOCUMENTOS DEL LEGAJO — vincular y desvincular. El archivo NUNCA se copia.
//
// Lo que se guarda es el id de Drive. Drive sigue siendo donde vive el papel, con sus permisos y su
// historial; una copia acá sería una segunda versión del mismo documento y el día que difieran nadie
// sabría cuál vale. Es la misma regla que ya rige en `obra_documento`, y se reusa su parser de
// enlaces en vez de escribir un segundo: dos parsers de URL de Drive divergen y uno empieza a
// aceptar lo que el otro rechaza.
//
// DESVINCULAR NO BORRA EL ARCHIVO. Saca el vínculo del legajo; el documento sigue en Drive.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { parsearReferenciaDrive } from '@/features/obras/services/driveUrl'
import type { Resultado } from './personasActions'

// El catálogo de categorías vive en `types`: un archivo `'use server'` sólo puede exportar
// funciones async, y exportar una constante desde acá rompe el build.

const documentoSchema = z.object({
  tipo_documento: z.string().trim().min(1, 'Elegí la categoría del documento'),
  nombre: z.string().trim().min(1, 'Poné cómo se llama el documento').max(300),
  enlace: z.string().trim().min(1, 'Pegá el enlace de Drive'),
  fecha_documento: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida'), z.literal('')]).optional(),
  notas: z.string().trim().max(300).optional(),
})

export async function vincularDocumento(personaId: string, form: FormData): Promise<Resultado> {
  const parsed = documentoSchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const d = parsed.data

  const ref = parsearReferenciaDrive(d.enlace, 'archivo')
  if (!ref) {
    return { ok: false, error: 'Eso no es un enlace de Drive. Pegá el que da el botón Compartir, o el id.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('documentacion_legajo').insert({
    persona_id: personaId,
    tipo_documento: d.tipo_documento,
    nombre: d.nombre,
    drive_file_id: ref.drive_file_id,
    fecha_documento: d.fecha_documento || null,
    // `presente` ya existía en la tabla y significa "el papel está": vincularlo ES tenerlo.
    presente: true,
    notas: d.notas || null,
  })
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/administracion/personas/${personaId}`)
  return { ok: true }
}

export async function desvincularDocumento(personaId: string, documentoId: string): Promise<Resultado> {
  const supabase = await createClient()
  // El `eq('persona_id')` no sobra: sin él, un id de otro legajo borraría un vínculo ajeno.
  const { error } = await supabase
    .from('documentacion_legajo').delete().eq('id', documentoId).eq('persona_id', personaId)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/administracion/personas/${personaId}`)
  return { ok: true }
}
