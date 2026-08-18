'use server'

// CLIENTE — las acciones que ESCRIBEN. Toda entrada se valida con Zod antes de tocar la base.
//
// El rol lo decide la RLS de Postgres, no esta capa: `cliente_contacto` y `cliente_documento` sólo
// admiten escritura de dirección y administración. Si alguien más lo intenta, la base devuelve el
// error y acá se muestra — no se simula un éxito.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

export type Resultado = { ok: true; id?: string } | { ok: false; error: string }

/** El identificador legible: se deriva del nombre y NO cambia cuando se corrige la razón social. */
function aSlug(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50)
}

// El CUIT se guarda con 11 dígitos y sin guiones: escrito de dos formas distintas deja de servir
// para cruzar contra ARCA, que es para lo único que existe esta columna.
const cuitSchema = z.string().trim().transform((v) => v.replace(/\D/g, ''))
  .refine((v) => v === '' || v.length === 11, 'El CUIT tiene 11 dígitos')

const clienteSchema = z.object({
  nombre: z.string().trim().min(2, 'El nombre es obligatorio'),
  cuit: cuitSchema.optional(),
  drive_carpeta_id: z.string().trim().optional(),
  notas: z.string().trim().optional(),
})

export async function crearCliente(form: FormData): Promise<Resultado> {
  const parsed = clienteSchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const { nombre, cuit, drive_carpeta_id, notas } = parsed.data

  const supabase = await createClient()
  // El slug tiene que ser único: si ya existe, se avisa en vez de crear un segundo cliente con el
  // mismo identificador y que uno de los dos quede inalcanzable.
  const slug = aSlug(nombre)
  const { data: existe } = await supabase.from('clientes').select('id').eq('slug', slug).maybeSingle()
  if (existe) return { ok: false, error: `Ya hay un cliente con el identificador "${slug}"` }

  const { data, error } = await supabase.from('clientes')
    .insert({ nombre, slug, cuit: cuit || null, drive_carpeta_id: drive_carpeta_id || null, notas: notas || null })
    .select('id').single()
  if (error) return { ok: false, error: error.message }
  revalidatePath('/clientes', 'layout')
  return { ok: true, id: data.id as string }
}

export async function editarCliente(clienteId: string, form: FormData): Promise<Resultado> {
  const parsed = clienteSchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const { nombre, cuit, drive_carpeta_id, notas } = parsed.data

  const supabase = await createClient()
  // El slug NO se recalcula al renombrar: es la URL del cliente y lo que apuntan los enlaces que
  // alguien ya compartió. Corregir "Messinas" a "Messina SRL" no puede romper una dirección.
  const { error } = await supabase.from('clientes')
    .update({ nombre, cuit: cuit || null, drive_carpeta_id: drive_carpeta_id || null, notas: notas || null })
    .eq('id', clienteId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/clientes', 'layout')
  return { ok: true }
}

/** Archivar NO es borrar: el cliente sale de la lista operativa y su historia queda intacta. */
export async function archivarCliente(clienteId: string, activo: boolean): Promise<Resultado> {
  const supabase = await createClient()
  const { error } = await supabase.from('clientes').update({ activo }).eq('id', clienteId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/clientes', 'layout')
  return { ok: true }
}

const contactoSchema = z.object({
  nombre: z.string().trim().min(2, 'El nombre del contacto es obligatorio'),
  rol: z.string().trim().optional(),
  email: z.union([z.string().trim().email('Email inválido'), z.literal('')]).optional(),
  telefono: z.string().trim().optional(),
  notas: z.string().trim().optional(),
})

export async function crearContacto(clienteId: string, form: FormData): Promise<Resultado> {
  const parsed = contactoSchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const supabase = await createClient()
  const { error } = await supabase.from('cliente_contacto').insert({
    cliente_id: clienteId,
    nombre: parsed.data.nombre,
    rol: parsed.data.rol || null,
    email: parsed.data.email || null,
    telefono: parsed.data.telefono || null,
    notas: parsed.data.notas || null,
  })
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/clientes`)
  return { ok: true }
}

export async function borrarContacto(contactoId: string): Promise<Resultado> {
  const supabase = await createClient()
  const { error } = await supabase.from('cliente_contacto').delete().eq('id', contactoId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/clientes', 'layout')
  return { ok: true }
}

// El vínculo a Drive acepta la URL entera y se queda con el id: nadie tiene por qué saber dónde
// termina el id dentro de una URL de Drive, y pedirlo suelto es la forma más rápida de que se
// cargue mal.
const ID_DRIVE = /(?:\/folders\/|\/d\/|[?&]id=)([A-Za-z0-9_-]{20,})/
export async function vincularCarpetaDrive(clienteId: string, urlOId: string): Promise<Resultado> {
  const v = String(urlOId).trim()
  const id = v.match(ID_DRIVE)?.[1] ?? (/^[A-Za-z0-9_-]{20,}$/.test(v) ? v : null)
  if (!id) return { ok: false, error: 'No reconocí un id de carpeta de Drive en eso' }
  const supabase = await createClient()
  const { error } = await supabase.from('clientes').update({ drive_carpeta_id: id }).eq('id', clienteId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/clientes', 'layout')
  return { ok: true }
}

/**
 * Vincula UN documento suelto de Drive al cliente. Queda marcado `manual` para distinguirlo del
 * vínculo que dedujo el sincronizador por la carpeta: quién lo colgó cambia cuánto se le cree.
 */
export async function vincularDocumento(clienteId: string, urlOId: string, rol?: string): Promise<Resultado> {
  const v = String(urlOId).trim()
  const id = v.match(ID_DRIVE)?.[1] ?? (/^[A-Za-z0-9_-]{20,}$/.test(v) ? v : null)
  if (!id) return { ok: false, error: 'No reconocí un id de archivo de Drive en eso' }
  const supabase = await createClient()
  const { error } = await supabase.from('cliente_documento')
    .upsert({ cliente_id: clienteId, drive_file_id: id, rol: rol || null, origen: 'manual' },
            { onConflict: 'cliente_id,drive_file_id' })
  if (error) return { ok: false, error: error.message }
  revalidatePath('/clientes', 'layout')
  return { ok: true }
}
