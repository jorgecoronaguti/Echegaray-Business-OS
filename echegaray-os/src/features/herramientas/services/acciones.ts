'use server'

// LAS ESCRITURAS DEL MÓDULO — todas por las funciones de la base (migración 20260921T2100).
//
// Nunca un insert/update a `activo`, `ubicacion`, `activo_movimiento` ni `activo_incidencia`: las tablas
// no tienen policy de escritura y la ubicación sólo cambia insertando un movimiento dentro de
// `mover_activos()`. Acá sólo se valida la forma (Zod) y se traduce la respuesta. Las reglas —baja no
// se mueve, obra de destino activa, rodado con carga— las hace cumplir la base, no esta capa.
//
// Permisos iguales para todos los niveles (dueño, 21/09): no se filtra por rol. La base exige un usuario
// logueado y nada más.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { faltaMigracion, MIGRACION } from '../logica/falta-migracion'
import { normalizarCodigo } from '../logica/codigo'

export type Resultado<T = null> = { ok: true; dato: T; mensaje?: string } | { ok: false; error: string }

const uuid = z.string().uuid()

function traducir(e: { code?: string; message: string }): string {
  if (faltaMigracion(e)) return `El módulo espera la migración ${MIGRACION}: todavía no se puede escribir.`
  if (e.code === '42501') return 'Hace falta entrar con tu usuario para registrar esto.'
  if (e.code === '23505') return 'Ese código (o esa patente) ya existe en el inventario.'
  if (e.code === '23514') return 'El código son tres letras y un número, por ejemplo AMO-007.'
  return e.message
}

function refrescar() {
  revalidatePath('/herramientas', 'layout')
  revalidatePath('/campo/herramientas', 'layout')
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<Resultado<T>> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc(fn, args)
    if (error) return { ok: false, error: traducir(error) }
    refrescar()
    return { ok: true, dato: data as T }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'No se pudo conectar con la base' }
  }
}

/** «u:<uuid>» = una ubicación existente; «obra:<id>» = una obra del índice (la ubicación la crea la base). */
const destinoSchema = z.string().regex(/^(u:[0-9a-f-]{36}|obra:[^\s]{1,80})$/, 'Elegí a dónde va')

async function resolverDestino(destino: string): Promise<Resultado<string>> {
  if (destino.startsWith('u:')) return { ok: true, dato: destino.slice(2) }
  return rpc<string>('ubicacion_de_obra', { p_obra_id: destino.slice(5) })
}

const moverSchema = z.object({
  activos: z.array(uuid).min(1, 'No hay nada para mover').max(500),
  destino: destinoSchema,
  nota: z.string().trim().max(400).optional(),
  bajarCarga: z.boolean().default(false),
})

export async function moverActivosAction(entrada: z.input<typeof moverSchema>): Promise<Resultado<string | null>> {
  const p = moverSchema.safeParse(entrada)
  if (!p.success) return { ok: false, error: p.error.issues[0].message }
  const d = await resolverDestino(p.data.destino)
  if (!d.ok) return d
  const r = await rpc<string | null>('mover_activos', {
    p_activos: p.data.activos, p_destino: d.dato, p_nota: p.data.nota || null, p_bajar_carga: p.data.bajarCarga,
  })
  if (r.ok && r.dato === null) return { ok: true, dato: null, mensaje: 'Ya estaban ahí: no se registró ningún movimiento.' }
  return r
}

async function subirFoto(file: File, carpeta: string): Promise<Resultado<string>> {
  if (!file.type.startsWith('image/')) return { ok: false, error: 'La foto tiene que ser una imagen' }
  if (file.size > 12 * 1024 * 1024) return { ok: false, error: 'La foto pesa más de 12 MB' }
  try {
    const supabase = await createClient()
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
    const ruta = `activos/${carpeta.replace(/[^A-Za-z0-9_-]/g, '_')}/${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('herramientas').upload(ruta, file, { contentType: file.type, upsert: false })
    if (error) return { ok: false, error: `No se pudo subir la foto: ${error.message}` }
    return { ok: true, dato: supabase.storage.from('herramientas').getPublicUrl(ruta).data.publicUrl }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'No se pudo subir la foto' }
  }
}

function archivo(v: FormDataEntryValue | null): File | null {
  return v instanceof File && v.size > 0 ? v : null
}

const reportarSchema = z.object({
  activo: uuid,
  tipo: z.enum(['fallando', 'no_anda', 'no_encontrada'], { message: 'Elegí qué le pasa' }),
  texto: z.string().trim().max(400).optional(),
})

export async function reportarProblemaAction(form: FormData): Promise<Resultado<string>> {
  const p = reportarSchema.safeParse({
    activo: form.get('activo'), tipo: form.get('tipo'), texto: form.get('texto') || undefined,
  })
  if (!p.success) return { ok: false, error: p.error.issues[0].message }
  let foto: string | null = null
  const f = archivo(form.get('foto'))
  if (f) {
    const s = await subirFoto(f, `incidencias/${p.data.activo}`)
    if (!s.ok) return s
    foto = s.dato
  }
  return rpc<string>('reportar_problema_activo', {
    p_activo: p.data.activo, p_tipo: p.data.tipo, p_texto: p.data.texto || null, p_foto_url: foto,
  })
}

const verificacionSchema = z.object({
  activo: uuid,
  /** null = no se cargó (sin odómetro u horómetro que funcione). */
  lectura: z.number().min(0, 'La lectura no puede ser negativa').max(9_999_999).nullable(),
  checklist: z.record(z.string().regex(/^[a-z_]{3,40}$/), z.enum(['bien', 'mal'])),
  observacion: z.string().trim().max(400).optional(),
  operador: uuid.optional(),
})

export interface VerificacionHecha {
  id: string
  incidencia_id: string | null
  estado_resultante: string
  criticos_mal: string[]
  no_criticos_mal: string[]
}

/**
 * M10 · M13. La base (`registrar_verificacion_uso`, migración 20260922T1200) valida el checklist,
 * rechaza un km u horómetro que baja y, si hay un «Mal» crítico, deja el activo fuera de servicio.
 */
export async function registrarVerificacionAction(entrada: z.input<typeof verificacionSchema>): Promise<Resultado<VerificacionHecha>> {
  const p = verificacionSchema.safeParse(entrada)
  if (!p.success) return { ok: false, error: p.error.issues[0].message }
  const r = await rpc<VerificacionHecha>('registrar_verificacion_uso', {
    p_activo: p.data.activo, p_lectura: p.data.lectura, p_checklist: p.data.checklist,
    p_observacion: p.data.observacion || null, p_operador: p.data.operador ?? null,
  })
  // `traducir` nombra la migración de la etapa 1; la que falta acá es la de la verificación.
  if (!r.ok && r.error.startsWith('El módulo espera la migración')) {
    return { ok: false, error: 'Falta aplicar la migración 20260922T1200 de la verificación de uso: todavía no se puede registrar.' }
  }
  return r
}

const estadoSchema = z.object({
  activo: uuid,
  estado: z.enum(['operativo', 'requiere_mantenimiento', 'fuera_servicio', 'reparacion_externa']),
  nota: z.string().trim().max(400).optional(),
})

export async function cambiarEstadoAction(entrada: z.input<typeof estadoSchema>): Promise<Resultado> {
  const p = estadoSchema.safeParse(entrada)
  if (!p.success) return { ok: false, error: p.error.issues[0].message }
  return rpc<null>('cambiar_estado_activo', { p_activo: p.data.activo, p_estado: p.data.estado, p_nota: p.data.nota || null })
}

const bajaSchema = z.object({
  activo: uuid,
  motivo: z.enum(['robada', 'perdida', 'descartada', 'vendida'], { message: 'El motivo es obligatorio' }),
  detalle: z.string().trim().max(400).optional(),
})

export async function darDeBajaAction(entrada: z.input<typeof bajaSchema>): Promise<Resultado> {
  const p = bajaSchema.safeParse(entrada)
  if (!p.success) return { ok: false, error: p.error.issues[0].message }
  return rpc<null>('dar_de_baja_activo', { p_activo: p.data.activo, p_motivo: p.data.motivo, p_detalle: p.data.detalle || null })
}

const altaSchema = z.object({
  clase: z.enum(['herramienta', 'equipo', 'rodado']),
  nombre: z.string().trim().min(2, 'El nombre es obligatorio').max(160),
  categoria: z.string().trim().max(60).optional(),
  destino: destinoSchema.optional(),
  // Tres letras (el número lo pone la base), un código completo AMO-007 libre, o el de una etiqueta
  // escaneada. La base decide si sirve y, si no, dice qué espera (`_codigo_propuesto`).
  codigo: z.string().trim().max(40).optional(),
  patente: z.string().trim().max(20).optional(),
  cantidad: z.coerce.number().int('La cantidad es un número entero').min(1, 'La cantidad es 1 o más').max(100000).default(1),
  desdeObra: z.boolean(),
})

/** Alta: devuelve el código que quedó (el que se escaneó o el que asignó la base). */
export async function darDeAltaAction(form: FormData): Promise<Resultado<{ id: string; codigo: string }>> {
  const p = altaSchema.safeParse({
    clase: form.get('clase'),
    nombre: form.get('nombre'),
    categoria: form.get('categoria') || undefined,
    destino: form.get('destino') || undefined,
    codigo: form.get('codigo') || undefined,
    patente: form.get('patente') || undefined,
    cantidad: form.get('cantidad') || undefined,
    desdeObra: form.get('desde_obra') === '1',
  })
  if (!p.success) return { ok: false, error: p.error.issues[0].message }
  const codigo = p.data.codigo ? normalizarCodigo(p.data.codigo) : null
  let ubicacion: string | null = null
  if (p.data.destino) {
    const d = await resolverDestino(p.data.destino)
    if (!d.ok) return d
    ubicacion = d.dato
  }
  let foto: string | null = null
  const f = archivo(form.get('foto'))
  if (f) {
    const s = await subirFoto(f, codigo ?? 'alta')
    if (!s.ok) return s
    foto = s.dato
  }
  const r = await rpc<string>('dar_de_alta_activo', {
    p_clase: p.data.clase, p_nombre: p.data.nombre, p_ubicacion: ubicacion, p_categoria: p.data.categoria || null,
    p_codigo: codigo, p_patente: p.data.clase === 'rodado' ? p.data.patente || null : null,
    p_alta_desde_obra: p.data.desdeObra, p_foto_url: foto, p_cantidad: p.data.cantidad,
  })
  if (!r.ok) return r
  try {
    const supabase = await createClient()
    const { data } = await supabase.from('activo').select('codigo').eq('id', r.dato).maybeSingle()
    return { ok: true, dato: { id: r.dato, codigo: (data as { codigo: string } | null)?.codigo ?? codigo ?? '' } }
  } catch {
    return { ok: true, dato: { id: r.dato, codigo: codigo ?? '' } }
  }
}

const editarSchema = z.object({
  activo: uuid,
  datos: z.object({
    nombre: z.string().trim().min(2).max(160).optional(),
    categoria: z.string().trim().max(60).optional(),
    cantidad: z.number().int().min(1).max(100000).optional(),
    numero_serie: z.string().trim().max(80).optional(),
    patente: z.string().trim().max(20).optional(),
    compra_fecha: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/).optional(),
    compra_precio: z.string().regex(/^(\d+(\.\d{1,2})?)?$/).optional(),
    revisada: z.literal(true).optional(),
  }),
})

export async function editarActivoAction(entrada: z.input<typeof editarSchema>): Promise<Resultado> {
  const p = editarSchema.safeParse(entrada)
  if (!p.success) return { ok: false, error: p.error.issues[0].message }
  return rpc<null>('editar_activo', { p_activo: p.data.activo, p_datos: p.data.datos })
}

export async function cambiarFotoAction(form: FormData): Promise<Resultado> {
  const id = uuid.safeParse(form.get('activo'))
  if (!id.success) return { ok: false, error: 'Falta el activo' }
  const f = archivo(form.get('foto'))
  if (!f) return { ok: false, error: 'Elegí una foto' }
  const s = await subirFoto(f, id.data)
  if (!s.ok) return s
  return rpc<null>('editar_activo', { p_activo: id.data, p_datos: { foto_url: s.dato } })
}

/** Marca impresas las etiquetas de una tanda. Una por una: `editar_activo` recibe un activo. */
export async function marcarEtiquetasImpresasAction(activos: string[]): Promise<Resultado<number>> {
  const p = z.array(uuid).min(1).max(500).safeParse(activos)
  if (!p.success) return { ok: false, error: 'No hay etiquetas para marcar' }
  let hechas = 0
  for (const id of p.data) {
    const r = await rpc<null>('editar_activo', { p_activo: id, p_datos: { etiqueta_impresa: true } })
    if (!r.ok) return { ok: false, error: `Se marcaron ${hechas} de ${p.data.length}: ${r.error}` }
    hechas++
  }
  return { ok: true, dato: hechas }
}

const ubicacionSchema = z.object({
  tipo: z.enum(['servicio_tecnico', 'tercero']),
  nombre: z.string().trim().min(2, 'El nombre es obligatorio').max(120),
  contacto: z.string().trim().max(200).optional(),
})

export async function crearUbicacionAction(entrada: z.input<typeof ubicacionSchema>): Promise<Resultado<string>> {
  const p = ubicacionSchema.safeParse(entrada)
  if (!p.success) return { ok: false, error: p.error.issues[0].message }
  return rpc<string>('crear_ubicacion', { p_tipo: p.data.tipo, p_nombre: p.data.nombre, p_contacto: p.data.contacto || null })
}

export type SugerenciaCodigo =
  | { valido: true; prefijo: string; sugerido_del_nombre: string; codigo: string; usados_con_ese_prefijo: number }
  | { valido: false; prefijo: string; motivo: string }

/**
 * Cómo quedaría el código mientras se escribe el nombre o el prefijo. No reserva nada: el alta o el
 * cambio lo vuelven a calcular en la base, bajo candado. Es una lectura: no refresca pantallas.
 */
export async function sugerirCodigoAction(nombre: string, prefijo?: string): Promise<Resultado<SugerenciaCodigo>> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('sugerir_codigo_activo', {
      p_nombre: nombre.slice(0, 160), p_prefijo: prefijo ? prefijo.slice(0, 3) : null,
    })
    if (error) return { ok: false, error: traducir(error) }
    return { ok: true, dato: data as SugerenciaCodigo }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'No se pudo conectar con la base' }
  }
}

const cambiarCodigoSchema = z.object({
  activo: uuid,
  prefijo: z.string().regex(/^[A-Z]{3}$/, 'El prefijo son tres letras, sin acentos ni números'),
})

/** Cambia el código eligiendo otras tres letras: el número lo pone la base; el viejo queda como anterior. */
export async function cambiarCodigoAction(entrada: z.input<typeof cambiarCodigoSchema>): Promise<Resultado<string>> {
  const p = cambiarCodigoSchema.safeParse(entrada)
  if (!p.success) return { ok: false, error: p.error.issues[0].message }
  return rpc<string>('cambiar_codigo_activo', { p_activo: p.data.activo, p_codigo: p.data.prefijo })
}
