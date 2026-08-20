'use server'

// PROVEEDORES — las acciones que ESCRIBEN el maestro y las que resuelven un nombre del Sheet.
//
// ═══ LA VALIDACIÓN DE ACÁ NO ES LA QUE IMPIDE EL DUPLICADO ═══
//
// Lo que impide de verdad dos proveedores con el mismo CUIT es el índice único de Postgres
// (`proveedores_cuit_unico`). Esta capa comprueba antes sólo para poder decir "ya existe, es este"
// con el nombre del proveedor que estorba, en vez de dejar salir un `23505 duplicate key value
// violates unique constraint` que no le dice nada a quien está cargando. Si esta comprobación
// fallara, la base sigue rechazando: el control está en los dos lados y el de abajo es el que manda.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import {
  normalizarCuit,
  normalizarNombreProveedor,
} from '../../../../orquestador/lib/proveedor-identidad.mjs'

export type Resultado = { ok: true; id?: string } | { ok: false; error: string }

const cuitSchema = z
  .string()
  .trim()
  .transform((v) => normalizarCuit(v))
  .refine((v) => v === '' || v.length === 11, 'El CUIT tiene 11 dígitos')

const proveedorSchema = z.object({
  nombre: z.string().trim().min(2, 'El nombre es obligatorio'),
  razon_social: z.string().trim().optional(),
  cuit: cuitSchema.optional(),
  notas: z.string().trim().optional(),
})

const texto = (v: string | undefined) => (v && v.trim() ? v.trim() : null)

/** Quién más ocupa ya esta identidad. Devuelve el mensaje listo para mostrar, o null si está libre. */
async function identidadOcupada(
  supabase: Awaited<ReturnType<typeof createClient>>,
  nombre: string,
  cuit: string | null,
  excluirId?: string,
): Promise<string | null> {
  if (cuit) {
    let q = supabase.from('proveedores').select('id, nombre').eq('cuit', cuit)
    if (excluirId) q = q.neq('id', excluirId)
    const { data } = await q.maybeSingle()
    if (data) return `El CUIT ya es de "${(data as { nombre: string }).nombre}"`
  }
  // El nombre se compara NORMALIZADO, que es como lo compara el índice único: si acá se comparara
  // el texto crudo, "Alumetal" y "ALUMETAL" pasarían el control y reventarían contra la base.
  const norm = normalizarNombreProveedor(nombre)
  let q = supabase.from('proveedores').select('id, nombre')
  if (excluirId) q = q.neq('id', excluirId)
  const { data } = await q
  const choque = ((data ?? []) as { id: string; nombre: string }[]).find(
    (p) => normalizarNombreProveedor(p.nombre) === norm,
  )
  if (choque) return `Ya existe un proveedor con ese nombre: "${choque.nombre}"`
  return null
}

export async function crearProveedor(form: FormData): Promise<Resultado> {
  const parsed = proveedorSchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const d = parsed.data
  const cuit = d.cuit ? d.cuit : null

  const supabase = await createClient()
  const ocupada = await identidadOcupada(supabase, d.nombre, cuit)
  if (ocupada) return { ok: false, error: ocupada }

  const { data, error } = await supabase
    .from('proveedores')
    .insert({ nombre: d.nombre, razon_social: texto(d.razon_social), cuit, notas: texto(d.notas) })
    .select('id')
    .single()
  if (error) return { ok: false, error: error.message }
  revalidatePath('/administracion/proveedores')
  return { ok: true, id: data.id as string }
}

export async function editarProveedor(proveedorId: string, form: FormData): Promise<Resultado> {
  const parsed = proveedorSchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const d = parsed.data
  const cuit = d.cuit ? d.cuit : null

  const supabase = await createClient()
  const ocupada = await identidadOcupada(supabase, d.nombre, cuit, proveedorId)
  if (ocupada) return { ok: false, error: ocupada }

  const { error } = await supabase
    .from('proveedores')
    .update({ nombre: d.nombre, razon_social: texto(d.razon_social), cuit, notas: texto(d.notas) })
    .eq('id', proveedorId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/administracion/proveedores')
  return { ok: true }
}

/** Archivar NO es borrar: sale de la lista operativa y los costos ya imputados no se tocan. */
export async function archivarProveedor(proveedorId: string, activo: boolean): Promise<Resultado> {
  const supabase = await createClient()
  const { error } = await supabase.from('proveedores').update({ activo }).eq('id', proveedorId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/administracion/proveedores')
  return { ok: true }
}

// ── LA RESOLUCIÓN DE UN NOMBRE DEL SHEET ────────────────────────────────────────────────────────
//
// Las tres acciones de abajo son las únicas que escriben `proveedor_alias`, y las tres las dispara
// una persona con un clic. NO existe —ni debe existir— un proceso que las llame en lote sobre un
// criterio de similitud: ahí es donde nacen las imputaciones inventadas.

const vincularSchema = z.object({
  nombre_norm: z.string().trim().min(1, 'Falta el nombre a vincular'),
  nombre_origen: z.string().trim().min(1, 'Falta el nombre original'),
  proveedor_id: z.string().uuid('Elegí un proveedor de la lista'),
  notas: z.string().trim().optional(),
})

/** Este texto del Sheet ES este proveedor. Lo decide una persona y queda con su firma. */
export async function vincularNombre(form: FormData): Promise<Resultado> {
  const parsed = vincularSchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const d = parsed.data

  const supabase = await createClient()
  const { error } = await supabase.from('proveedor_alias').insert({
    // Se re-normaliza acá y no se confía en lo que vino del formulario: el campo viaja oculto y
    // cualquiera puede editarlo con las devtools abiertas. La clave tiene que ser la canónica.
    nombre_norm: normalizarNombreProveedor(d.nombre_norm),
    nombre_origen: d.nombre_origen,
    proveedor_id: d.proveedor_id,
    estado: 'vinculado',
    notas: texto(d.notas),
  })
  if (error) return { ok: false, error: error.message }
  revalidatePath('/administracion/proveedores')
  return { ok: true }
}

/**
 * Crear el proveedor Y vincularle el nombre, en un solo paso.
 *
 * Es el caso más frecuente de la cola: el nombre del Sheet es un proveedor real que todavía no está
 * en el maestro. Separarlo en dos pantallas obligaría a crear el proveedor, volver, buscarlo y
 * vincularlo — y en el medio se pierde cuál era el nombre exacto que había que resolver.
 *
 * Si el alta sale bien y la vinculación falla, se DESHACE el alta: un proveedor recién creado que
 * nadie pidió, huérfano y sin comprobantes, es basura que después hay que salir a distinguir de los
 * proveedores de verdad.
 */
export async function crearYVincular(nombreNorm: string, nombreOrigen: string, form: FormData): Promise<Resultado> {
  const creado = await crearProveedor(form)
  if (!creado.ok) return creado

  const supabase = await createClient()
  const { error } = await supabase.from('proveedor_alias').insert({
    nombre_norm: normalizarNombreProveedor(nombreNorm),
    nombre_origen: nombreOrigen,
    proveedor_id: creado.id,
    estado: 'vinculado',
  })
  if (error) {
    await supabase.from('proveedores').delete().eq('id', creado.id as string)
    return { ok: false, error: `No pude vincular el nombre, así que no creé el proveedor: ${error.message}` }
  }
  revalidatePath('/administracion/proveedores')
  return { ok: true, id: creado.id }
}

/**
 * "Esto no es un proveedor."
 *
 * Sin esta salida la cola nunca llega a cero: "SUELDOS" (58 comprobantes), "ARCA" (34),
 * "SINDICATOS" (24) y "BANCO" (12) son conceptos de gasto, no proveedores, y quedarían para siempre
 * arriba de la lista pidiendo que alguien les invente uno. Una lista que no puede vaciarse deja de
 * mirarse, y ahí es donde se pierde el pendiente que sí importaba.
 */
export async function marcarNoEsProveedor(nombreNorm: string, nombreOrigen: string, notas?: string): Promise<Resultado> {
  const supabase = await createClient()
  const { error } = await supabase.from('proveedor_alias').insert({
    nombre_norm: normalizarNombreProveedor(nombreNorm),
    nombre_origen: nombreOrigen,
    proveedor_id: null,
    estado: 'no_es_proveedor',
    notas: texto(notas),
  })
  if (error) return { ok: false, error: error.message }
  revalidatePath('/administracion/proveedores')
  return { ok: true }
}

/** Deshacer una resolución equivocada: el nombre vuelve a la cola de pendientes. */
export async function deshacerResolucion(aliasId: string): Promise<Resultado> {
  const supabase = await createClient()
  const { error } = await supabase.from('proveedor_alias').delete().eq('id', aliasId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/administracion/proveedores')
  return { ok: true }
}
