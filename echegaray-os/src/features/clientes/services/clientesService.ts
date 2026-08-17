// CLIENTES — el acceso a datos. Cero SQL nuevo y cero dato fabricado.
//
// Todo sale de `cliente_panel`, que suma lo que `obra_panel` ya calcula. Los documentos se resuelven
// contra `drive_index` con el mismo criterio que los de la obra: el vínculo y los metadatos van por
// separado, porque el índice de Drive se rehace entero cada 4 horas y un archivo puede desaparecer
// de él sin que el vínculo deje de valer. En ese caso se publica el vínculo con el nombre en null
// —que es la verdad— en lugar de perder la fila en un `inner join`.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ObraPanel, ServiceResult } from '@/features/obras/types'
import type { ClientePanel, Contacto, DocumentoCliente } from '../types'

/** La cartera: un cliente por fila, los que tienen obra activa primero. */
export async function getClientes(supabase: SupabaseClient): Promise<ServiceResult<ClientePanel[]>> {
  const { data, error } = await supabase
    .from('cliente_panel')
    .select('*')
    .order('n_obras_activas', { ascending: false })
    .order('nombre', { ascending: true })
  if (error) return { data: null, error: error.message }
  return { data: (data ?? []) as ClientePanel[], error: null }
}

export async function getCliente(supabase: SupabaseClient, slug: string): Promise<ServiceResult<ClientePanel>> {
  const { data, error } = await supabase.from('cliente_panel').select('*').eq('slug', slug).maybeSingle()
  if (error) return { data: null, error: error.message }
  if (!data) return { data: null, error: `No existe el cliente "${slug}"` }
  return { data: data as ClientePanel, error: null }
}

/** Las obras del cliente. Salen de `obra_panel`: el mismo costo y el mismo avance que /obras. */
export async function getObrasDelCliente(
  supabase: SupabaseClient,
  clienteId: string,
): Promise<ServiceResult<ObraPanel[]>> {
  const { data, error } = await supabase
    .from('obra_panel')
    .select('*')
    .eq('cliente_id', clienteId)
    .order('orden', { ascending: true })
    .order('nombre', { ascending: true })
  if (error) return { data: null, error: error.message }
  return { data: (data ?? []) as ObraPanel[], error: null }
}

export async function getContactos(supabase: SupabaseClient, clienteId: string): Promise<ServiceResult<Contacto[]>> {
  const { data, error } = await supabase
    .from('cliente_contacto')
    .select('*')
    .eq('cliente_id', clienteId)
    .order('nombre', { ascending: true })
  if (error) return { data: null, error: error.message }
  return { data: (data ?? []) as Contacto[], error: null }
}

export async function getDocumentosCliente(
  supabase: SupabaseClient,
  clienteId: string,
): Promise<ServiceResult<DocumentoCliente[]>> {
  const { data: vinculos, error } = await supabase
    .from('cliente_documento')
    .select('drive_file_id, rol, origen')
    .eq('cliente_id', clienteId)
  if (error) return { data: null, error: error.message }
  const ids = (vinculos ?? []).map((v) => v.drive_file_id as string)
  if (!ids.length) return { data: [], error: null }

  const { data: archivos } = await supabase
    .from('drive_index')
    .select('drive_file_id, name, path, mime_type, modified_time')
    .in('drive_file_id', ids)
  const porId = new Map((archivos ?? []).map((a) => [a.drive_file_id as string, a]))

  const docs: DocumentoCliente[] = (vinculos ?? []).map((v) => {
    const a = porId.get(v.drive_file_id as string)
    return {
      drive_file_id: v.drive_file_id as string,
      rol: (v.rol as string) ?? null,
      origen: (v.origen as 'manual' | 'path_inferido') ?? 'manual',
      name: (a?.name as string) ?? null,
      path: (a?.path as string) ?? null,
      mime_type: (a?.mime_type as string) ?? null,
      modified_time: (a?.modified_time as string) ?? null,
    }
  })
  // Lo más reciente arriba: en una carpeta de 93 archivos, el orden alfabético no ayuda a nadie.
  docs.sort((a, b) => String(b.modified_time ?? '').localeCompare(String(a.modified_time ?? '')))
  return { data: docs, error: null }
}
