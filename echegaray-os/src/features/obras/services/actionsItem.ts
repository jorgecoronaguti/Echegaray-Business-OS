'use server'

// SERIE B · LAS ESCRITURAS DEL ÁRBOL: crear un ítem en su nivel, cargar el costo de MO de una historia,
// elegir el método de ponderación e insumos de una tarea.
//
// Mismas reglas que `actionsCrear.ts`: Zod en la puerta, Administración o jefatura (falla CERRADA),
// toda escritura acotada por `obra_id`, y el trigger `obra_actividad_nivel_t` como última palabra
// sobre qué cuelga de qué. Un campo vacío es NULL, nunca 0. Ningún formulario pide un % de peso.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getPerfilActual } from '@/features/auth/services/authService'
import { esAdministracion } from '@/features/auth/types/areas'
import type { Rol } from '@/features/auth/types'
import { claveDeActividad, slug } from './claves'
import type { Resultado } from './actions'
import type { NivelEstructura } from './estructura'

type Cliente = Awaited<ReturnType<typeof createClient>>
const SIN_PERMISO = 'Crear o cambiar la estructura de la obra es de Administración y de la jefatura de obra.'

async function esAdmin(supabase: Cliente): Promise<boolean> {
  const perfil = await getPerfilActual(supabase)
  if (perfil.error || !perfil.data) return false
  return esAdministracion((perfil.data as { rol?: Rol | null }).rol ?? null)
}

async function ordenSiguiente(supabase: Cliente, obraId: string): Promise<number> {
  const { data } = await supabase.from('obra_actividad')
    .select('orden').eq('obra_id', obraId).order('orden', { ascending: false }).limit(1).maybeSingle()
  return ((data?.orden as number) ?? 0) + 1
}

const fechaOpt = z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida'), z.literal('')]).optional()
const numOpt = z.union([z.literal(''), z.coerce.number().min(0, 'No puede ser negativo')]).optional()
const uuidOpt = z.union([z.string().uuid(), z.literal('')]).optional()
const vacio = <T,>(v: T | '' | undefined): T | null => (v === '' || v === undefined ? null : v)

const insumoSchema = z.object({
  tipo: z.enum(['activo', 'material']),
  activo_id: z.string().uuid().nullable().optional(),
  nombre: z.string().trim().min(2).max(160),
  cantidad: z.number().positive().nullable().optional(),
  unidad: z.string().trim().max(24).nullable().optional(),
})
type InsumoNuevo = z.infer<typeof insumoSchema>

const itemSchema = z.object({
  nombre: z.string().trim().min(2, 'El ítem necesita un nombre').max(200),
  padre_id: uuidOpt,
  unidad: z.string().trim().max(20).optional(),
  cantidad: numOpt,
  costo_mo: numOpt,
  partida_id: uuidOpt,
  plantilla_id: uuidOpt,
  metodo: z.union([z.enum(['cantidad', 'pasos', 'manual']), z.literal('')]).optional(),
  inicio_plan: fechaOpt,
  fin_plan: fechaOpt,
  cuadrilla_id: uuidOpt,
  responsable_id: uuidOpt,
  comentario: z.string().trim().max(400).optional(),
  destino: z.enum(['nota', 'pedido', 'impedimento']).optional(),
  ped_cantidad: numOpt,
  ped_unidad: z.string().trim().max(24).optional(),
  imp_responsable: z.string().trim().max(120).optional(),
  imp_compromiso: fechaOpt,
})

/** El nivel que le toca a una hija de `padre` (null = rubro). La misma escalera que la pantalla. */
function nivelHija(padre: { nivel: string | null; tipo: string } | null): NivelEstructura {
  if (!padre) return 'rubro'
  if (padre.nivel === 'rubro') return 'epica'
  if (padre.nivel === 'epica') return 'historia'
  if (padre.nivel === 'historia') return 'tarea'
  if (padre.nivel === 'tarea') return padre.tipo === 'resumen' ? 'tarea' : 'subtarea'
  throw new Error('Una subtarea no tiene hijas.')
}

/**
 * CREAR UN ÍTEM (B01–B05 · MB2). El NIVEL lo decide el padre, no el navegador. Rubro, épica e historia
 * nacen contenedores; tarea y subtarea, ejecutables. La historia trae su costo de MO (la fuente del
 * peso); la tarea trae fechas, método, insumos, subtareas y el destino del comentario.
 */
export async function crearItem(obraId: string, form: FormData): Promise<Resultado> {
  const parsed = itemSchema.safeParse(Object.fromEntries([...form.entries()].filter(([k]) => k !== 'insumo' && k !== 'subtarea')))
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const d = parsed.data
  if (d.inicio_plan && d.fin_plan && d.fin_plan < d.inicio_plan) return { ok: false, error: 'El fin no puede ser anterior al comienzo.' }
  let insumos: InsumoNuevo[] = []
  try {
    insumos = form.getAll('insumo').map((x) => insumoSchema.parse(JSON.parse(String(x))))
  } catch { return { ok: false, error: 'Un insumo llegó mal formado.' } }
  const subtareas = form.getAll('subtarea').map((x) => String(x).trim()).filter((x) => x.length >= 2).slice(0, 50)

  const supabase = await createClient()
  if (!await esAdmin(supabase)) return { ok: false, error: SIN_PERMISO }

  let padre: { id: string; nivel: string | null; tipo: string; nombre: string; seccion: string | null; padreDelPadre: string | null } | null = null
  if (d.padre_id) {
    const { data: p, error } = await supabase.from('obra_actividad').select('id, nivel, tipo, nombre, seccion, actividad_padre_id')
      .eq('obra_id', obraId).eq('id', d.padre_id).eq('archivada', false).maybeSingle()
    if (error) return { ok: false, error: error.message }
    if (!p) return { ok: false, error: 'Ese padre no es de esta obra.' }
    padre = { id: String(p.id), nivel: (p.nivel as string | null) ?? null, tipo: String(p.tipo), nombre: String(p.nombre), seccion: (p.seccion as string | null) ?? null, padreDelPadre: (p.actividad_padre_id as string | null) ?? null }
  }
  let nivel: NivelEstructura
  try { nivel = nivelHija(padre) } catch (e) { return { ok: false, error: (e as Error).message } }
  const contenedor = nivel === 'rubro' || nivel === 'epica' || nivel === 'historia'
  const unidad = d.unidad || null
  const cantidad = vacio(d.cantidad)
  const metodo = contenedor ? 'manual' : nivel === 'subtarea' ? 'manual'
    : d.metodo || (unidad && cantidad != null ? 'cantidad' : subtareas.length ? 'pasos' : 'manual')
  if (metodo === 'cantidad' && (!unidad || cantidad == null)) return { ok: false, error: 'Para medir por cantidad hacen falta la unidad y la cantidad.' }
  if (metodo === 'pasos' && subtareas.length === 0 && nivel === 'tarea') return { ok: false, error: 'Medir por pasos necesita al menos una subtarea.' }
  if (d.destino === 'pedido' && (!d.comentario || vacio(d.ped_cantidad) == null || Number(d.ped_cantidad) <= 0)) {
    return { ok: false, error: 'Un pedido lleva qué material (el comentario) y cuánto.' }
  }
  if (d.destino === 'impedimento' && (!d.comentario || !d.imp_responsable || !d.imp_compromiso)) {
    return { ok: false, error: 'Un impedimento lleva qué frena (el comentario), quién lo destraba y para cuándo.' }
  }
  const seccion = padre == null ? null : padre.nivel === 'rubro' ? padre.nombre : padre.seccion ?? padre.nombre
  let orden = await ordenSiguiente(supabase, obraId)

  const { data, error } = await supabase.from('obra_actividad').insert({
    obra_id: obraId,
    clave: padre ? `${padre.id}/${slug(d.nombre)}` : claveDeActividad(null, d.nombre),
    nombre: d.nombre,
    nivel,
    tipo: contenedor ? 'resumen' : 'tarea',
    rol_estructura: nivel === 'rubro' ? 'rubro' : null,
    seccion,
    orden: orden++,
    actividad_padre_id: padre?.id ?? null,
    unidad: nivel === 'rubro' || nivel === 'epica' ? null : unidad,
    cantidad_objetivo: nivel === 'rubro' || nivel === 'epica' ? null : cantidad,
    costo_mo: nivel === 'historia' ? vacio(d.costo_mo) : null,
    metodo_avance: metodo,
    inicio_plan: nivel === 'tarea' || nivel === 'subtarea' ? vacio(d.inicio_plan) : null,
    fin_plan: nivel === 'tarea' ? vacio(d.fin_plan) : null,
    cuadrilla_id: nivel === 'tarea' ? d.cuadrilla_id || null : null,
    responsable_id: nivel === 'tarea' ? d.responsable_id || null : null,
    comentario: d.comentario || null,
    cotizacion_partida_id: nivel === 'historia' ? d.partida_id || null : null,
    estado: 'pendiente',
    fuente: 'web',
    creada_en_web: true,
    editado_a_mano: true,
  }).select('id').single()
  if (error) {
    if (error.code === '23505') return { ok: false, error: `Ya hay un ítem llamado «${d.nombre}» en ese lugar.` }
    return { ok: false, error: error.message }
  }
  const id = String(data.id)
  const avisos: string[] = []

  // Historia con plantilla: una tarea por paso, en su orden, con el tiempo técnico que la plantilla dice.
  if (nivel === 'historia' && d.plantilla_id) {
    const { data: pasos } = await supabase.from('plantilla_paso').select('nombre, orden, tiempo_tecnico').eq('plantilla_id', d.plantilla_id).order('orden')
    for (const p of (pasos ?? []) as { nombre: string; tiempo_tecnico: boolean | null }[]) {
      const { error: e } = await supabase.from('obra_actividad').insert({
        obra_id: obraId, clave: `${id}/${slug(p.nombre)}`, nombre: p.nombre, nivel: 'tarea', tipo: 'tarea', seccion, orden: orden++,
        actividad_padre_id: id, metodo_avance: 'manual', tiempo_tecnico: Boolean(p.tiempo_tecnico), estado: 'pendiente',
        fuente: 'web', creada_en_web: true, editado_a_mano: true,
      })
      if (e) { avisos.push(`la plantilla se cortó en «${p.nombre}»: ${e.message}`); break }
    }
  }

  if (nivel === 'tarea') {
    // Subtareas: una fila por paso, sin plan ni peso.
    const idsSub: string[] = []
    for (const nombre of subtareas) {
      const { data: s, error: e } = await supabase.from('obra_actividad').insert({
        obra_id: obraId, clave: `${id}/${slug(nombre)}`, nombre, nivel: 'subtarea', tipo: 'tarea', seccion, orden: orden++,
        actividad_padre_id: id, metodo_avance: 'manual', estado: 'pendiente', fuente: 'web', creada_en_web: true, editado_a_mano: true,
      }).select('id').single()
      if (e) { avisos.push(`subtarea «${nombre}»: ${e.message}`); continue }
      idsSub.push(String(s.id))
    }
    if (metodo === 'pasos' && idsSub.length) {
      const { error: e } = await supabase.from('obra_actividad_paso').insert(subtareas.slice(0, idsSub.length).map((nombre, k) => ({
        actividad_id: id, orden: k + 1, nombre, peso: Math.round((100 / idsSub.length) * 100) / 100, hecho_en: null,
      })))
      if (e) avisos.push(`los pasos no se guardaron: ${e.message}`)
    }
    const e = await escribirInsumos(supabase, obraId, id, insumos, 0)
    if (e) avisos.push(e)
    if (d.destino === 'pedido') {
      const r = await pedirMaterial(supabase, obraId, id, d.comentario!, Number(d.ped_cantidad), d.ped_unidad || null, null)
      if (r) avisos.push(r)
    } else if (d.destino === 'impedimento') {
      const { error: eI } = await supabase.from('obra_restriccion').insert({
        obra_id: obraId, actividad_id: id, tipo: 'sin_clasificar', descripcion: d.comentario, responsable: d.imp_responsable,
        fecha_compromiso: d.imp_compromiso, estado: 'abierta',
      })
      if (eI) avisos.push(`el impedimento no se anotó: ${eI.message}`)
    }
  }
  revalidatePath(`/obras/${obraId}`, 'layout')
  if (avisos.length) return { ok: false, error: `«${d.nombre}» se creó, pero: ${avisos.join(' · ')}` }
  return { ok: true, id, mensaje: `«${d.nombre}» creado.` }
}

async function escribirInsumos(supabase: Cliente, obraId: string, tareaId: string, insumos: InsumoNuevo[], desde: number): Promise<string | null> {
  if (insumos.length === 0) return null
  const { error } = await supabase.from('obra_actividad_insumo_plan').insert(insumos.map((i, k) => ({
    obra_id: obraId, actividad_id: tareaId, orden: desde + k + 1, recurso_nombre: i.nombre, tipo: i.tipo,
    activo_id: i.tipo === 'activo' ? i.activo_id ?? null : null, unidad: i.unidad ?? null,
    cantidad_plan: i.cantidad ?? null, cantidad_unitaria: null, origen: 'web',
  })))
  return error ? `los insumos no se guardaron: ${error.message}` : null
}

/** Un pedido de material por la MISMA puerta que la app de pedidos (`pedir_material`), atado a la tarea. */
async function pedirMaterial(
  supabase: Cliente, obraId: string, tareaId: string, material: string, cantidad: number, unidad: string | null, insumoId: string | null,
): Promise<string | null> {
  const { data: grupo, error } = await supabase.rpc('pedir_material', {
    p_obra: obraId, p_items: [{ material, cantidad, unidad }], p_urgencia: 'semana', p_nota: null,
  })
  if (error) return `el pedido no salió: ${error.message}`
  const { data: filas } = await supabase.from('pedidos_materiales').update({ actividad_id: tareaId }).eq('pedido_grupo', grupo).select('id')
  const pedidoId = (filas?.[0]?.id as string | undefined) ?? null
  if (insumoId && pedidoId) await supabase.from('obra_actividad_insumo_plan').update({ pedido_id: pedidoId }).eq('obra_id', obraId).eq('id', insumoId)
  return null
}

// ── EL COSTO DE MO DE UNA HISTORIA (B03 · B07 «cargar») ──────────────────────

const costoSchema = z.object({ costo_mo: z.union([z.literal(''), z.coerce.number().min(0, 'El costo no puede ser negativo').max(1e12)]) })

/** Cargar, editar o BORRAR (vacío → NULL, «sin costo · no pesa») el costo de MO de una historia. */
export async function guardarCostoMO(obraId: string, historiaId: string, form: FormData): Promise<Resultado> {
  const parsed = costoSchema.safeParse({ costo_mo: String(form.get('costo_mo') ?? '').replace(/\./g, '').replace(',', '.').replace(/[$\s]/g, '') })
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const supabase = await createClient()
  if (!await esAdmin(supabase)) return { ok: false, error: SIN_PERMISO }
  const valor = parsed.data.costo_mo === '' ? null : parsed.data.costo_mo
  const { data, error } = await supabase.from('obra_actividad').update({ costo_mo: valor, editado_a_mano: true })
    .eq('obra_id', obraId).eq('id', historiaId).eq('nivel', 'historia').select('id')
  if (error) return { ok: false, error: error.message }
  if (!data?.length) return { ok: false, error: 'Esa historia no es de esta obra.' }
  revalidatePath(`/obras/${obraId}`, 'layout')
  return { ok: true, mensaje: valor == null ? 'Costo borrado: la historia deja de pesar.' : 'Costo guardado: el peso de la obra se recalculó.' }
}

// ── EL MÉTODO DE PONDERACIÓN DE LA OBRA (B07) ────────────────────────────────

const metodoSchema = z.object({ metodo: z.enum(['costo_mo', 'manual', 'parejo', 'dias_teoricos', 'hh_plan']) })

export async function elegirMetodoPonderacion(obraId: string, form: FormData): Promise<Resultado> {
  const parsed = metodoSchema.safeParse({ metodo: String(form.get('metodo') ?? '') })
  if (!parsed.success) return { ok: false, error: 'Método desconocido.' }
  const supabase = await createClient()
  if (!await esAdmin(supabase)) return { ok: false, error: SIN_PERMISO }
  const { data, error } = await supabase.from('obra_canonica').update({ metodo_ponderacion: parsed.data.metodo }).eq('id', obraId).select('id')
  if (error) return { ok: false, error: error.message }
  if (!data?.length) return { ok: false, error: 'No pude cambiar el método de esta obra.' }
  revalidatePath(`/obras/${obraId}`, 'layout')
  return { ok: true, mensaje: 'Método guardado.' }
}

// ── INSUMOS DE UNA TAREA (B06) ───────────────────────────────────────────────

export async function agregarInsumo(obraId: string, tareaId: string, form: FormData): Promise<Resultado> {
  let insumo: InsumoNuevo
  try { insumo = insumoSchema.parse(JSON.parse(String(form.get('insumo') ?? ''))) } catch { return { ok: false, error: 'El insumo llegó mal formado.' } }
  const supabase = await createClient()
  if (!await esAdmin(supabase)) return { ok: false, error: SIN_PERMISO }
  const { data: t } = await supabase.from('obra_actividad').select('id, nivel').eq('obra_id', obraId).eq('id', tareaId).maybeSingle()
  if (!t || t.nivel !== 'tarea') return { ok: false, error: 'Los insumos van en una tarea de esta obra.' }
  const { data: ultimo } = await supabase.from('obra_actividad_insumo_plan').select('orden').eq('actividad_id', tareaId).order('orden', { ascending: false }).limit(1).maybeSingle()
  const e = await escribirInsumos(supabase, obraId, tareaId, [insumo], Number(ultimo?.orden ?? 0))
  if (e) return { ok: false, error: e }
  revalidatePath(`/obras/${obraId}`, 'layout')
  return { ok: true, mensaje: `«${insumo.nombre}» agregado.` }
}

export async function quitarInsumo(obraId: string, insumoId: string): Promise<Resultado> {
  const supabase = await createClient()
  if (!await esAdmin(supabase)) return { ok: false, error: SIN_PERMISO }
  const { data, error } = await supabase.from('obra_actividad_insumo_plan').delete().eq('obra_id', obraId).eq('id', insumoId).eq('origen', 'web').select('id')
  if (error) return { ok: false, error: error.message }
  if (!data?.length) return { ok: false, error: 'Ese insumo no se puede quitar desde acá (viene del presupuesto o no es de esta obra).' }
  revalidatePath(`/obras/${obraId}`, 'layout')
  return { ok: true }
}

// ── TILDAR UNA SUBTAREA DESDE EL ÁRBOL (B06) ─────────────────────────────────

/**
 * Hecha / pendiente de una subtarea. Si la tarea se mide por PASOS, el paso de igual nombre se marca
 * igual: con «pasos», el avance de la tarea es subtareas hechas / total (lo lee `actividad_avance`).
 */
export async function alternarSubtarea(obraId: string, subtareaId: string, hecha: boolean): Promise<Resultado> {
  const supabase = await createClient()
  if (!await esAdmin(supabase)) return { ok: false, error: SIN_PERMISO }
  const { data: s, error } = await supabase.from('obra_actividad').update({ estado: hecha ? 'hecha' : 'pendiente' })
    .eq('obra_id', obraId).eq('id', subtareaId).eq('nivel', 'subtarea').select('id, nombre, actividad_padre_id').maybeSingle()
  if (error) return { ok: false, error: error.message }
  if (!s) return { ok: false, error: 'Esa subtarea no es de esta obra.' }
  const { data: t } = await supabase.from('obra_actividad').select('metodo_avance').eq('id', s.actividad_padre_id).maybeSingle()
  if (t?.metodo_avance === 'pasos') {
    const { error: e } = await supabase.from('obra_actividad_paso').update({ hecho_en: hecha ? new Date().toISOString() : null })
      .eq('actividad_id', s.actividad_padre_id).eq('nombre', s.nombre)
    if (e) return { ok: false, error: `La subtarea quedó ${hecha ? 'hecha' : 'pendiente'} pero el paso no: ${e.message}` }
  }
  revalidatePath(`/obras/${obraId}`, 'layout')
  return { ok: true }
}

const pedirSchema = z.object({ cantidad: z.coerce.number().positive('¿Cuánto hace falta?'), unidad: z.string().trim().max(24).optional() })

/** «Pedir» un material de la tarea: la misma puerta que la app de pedidos, y queda atado al insumo. */
export async function pedirInsumo(obraId: string, insumoId: string, form: FormData): Promise<Resultado> {
  const parsed = pedirSchema.safeParse({ cantidad: String(form.get('cantidad') ?? '').replace(',', '.'), unidad: String(form.get('unidad') ?? '') })
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const supabase = await createClient()
  const { data: i } = await supabase.from('obra_actividad_insumo_plan').select('id, actividad_id, recurso_nombre, tipo, pedido_id, unidad')
    .eq('obra_id', obraId).eq('id', insumoId).maybeSingle()
  if (!i || i.tipo !== 'material') return { ok: false, error: 'Ese material no es de esta obra.' }
  if (i.pedido_id) return { ok: false, error: 'Ya está pedido.' }
  const e = await pedirMaterial(supabase, obraId, String(i.actividad_id), String(i.recurso_nombre), parsed.data.cantidad, parsed.data.unidad || (i.unidad as string | null), insumoId)
  if (e) return { ok: false, error: e }
  revalidatePath(`/obras/${obraId}`, 'layout')
  return { ok: true, mensaje: 'Pedido cargado.' }
}
