'use server'

// CONTACTOS DE UN PROVEEDOR — las acciones que ESCRIBEN. Alta, edición y baja.
//
// La validación es la del contacto del cliente (`@/shared/contactos/contacto`): una sola forma de
// contacto en el OS. El rol lo decide la RLS de Postgres (`es_administracion()`), no esta capa; si
// la base dice que no, acá se muestra su motivo — no se simula un éxito.
//
// CADA ESCRITURA PIDE DE VUELTA LA FILA QUE TOCÓ. Con RLS, un update o delete filtrado por la policy
// no da error: devuelve cero filas. Contestar «guardado» sin mirar eso es afirmar un efecto que no
// ocurrió.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { leerContacto } from '@/shared/contactos/contacto'
import type { ResultadoAccion } from '@/shared/components/ui'
import { sinFilaAfectada, traducirErrorContacto } from './contactosProveedor'

const idSchema = z.string().uuid()

const ID_INVALIDO: ResultadoAccion = { ok: false, error: 'No guardé nada: el identificador no es válido.' }

function refrescar() {
  revalidatePath('/administracion/proveedores', 'layout')
}

export async function crearContactoProveedor(proveedorId: string, form: FormData): Promise<ResultadoAccion> {
  if (!idSchema.safeParse(proveedorId).success) return ID_INVALIDO
  const leido = leerContacto(form)
  if (!leido.ok) return { ok: false, error: leido.error }
  const supabase = await createClient()
  const { data, error } = await supabase.from('proveedor_contacto')
    .insert({ proveedor_id: proveedorId, ...leido.fila })
    .select('id')
  if (error) return { ok: false, error: traducirErrorContacto(error) }
  const falta = sinFilaAfectada(data)
  if (falta) return { ok: false, error: falta }
  refrescar()
  return { ok: true, id: (data as { id: string }[])[0].id }
}

/**
 * Editar un contacto existente. El `proveedor_id` NO se toca —ni acá ni en el GRANT de la base—:
 * mudar una persona a otro proveedor no es una edición.
 */
export async function editarContactoProveedor(contactoId: string, form: FormData): Promise<ResultadoAccion> {
  if (!idSchema.safeParse(contactoId).success) return ID_INVALIDO
  const leido = leerContacto(form)
  if (!leido.ok) return { ok: false, error: leido.error }
  const supabase = await createClient()
  const { data, error } = await supabase.from('proveedor_contacto')
    .update(leido.fila).eq('id', contactoId)
    .select('id')
  if (error) return { ok: false, error: traducirErrorContacto(error) }
  const falta = sinFilaAfectada(data)
  if (falta) return { ok: false, error: falta }
  refrescar()
  return { ok: true }
}

export async function borrarContactoProveedor(contactoId: string): Promise<ResultadoAccion> {
  if (!idSchema.safeParse(contactoId).success) return ID_INVALIDO
  const supabase = await createClient()
  const { data, error } = await supabase.from('proveedor_contacto')
    .delete().eq('id', contactoId)
    .select('id')
  if (error) return { ok: false, error: traducirErrorContacto(error) }
  const falta = sinFilaAfectada(data)
  if (falta) return { ok: false, error: falta }
  refrescar()
  return { ok: true }
}
