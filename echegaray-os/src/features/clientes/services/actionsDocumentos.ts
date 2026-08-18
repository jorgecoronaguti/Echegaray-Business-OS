'use server'

// DOCUMENTOS DEL CLIENTE — el vínculo a Drive, nunca el archivo.
//
// ═══ UN SOLO LECTOR DE ENLACES EN TODO EL OS ═══
//
// El parseo lo hace `parsearReferenciaDrive`, el mismo que usan los documentos de obra y el único
// que tiene tests (`orquestador/lib/drive-url.test.mjs`). Acá vivía una segunda expresión regular
// —parecida, más corta y sin una sola prueba— que aceptaba como id de Drive cualquier cadena de 20
// caracteres del alfabeto base64url encontrada EN CUALQUIER PARTE del texto: una dirección de
// Dropbox entraba, se guardaba sin error y se convertía en un 404 semanas después. Dos lectores del
// mismo formato es la forma garantizada de que uno de los dos se quede viejo.
//
// ═══ EL `cliente_id` NO VIAJA EN EL FORMULARIO ═══
//
// Las acciones se atan al cliente con `bind(null, clienteId)` en la página. Un id en un campo del
// formulario lo edita cualquiera desde el navegador y dejaría colgar documentos de otro cliente.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { parsearReferenciaDrive } from '@/features/obras/services/driveUrl'
import { ROLES_DOCUMENTO } from '../types'
import type { Resultado } from './actions'

const NO_ES_DRIVE =
  'Eso no es un enlace de Drive. Pegá el que da el botón Compartir del archivo o de la carpeta, o el id.'

// El vocabulario vive en `../types`: un archivo `'use server'` sólo puede exportar funciones async,
// y una constante exportada desde acá rompe el build entero.
const rolSchema = z.union([z.enum(ROLES_DOCUMENTO), z.literal('')]).optional()

const vincularSchema = z.object({
  url: z.string().trim().min(1, 'Pegá el enlace de Drive'),
  rol: rolSchema,
})

/**
 * Vincula UN documento suelto de Drive al cliente. Queda marcado `manual` para distinguirlo del
 * vínculo que dedujo el sincronizador por la carpeta: quién lo colgó cambia cuánto se le cree.
 */
export async function vincularDocumentoCliente(clienteId: string, form: FormData): Promise<Resultado> {
  const parsed = vincularSchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

  const ref = parsearReferenciaDrive(parsed.data.url, 'archivo')
  if (!ref) return { ok: false, error: NO_ES_DRIVE }

  const supabase = await createClient()
  const { error } = await supabase.from('cliente_documento')
    .upsert(
      { cliente_id: clienteId, drive_file_id: ref.drive_file_id, rol: parsed.data.rol || null, origen: 'manual' },
      { onConflict: 'cliente_id,drive_file_id' },
    )
  if (error) return { ok: false, error: error.message }
  revalidatePath('/clientes', 'layout')
  return { ok: true, id: ref.drive_file_id }
}

/**
 * La carpeta raíz del cliente en Drive. Es distinta de vincular un documento: es la puerta por la
 * que se entra a todo lo demás, y por eso vive en la ficha y no en la lista.
 */
export async function vincularCarpetaCliente(clienteId: string, form: FormData): Promise<Resultado> {
  const url = String(form.get('url') ?? '').trim()
  // `tipoDeclarado: 'carpeta'` sólo decide cuando la entrada es un id pelado. Si la URL dice que es
  // un archivo, gana la URL: quien pegó un enlace de archivo acá se equivocó de campo.
  const ref = parsearReferenciaDrive(url, 'carpeta')
  if (!ref) return { ok: false, error: 'No reconocí un id de carpeta de Drive en eso' }
  if (ref.tipo !== 'carpeta') {
    return { ok: false, error: 'Ese enlace es de un archivo, no de una carpeta. La carpeta se abre con «Compartir» sobre la carpeta.' }
  }
  const supabase = await createClient()
  const { error } = await supabase.from('clientes').update({ drive_carpeta_id: ref.drive_file_id }).eq('id', clienteId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/clientes', 'layout')
  return { ok: true, id: ref.drive_file_id }
}

/**
 * CLASIFICAR desde la lista. Es la única edición de un documento que existe, y es la que convierte
 * 214 vínculos en un archivo consultable: sin rol, «¿cuál de estos es el contrato?» se contesta
 * abriéndolos de a uno.
 */
export async function clasificarDocumentoCliente(
  clienteId: string, driveFileId: string, form: FormData,
): Promise<Resultado> {
  const parsed = rolSchema.safeParse(String(form.get('rol') ?? ''))
  if (!parsed.success) return { ok: false, error: 'Ese no es uno de los tipos de documento' }
  const supabase = await createClient()
  const { error } = await supabase.from('cliente_documento')
    .update({ rol: parsed.data || null })
    .eq('cliente_id', clienteId)
    .eq('drive_file_id', driveFileId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/clientes', 'layout')
  return { ok: true }
}

/**
 * Quitar el vínculo. NO borra nada de Drive: el archivo queda donde estaba.
 *
 * El `eq('cliente_id')` no sobra: sin él, un archivo vinculado a dos clientes borraría el vínculo
 * del otro.
 */
export async function desvincularDocumentoCliente(clienteId: string, driveFileId: string): Promise<Resultado> {
  const supabase = await createClient()
  const { error } = await supabase.from('cliente_documento')
    .delete().eq('cliente_id', clienteId).eq('drive_file_id', driveFileId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/clientes', 'layout')
  return { ok: true }
}
