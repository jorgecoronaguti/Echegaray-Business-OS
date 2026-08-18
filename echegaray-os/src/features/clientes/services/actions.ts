'use server'

// CLIENTE — las acciones que ESCRIBEN. Toda entrada se valida con Zod antes de tocar la base.
//
// El rol lo decide la RLS de Postgres, no esta capa: `clientes`, `cliente_contacto` y
// `cliente_documento` sólo admiten escritura de dirección y administración. Si alguien más lo
// intenta, la base devuelve el error y acá se muestra — no se simula un éxito.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
// Qué hacer cuando la migración de la relación está en el repositorio y no en la base: el criterio
// —y la regla de no guardar de menos en silencio— vive en su propio módulo, con tests.
import { faltaLaRelacion, mensajeDeMigracion, sinLaRelacion } from './migracionPendiente'

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

// Un email vacío es «no lo sé», no un email inválido: el campo es opcional y el formulario no puede
// plantarse por un dato que nadie prometió tener.
const emailSchema = z.union([z.string().trim().email('Revisá el email: no tiene formato de correo'), z.literal('')]).optional()

const clienteSchema = z.object({
  nombre: z.string().trim().min(2, 'El nombre es obligatorio'),
  cuit: cuitSchema.optional(),
  direccion: z.string().trim().max(300).optional(),
  telefono: z.string().trim().max(60).optional(),
  email: emailSchema,
  // El responsable llega como el id de un perfil real o vacío. Un texto libre acá haría que
  // «Rodrigo» y «R. Echegaray» fueran dos responsables distintos.
  responsable_id: z.union([z.string().uuid('Elegí un responsable de la lista'), z.literal('')]).optional(),
  drive_carpeta_id: z.string().trim().optional(),
  notas: z.string().trim().optional(),
})

/** Los campos de la ficha, listos para la base. `''` se guarda como null: vacío es SIN DATO. */
function aFila(d: z.infer<typeof clienteSchema>) {
  return {
    nombre: d.nombre,
    cuit: d.cuit || null,
    direccion: d.direccion || null,
    telefono: d.telefono || null,
    email: d.email || null,
    responsable_id: d.responsable_id || null,
    drive_carpeta_id: d.drive_carpeta_id || null,
    notas: d.notas || null,
  }
}

export async function crearCliente(form: FormData): Promise<Resultado> {
  const parsed = clienteSchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

  const supabase = await createClient()
  // El slug tiene que ser único: si ya existe, se avisa en vez de crear un segundo cliente con el
  // mismo identificador y que uno de los dos quede inalcanzable.
  const slug = aSlug(parsed.data.nombre)
  const { data: existe } = await supabase.from('clientes').select('id').eq('slug', slug).maybeSingle()
  if (existe) return { ok: false, error: `Ya hay un cliente con el identificador "${slug}"` }

  const fila: Record<string, unknown> = { ...aFila(parsed.data), slug }
  let { data, error } = await supabase.from('clientes').insert(fila).select('id').single()
  if (error && faltaLaRelacion(error)) {
    const reducida = sinLaRelacion(fila)
    if (!reducida) return { ok: false, error: mensajeDeMigracion(error) }
    ;({ data, error } = await supabase.from('clientes').insert(reducida).select('id').single())
  }
  if (error) return { ok: false, error: error.message }
  revalidatePath('/clientes', 'layout')
  return { ok: true, id: data!.id as string }
}

export async function editarCliente(clienteId: string, form: FormData): Promise<Resultado> {
  const parsed = clienteSchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

  const supabase = await createClient()
  // El slug NO se recalcula al renombrar: es la URL del cliente y lo que apuntan los enlaces que
  // alguien ya compartió. Corregir "Messinas" a "Messina SRL" no puede romper una dirección.
  const fila: Record<string, unknown> = aFila(parsed.data)
  let { error } = await supabase.from('clientes').update(fila).eq('id', clienteId)
  if (error && faltaLaRelacion(error)) {
    const reducida = sinLaRelacion(fila)
    if (!reducida) return { ok: false, error: mensajeDeMigracion(error) }
    ;({ error } = await supabase.from('clientes').update(reducida).eq('id', clienteId))
  }
  if (error) return { ok: false, error: error.message }
  revalidatePath('/clientes', 'layout')
  return { ok: true }
}

/**
 * Archivar NO es borrar: el cliente sale de la lista operativa y su historia queda intacta.
 *
 * EL EFECTO, que hasta acá no existía: `separarArchivados` lo saca de `/clientes`, la ficha sigue
 * abriendo por su URL y el pie de la lista dice cuántos hay guardados y cómo verlos. Escribir
 * `activo = false` en una columna que nadie leía era el verbo sin la consecuencia.
 */
export async function archivarCliente(clienteId: string, activo: boolean): Promise<Resultado> {
  const supabase = await createClient()
  const { error } = await supabase.from('clientes').update({ activo }).eq('id', clienteId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/clientes', 'layout')
  return { ok: true }
}

// ── CONTACTOS ──────────────────────────────────────────────────────────────────────────────────

const contactoSchema = z.object({
  nombre: z.string().trim().min(2, 'El nombre del contacto es obligatorio'),
  rol: z.string().trim().max(120).optional(),
  email: emailSchema,
  telefono: z.string().trim().max(60).optional(),
  notas: z.string().trim().max(400).optional(),
})

function aFilaContacto(d: z.infer<typeof contactoSchema>) {
  return {
    nombre: d.nombre,
    rol: d.rol || null,
    email: d.email || null,
    telefono: d.telefono || null,
    notas: d.notas || null,
  }
}

export async function crearContacto(clienteId: string, form: FormData): Promise<Resultado> {
  const parsed = contactoSchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const supabase = await createClient()
  const { error } = await supabase.from('cliente_contacto')
    .insert({ cliente_id: clienteId, ...aFilaContacto(parsed.data) })
  if (error) return { ok: false, error: error.message }
  revalidatePath('/clientes', 'layout')
  return { ok: true }
}

/**
 * Editar un contacto EXISTENTE. Sin esto, corregir un teléfono mal anotado obligaba a borrar la
 * persona y volver a cargarla: se perdía la fecha en que entró a la relación —que es un evento de la
 * solapa Actividad— por cambiar un dígito.
 *
 * El `cliente_id` NO se toca: mudar un contacto de cliente no es una edición, y dejarlo editable
 * permitiría moverlo desde el navegador.
 */
export async function editarContacto(contactoId: string, form: FormData): Promise<Resultado> {
  const parsed = contactoSchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const supabase = await createClient()
  const { error } = await supabase.from('cliente_contacto')
    .update(aFilaContacto(parsed.data)).eq('id', contactoId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/clientes', 'layout')
  return { ok: true }
}

export async function borrarContacto(contactoId: string): Promise<Resultado> {
  const supabase = await createClient()
  const { error } = await supabase.from('cliente_contacto').delete().eq('id', contactoId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/clientes', 'layout')
  return { ok: true }
}
