// LEER LOS CONTACTOS DE UN PROVEEDOR — la consulta. Las reglas están en `contactosProveedor.ts`.
//
// La policy es `es_administracion()`, la misma de la ficha: Dirección, Administración y jefe de obra
// ven la misma agenda. No hay recorte por obra: un vendedor no cuelga de una obra, cuelga del proveedor.

import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { clasificarLectura, type LecturaContactos } from './contactosProveedor'

export async function getContactosDelProveedor(
  supabase: SupabaseClient,
  proveedorId: string,
): Promise<LecturaContactos> {
  // Mismo criterio que `getDocumentosDelProveedor`: un id que no es uuid no viaja a Postgres para
  // volver como error de sintaxis, que se leería como «no pude leer sus contactos».
  if (!z.string().uuid().safeParse(proveedorId).success) {
    return { estado: 'error', error: 'Ese proveedor no existe.' }
  }
  const { data, error } = await supabase
    .from('proveedor_contacto')
    .select('id, nombre, rol, email, telefono, notas')
    .eq('proveedor_id', proveedorId)
    .order('nombre', { ascending: true })
  return clasificarLectura(data, error)
}
