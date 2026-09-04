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
// LA MISMA PREGUNTA UNA SOLA VEZ. «¿Este proveedor ya está?» la contestan este formulario y el alta
// automática del cargador de comprobantes. Escrita dos veces serían dos respuestas posibles, que es
// exactamente el duplicado que las dos quieren evitar. Ver `orquestador/lib/alta-proveedor.mjs`.
import { identidadOcupadaPor } from '../../../../orquestador/lib/alta-proveedor.mjs'

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
  // UNA sola lectura para las dos comprobaciones: la tabla tiene decenas de filas, y dos viajes para
  // preguntar dos veces por el mismo maestro es pagar dos veces lo mismo.
  const { data } = await supabase.from('proveedores').select('id, nombre, cuit')
  const ocupada = identidadOcupadaPor((data ?? []) as ProveedorMinimo[], { nombre, cuit, excluirId })
  if (!ocupada) return null
  return ocupada.por === 'cuit'
    ? `El CUIT ya es de "${ocupada.proveedor.nombre}"`
    : `Ya existe un proveedor con ese nombre: "${ocupada.proveedor.nombre}"`
}

interface ProveedorMinimo { id: string; nombre: string; cuit: string | null }

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

// ─── LA CONFIRMACIÓN HUMANA DE UNA IDENTIDAD ─────────────────────────────────────────────────────
//
// ═══ POR QUÉ ES LA ESCRITURA MÁS VALIOSA DE ESTA PANTALLA ═══
//
// Ningún modelo puede relacionar «DUPEC» con «Dubos Ugarte Pedro Luis Raul»: no hay nada en el texto
// que los una. Cuando el CUIT no está cargado, la ÚNICA forma de que esos dos textos sean el mismo
// proveedor es que una persona lo diga una vez. Esa confirmación crea un alias verificado, y a
// partir de ahí ese nombre se resuelve solo, al instante y sin modelo — para siempre.
//
// ═══ POR QUÉ VA CON LLAVE DE SERVICIO Y NO CON LA SESIÓN ═══
//
// `ml_entidad_alias` es de sólo lectura para `authenticated` (ver `20260904T1800`). Un alias
// verificado fusiona dos proveedores, y una fusión mueve deuda de uno a otro: no puede escribirla
// cualquier sesión desde el navegador. Entra por acá, que valida el rol antes.
//
// QUÉ se escribe lo decide `orquestador/lib/ml/correccion.mjs`, que es puro y lo comparten esta
// pantalla y los scripts del OS. Una sola definición de «confirmar un proveedor».

import { createAdminClient } from '@/lib/supabase/admin'
import { getPerfilActual } from '@/features/auth/services/authService'
import { esAdministracion } from '@/features/auth/types/areas'
import { escriturasDeCorreccion, DECISION } from '../../../../orquestador/lib/ml/correccion.mjs'
import { normalizar } from '../../../../orquestador/lib/ml/normalizar.mjs'

const correccionSchema = z.object({
  resolucionId: z.coerce.number().int().positive(),
  decision: z.enum([DECISION.CONFIRMAR, DECISION.OTRO, DECISION.SIN_RESOLVER]),
  proveedorId: z.string().uuid().optional().nullable(),
})

export async function corregirIdentidad(form: FormData): Promise<Resultado> {
  const parsed = correccionSchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const d = parsed.data

  const supabase = await createClient()
  const perfil = await getPerfilActual(supabase)
  if (!esAdministracion(perfil.data?.rol ?? null)) return { ok: false, error: 'Esta acción es de Administración.' }
  // El autor sale de la sesión, NUNCA del formulario: una corrección sin autor verificable no se
  // puede auditar, y una firmada por quien no la hizo es peor que ninguna.
  const por = perfil.data?.id ?? null
  if (!por) return { ok: false, error: 'No pude identificar quién confirma.' }

  const { data: previa, error: eLectura } = await supabase
    .from('ml_resolucion').select('id, entidad, valor_original, entidad_id').eq('id', d.resolucionId).maybeSingle()
  if (eLectura) return { ok: false, error: eLectura.message }
  if (!previa) return { ok: false, error: 'Esa identidad ya no existe.' }

  const plan = escriturasDeCorreccion(previa, { decision: d.decision, entidadId: d.proveedorId ?? null, por })
  if (!plan.ok) return { ok: false, error: plan.porQue }

  const admin = createAdminClient()
  const { error: eUpd } = await admin.from('ml_resolucion').update({
    estado: plan.resolucion.estado,
    entidad_id_correcta: plan.resolucion.entidad_id_correcta,
    corregido_por: plan.resolucion.corregido_por,
    corregido_en: new Date().toISOString(),
  }).eq('id', plan.resolucion.id)
  if (eUpd) return { ok: false, error: eUpd.message }

  if (plan.alias) {
    // `alias_norm` se calcula con la MISMA `normalizar()` del resolver. Si acá se usara otra, el
    // alias quedaría guardado bajo una clave que el resolver nunca busca: escrito y sin efecto.
    const { error: eAlias } = await admin.from('ml_entidad_alias').upsert({
      entidad: plan.alias.entidad,
      entidad_id: plan.alias.entidad_id,
      alias: plan.alias.alias,
      alias_norm: normalizar(plan.alias.alias),
      fuente: plan.alias.fuente,
      confianza: plan.alias.confianza,
      verificado: plan.alias.verificado,
      verificado_por: plan.alias.verificado_por,
    }, { onConflict: 'entidad,alias_norm' })
    if (eAlias) return { ok: false, error: eAlias.message }
  }

  revalidatePath('/administracion/compras')
  revalidatePath('/administracion/proveedores')
  return { ok: true }
}
