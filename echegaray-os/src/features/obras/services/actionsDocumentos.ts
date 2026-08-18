'use server'

// DOCUMENTOS DE OBRA — las acciones que ESCRIBEN sobre `obra_documento`.
//
// ═══ LO QUE SE GUARDA ES EL VÍNCULO, NUNCA EL ARCHIVO ═══
//
// Ni un byte del archivo entra a Supabase. Lo que se guarda es el id de Drive, el rótulo y de quién
// es. Drive sigue siendo el lugar donde vive el documento, con sus permisos y su historial: copiarlo
// acá crearía una segunda versión del mismo papel y el día que difieran nadie va a saber cuál vale.
//
// ═══ EL `obra_id` NO VIAJA EN EL FORMULARIO ═══
//
// La acción se ata a la obra con `bind(null, obraId)` en la página. Un id de obra en un campo del
// formulario lo edita cualquiera desde el navegador y dejaría escribir sobre la obra de al lado —
// la RLS `obra_documento_insert` acota por `ve_obra(obra_id)`, así que un jefe de obra no llegaría
// a una obra ajena, pero SÍ llegaría a cualquier otra obra suya, y eso ya es un vínculo mal puesto.
//
// ═══ DE DÓNDE SALE EL NOMBRE, Y POR QUÉ NO SE LE PREGUNTA A DRIVE ═══
//
// De `drive_index` —el espejo de Drive que el OS sincroniza cada 4 h, 2.467 archivos— y, si el
// archivo no está indexado, de lo que escribió la persona. NO se le pregunta a la API de Drive: el
// cliente de Google del OS (`orquestador/lib/google.mjs`) necesita la clave de la cuenta de servicio
// en disco, y en Vercel esa credencial no existe — el mismo motivo por el que `cargarSaldoAction`
// encola en vez de escribir el Sheet. Una acción que dependiera de ella andaría en la VM y fallaría
// en producción, que es la peor de las dos opciones.
//
// Y si no hay ninguna de las dos, NO se inventa un nombre: se rechaza y se pide. Un vínculo cuyo
// rótulo es el id de Drive no es un documento, es una cadena de 33 caracteres que nadie va a abrir.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import type { Resultado } from './actions'
import { parsearReferenciaDrive } from './driveUrl'

const documentoSchema = z.object({
  enlace: z.string().trim().min(1, 'Pegá el enlace de Drive'),
  // El tipo declarado sólo decide cuando la entrada es un id pelado: si la URL dice que es carpeta,
  // gana la URL. Ver `parsearReferenciaDrive`.
  tipo: z.enum(['archivo', 'carpeta']).optional(),
  nombre: z.string().trim().max(300).optional(),
  rol: z.string().trim().max(120).optional(),
})

const NO_ES_DRIVE =
  'Eso no es un enlace de Drive. Pegá el que da el botón Compartir del archivo o de la carpeta, o el id.'

export async function vincularDocumento(obraId: string, form: FormData): Promise<Resultado> {
  const parsed = documentoSchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const d = parsed.data

  const ref = parsearReferenciaDrive(d.enlace, d.tipo ?? 'archivo')
  if (!ref) return { ok: false, error: NO_ES_DRIVE }

  const supabase = await createClient()

  // El índice manda sobre lo que se tipeó: si el OS ya conoce el archivo, su nombre y su mime son
  // los de Drive y no los que alguien recordó de memoria.
  const { data: indexado } = await supabase
    .from('drive_index')
    .select('name, mime_type, is_folder')
    .eq('drive_file_id', ref.drive_file_id)
    .maybeSingle()

  const nombre = (indexado?.name as string) || d.nombre || null
  if (!nombre) {
    return {
      ok: false,
      error: 'Ese archivo no está en el índice de Drive, así que no sé cómo se llama. Escribí el nombre.',
    }
  }

  const { error } = await supabase.from('obra_documento').insert({
    obra_id: obraId,
    drive_file_id: ref.drive_file_id,
    nombre,
    tipo: indexado ? (indexado.is_folder ? 'carpeta' : 'archivo') : ref.tipo,
    mime_type: (indexado?.mime_type as string) ?? ref.mime_type,
    rol: d.rol || null,
    // Lo vinculó una PERSONA: es un hecho afirmado, no una deducción del OS por la ruta del archivo.
    origen: 'confirmado',
    // `creado_por` NO se manda: lo pone la base con `default auth.uid()`. Un campo del formulario o
    // un valor calculado acá serían igual de falsificables.
  })

  if (error) {
    // Una migración en el repositorio no es una migración aplicada. Si las columnas todavía no están
    // en la base, PostgREST contesta PGRST204 con un texto que no le dice nada a nadie: se traduce a
    // lo único accionable que hay.
    if (error.code === 'PGRST204' || error.code === '42703') {
      // El detalle crudo viaja igual: el día que falte OTRA columna, este mensaje mandaría a aplicar
      // una migración ya aplicada y la búsqueda arrancaría en el lugar equivocado.
      return {
        ok: false,
        error: `Falta aplicar en la base la migración del vínculo (20260819T0100_obra_documento). ${error.message}`,
      }
    }
    if (error.code === '23505') return { ok: false, error: 'Ese archivo ya está vinculado a esta obra.' }
    if (error.code === '23503') return { ok: false, error: 'Esa obra no existe.' }
    return { ok: false, error: error.message }
  }

  revalidatePath(`/obras/${obraId}`)
  return { ok: true, id: ref.drive_file_id }
}

/**
 * Quitar el vínculo. NO borra nada de Drive: el archivo queda donde estaba.
 *
 * Es la única entidad del módulo que sí se borra en vez de archivarse, por el mismo motivo que una
 * asignación de personal: un vínculo cargado por error no tiene historia que preservar, y el
 * documento —que es lo que importa— nunca estuvo acá.
 */
export async function desvincularDocumento(obraId: string, driveFileId: string): Promise<Resultado> {
  const supabase = await createClient()
  // El `eq('obra_id')` no sobra: sin él, un id de archivo vinculado a dos obras borraría el vínculo
  // de la otra.
  const { error } = await supabase
    .from('obra_documento')
    .delete()
    .eq('obra_id', obraId)
    .eq('drive_file_id', driveFileId)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/obras/${obraId}`)
  return { ok: true }
}
