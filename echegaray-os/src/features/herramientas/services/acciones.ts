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
import { leerOperadores } from './datos'
import { esRutaDeFoto, urlPublicaDeFoto } from '../logica/foto'
import { crearProveedor } from '@/features/administracion/services/proveedoresActions'

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

// LOTES REPARTIDOS (20260922T1300): cada renglón dice de qué lugar sale y cuántas unidades. La base
// no deja mandar más de las que hay en el origen.
const moverExistenciasSchema = z.object({
  items: z.array(z.object({
    activo: uuid,
    origen: uuid.nullable(),
    cantidad: z.number().int('La cantidad es un número entero').min(1, 'La cantidad es 1 o más'),
  })).min(1, 'No hay nada para mover').max(500),
  destino: destinoSchema,
  nota: z.string().trim().max(400).optional(),
  bajarCarga: z.boolean().default(false),
})

export async function moverExistenciasAction(entrada: z.input<typeof moverExistenciasSchema>): Promise<Resultado<string | null>> {
  const p = moverExistenciasSchema.safeParse(entrada)
  if (!p.success) return { ok: false, error: p.error.issues[0].message }
  const d = await resolverDestino(p.data.destino)
  if (!d.ok) return d
  const r = await rpc<string | null>('mover_existencias', {
    p_items: p.data.items, p_destino: d.dato, p_nota: p.data.nota || null, p_bajar_carga: p.data.bajarCarga,
  })
  if (r.ok && r.dato === null) return { ok: true, dato: null, mensaje: 'Ya estaban ahí: no se registró ningún movimiento.' }
  return r
}

const ajusteSchema = z.object({
  activo: uuid,
  ubicacion: uuid,
  cantidad: z.number().int('La cantidad es un número entero').min(1, 'Para dejar un lugar en 0 es una baja o un movimiento'),
  detalle: z.string().trim().max(400).optional(),
})

/** Recuento en un lugar («había 7, no 8»). Queda en `activo_ajuste`. */
export async function ajustarExistenciaAction(entrada: z.input<typeof ajusteSchema>): Promise<Resultado> {
  const p = ajusteSchema.safeParse(entrada)
  if (!p.success) return { ok: false, error: p.error.issues[0].message }
  return rpc<null>('ajustar_existencia', {
    p_activo: p.data.activo, p_ubicacion: p.data.ubicacion, p_cantidad: p.data.cantidad, p_detalle: p.data.detalle || null,
  })
}

const bajaParcialSchema = z.object({
  activo: uuid,
  ubicacion: uuid,
  cantidad: z.number().int('La cantidad es un número entero').min(1, 'La cantidad es 1 o más'),
  motivo: z.enum(['robada', 'perdida', 'descartada', 'vendida'], { message: 'El motivo es obligatorio' }),
  detalle: z.string().trim().max(400).optional(),
})

/** Baja de parte de un lote en un lugar. Si son todas las unidades que le quedan, es la baja total. */
export async function darDeBajaParcialAction(entrada: z.input<typeof bajaParcialSchema>): Promise<Resultado> {
  const p = bajaParcialSchema.safeParse(entrada)
  if (!p.success) return { ok: false, error: p.error.issues[0].message }
  return rpc<null>('dar_de_baja_parcial', {
    p_activo: p.data.activo, p_ubicacion: p.data.ubicacion, p_cantidad: p.data.cantidad,
    p_motivo: p.data.motivo, p_detalle: p.data.detalle || null,
  })
}

/**
 * LA FOTO NO PASA POR ACÁ. El navegador la pone en el bucket `herramientas` con la sesión del usuario
 * (`services/subida-foto.ts`) y esta capa recibe SÓLO la ruta del objeto: el cuerpo de una Server Action
 * tiene 1 MB de techo (4,5 MB en Vercel) y una foto de celular pesa más. Ver `logica/foto.ts`.
 */
function urlDeFoto(ruta: unknown): Resultado<string | null> {
  if (ruta == null || ruta === '') return { ok: true, dato: null }
  if (!esRutaDeFoto(ruta)) return { ok: false, error: 'La foto no quedó bien subida. Probá de nuevo.' }
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!base) return { ok: false, error: 'Falta la URL de Supabase en el servidor.' }
  return { ok: true, dato: urlPublicaDeFoto(base, ruta) }
}

const reportarSchema = z.object({
  activo: uuid,
  tipo: z.enum(['fallando', 'no_anda', 'no_encontrada'], { message: 'Elegí qué le pasa' }),
  texto: z.string().trim().max(400).optional(),
  /** Ruta de la foto ya subida al bucket (`subirFotoDeActivo`), o nada. */
  foto: z.string().max(200).optional(),
})

export async function reportarProblemaAction(entrada: z.input<typeof reportarSchema>): Promise<Resultado<string>> {
  const p = reportarSchema.safeParse(entrada)
  if (!p.success) return { ok: false, error: p.error.issues[0].message }
  const foto = urlDeFoto(p.data.foto)
  if (!foto.ok) return foto
  return rpc<string>('reportar_problema_activo', {
    p_activo: p.data.activo, p_tipo: p.data.tipo, p_texto: p.data.texto || null, p_foto_url: foto.dato,
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

/** Quiénes pueden figurar como operador de una máquina; lo pide el panel de verificación de escritorio. */
export async function leerOperadoresAction(): Promise<{ id: string; nombre: string }[]> {
  return leerOperadores()
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
  const foto = urlDeFoto(form.get('foto'))
  if (!foto.ok) return foto
  const r = await rpc<string>('dar_de_alta_activo', {
    p_clase: p.data.clase, p_nombre: p.data.nombre, p_ubicacion: ubicacion, p_categoria: p.data.categoria || null,
    p_codigo: codigo, p_patente: p.data.clase === 'rodado' ? p.data.patente || null : null,
    p_alta_desde_obra: p.data.desdeObra, p_foto_url: foto.dato, p_cantidad: p.data.cantidad,
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

/**
 * QUITAR LA FOTO (dueño, 23/09/2026: «me tenés que permitir borrar la foto, dejarlo sin foto»). Se vacía
 * `foto_url`; el archivo queda en el bucket (no se borra lo que ya se guardó; la ficha simplemente deja
 * de mostrarlo). `editar_activo` con `foto_url: ''` lo lleva a null.
 */
export async function quitarFotoAction(entrada: { activo: string }): Promise<Resultado> {
  const id = uuid.safeParse(entrada.activo)
  if (!id.success) return { ok: false, error: 'Falta el activo' }
  return rpc<null>('editar_activo', { p_activo: id.data, p_datos: { foto_url: '' } })
}

/** Guarda en la ficha la foto que el navegador ya subió al bucket. */
export async function cambiarFotoAction(entrada: { activo: string; ruta: string }): Promise<Resultado> {
  const id = uuid.safeParse(entrada.activo)
  if (!id.success) return { ok: false, error: 'Falta el activo' }
  if (!esRutaDeFoto(entrada.ruta)) return { ok: false, error: 'La foto no quedó bien subida. Probá de nuevo.' }
  const foto = urlDeFoto(entrada.ruta)
  if (!foto.ok) return foto
  return rpc<null>('editar_activo', { p_activo: id.data, p_datos: { foto_url: foto.dato } })
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

// Un tercero suelto (un préstamo a un conocido). Un servicio técnico ya no entra por acá: es un
// proveedor (`servicioTecnicoAction`, 20260923T2400).
const ubicacionSchema = z.object({
  tipo: z.enum(['tercero']),
  nombre: z.string().trim().min(2, 'El nombre es obligatorio').max(120),
  contacto: z.string().trim().max(200).optional(),
})

export async function crearUbicacionAction(entrada: z.input<typeof ubicacionSchema>): Promise<Resultado<string>> {
  const p = ubicacionSchema.safeParse(entrada)
  if (!p.success) return { ok: false, error: p.error.issues[0].message }
  return rpc<string>('crear_ubicacion', { p_tipo: p.data.tipo, p_nombre: p.data.nombre, p_contacto: p.data.contacto || null })
}

const servicioTecnicoSchema = z.union([
  z.object({ proveedorId: uuid }),
  z.object({ nombre: z.string().trim().min(2, 'El nombre es obligatorio').max(120), cuit: z.string().trim().max(13).optional() }),
])

/**
 * UN SERVICIO TÉCNICO ES UN PROVEEDOR (dueño, 23/09/2026). Se elige uno existente o se carga uno
 * nuevo en Proveedores (misma puerta que la ficha: el CUIT y el nombre repetidos se rechazan ahí) y
 * la base trae o crea su lugar (`ubicacion_de_proveedor`), clasificándolo como «Servicio técnico»
 * si todavía no tenía rubro. Devuelve el id del lugar.
 */
export async function servicioTecnicoAction(entrada: z.input<typeof servicioTecnicoSchema>): Promise<Resultado<string>> {
  const p = servicioTecnicoSchema.safeParse(entrada)
  if (!p.success) return { ok: false, error: p.error.issues[0].message }
  let proveedorId: string
  if ('proveedorId' in p.data) {
    proveedorId = p.data.proveedorId
  } else {
    const form = new FormData()
    form.set('nombre', p.data.nombre)
    if (p.data.cuit) form.set('cuit', p.data.cuit.replace(/\D/g, ''))
    const r = await crearProveedor(form)
    if (!r.ok) return { ok: false, error: r.error }
    if (!r.id) return { ok: false, error: 'Se cargó el proveedor pero la base no devolvió su id.' }
    proveedorId = r.id
  }
  return rpc<string>('ubicacion_de_proveedor', { p_proveedor: proveedorId, p_tipo: 'servicio_tecnico' })
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
