// LAS LECTURAS DE LA SERIE B: insumos por tarea (con la ubicación REAL del activo en Herramientas),
// el catálogo de activos para agregar uno, las plantillas de tareas y los rubros de otras obras (B01).
// La aritmética vive en `insumosTarea.ts` y `pesoMO.ts`; acá sólo se traen filas.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ServiceResult } from '../types'
import type { InsumoTarea, LugarActivo } from './insumosTarea'

const num = (v: unknown): number | null => (v == null || v === '' ? null : Number(v))

async function lugares(supabase: SupabaseClient, ids: string[]): Promise<Map<string, LugarActivo>> {
  if (ids.length === 0) return new Map()
  const { data } = await supabase.from('ubicacion').select('id, tipo, nombre, obra_id').in('id', ids)
  return new Map(((data ?? []) as { id: string; tipo: string | null; nombre: string | null; obra_id: string | null }[])
    .map((u) => [u.id, { tipo: u.tipo, nombre: u.nombre, obra_id: u.obra_id }]))
}

/** Los insumos (activos y materiales) de cada tarea de la obra, indexados por actividad. */
export async function getInsumosDeObra(supabase: SupabaseClient, obraId: string): Promise<ServiceResult<Record<string, InsumoTarea[]>>> {
  const { data, error } = await supabase.from('obra_actividad_insumo_plan')
    .select('id, actividad_id, tipo, recurso_nombre, cantidad_plan, unidad, activo_id, pedido_id, orden')
    .eq('obra_id', obraId).in('tipo', ['activo', 'material']).order('orden', { ascending: true })
  if (error) return { data: null, error: error.message }
  const filas = (data ?? []) as { id: string; actividad_id: string; tipo: string; recurso_nombre: string; cantidad_plan: unknown; unidad: string | null; activo_id: string | null; pedido_id: string | null }[]
  const idsActivo = [...new Set(filas.map((f) => f.activo_id).filter((x): x is string => !!x))]
  const activos = new Map<string, { nombre: string; ubicacion_id: string | null }>()
  if (idsActivo.length) {
    const { data: a } = await supabase.from('activo').select('id, nombre, ubicacion_id').in('id', idsActivo)
    for (const x of (a ?? []) as { id: string; nombre: string; ubicacion_id: string | null }[]) activos.set(x.id, x)
  }
  const lug = await lugares(supabase, [...new Set([...activos.values()].map((a) => a.ubicacion_id).filter((x): x is string => !!x))])
  const salida: Record<string, InsumoTarea[]> = {}
  for (const f of filas) {
    const a = f.activo_id ? activos.get(f.activo_id) : undefined
    ;(salida[f.actividad_id] ??= []).push({
      id: f.id, actividad_id: f.actividad_id, tipo: f.tipo === 'activo' ? 'activo' : 'material',
      nombre: a?.nombre ?? f.recurso_nombre, cantidad: num(f.cantidad_plan), unidad: f.unidad,
      activo_id: f.activo_id, pedido_id: f.pedido_id,
      lugar: a?.ubicacion_id ? lug.get(a.ubicacion_id) ?? null : null,
    })
  }
  return { data: salida, error: null }
}

export interface ActivoElegible { id: string; nombre: string; codigo: string | null; lugar: LugarActivo | null }

/** El parque de Herramientas que se puede asignar a una tarea (sin los dados de baja). */
export async function getActivosElegibles(supabase: SupabaseClient): Promise<ServiceResult<ActivoElegible[]>> {
  const { data, error } = await supabase.from('activo').select('id, nombre, codigo, ubicacion_id')
    .is('baja_en', null).order('nombre').limit(2000)
  if (error) return { data: null, error: error.message }
  const filas = (data ?? []) as { id: string; nombre: string; codigo: string | null; ubicacion_id: string | null }[]
  const lug = await lugares(supabase, [...new Set(filas.map((f) => f.ubicacion_id).filter((x): x is string => !!x))])
  return { data: filas.map((f) => ({ id: f.id, nombre: f.nombre, codigo: f.codigo, lugar: f.ubicacion_id ? lug.get(f.ubicacion_id) ?? null : null })), error: null }
}

export interface PlantillaTareas { id: string; nombre: string; pasos: number }

/** «Tareas desde una plantilla» (B03): las secuencias activas con cuántos pasos traen. */
export async function getPlantillas(supabase: SupabaseClient): Promise<PlantillaTareas[]> {
  const [{ data: ps }, { data: pasos }] = await Promise.all([
    supabase.from('plantilla_secuencia').select('id, nombre').eq('activa', true).order('nombre'),
    supabase.from('plantilla_paso').select('plantilla_id'),
  ])
  const n = new Map<string, number>()
  for (const p of (pasos ?? []) as { plantilla_id: string }[]) n.set(p.plantilla_id, (n.get(p.plantilla_id) ?? 0) + 1)
  return ((ps ?? []) as { id: string; nombre: string }[]).map((p) => ({ id: p.id, nombre: p.nombre, pasos: n.get(p.id) ?? 0 }))
    .filter((p) => p.pasos > 0)
}

export interface RubroPropuesto { nombre: string; epicas: number }

/**
 * B01 «Rubros de otras obras · propuesta»: los rubros que ya se usaron en OTRAS obras, con cuántas
 * épicas llevaban (la mayor vez). Sólo nombres: proponer no copia nada.
 */
export async function getRubrosDeOtrasObras(supabase: SupabaseClient, obraId: string): Promise<RubroPropuesto[]> {
  const { data } = await supabase.from('obra_actividad').select('id, obra_id, nombre, nivel, actividad_padre_id')
    .neq('obra_id', obraId).in('nivel', ['rubro', 'epica']).eq('archivada', false).limit(3000)
  const filas = (data ?? []) as { id: string; obra_id: string; nombre: string; nivel: string; actividad_padre_id: string | null }[]
  const epicasDe = new Map<string, number>()
  for (const f of filas) if (f.nivel === 'epica' && f.actividad_padre_id) epicasDe.set(f.actividad_padre_id, (epicasDe.get(f.actividad_padre_id) ?? 0) + 1)
  const porNombre = new Map<string, RubroPropuesto>()
  for (const f of filas) {
    if (f.nivel !== 'rubro') continue
    const clave = f.nombre.trim().toLowerCase()
    const nombre = f.nombre.trim().charAt(0).toUpperCase() + f.nombre.trim().slice(1).toLowerCase()
    const e = epicasDe.get(f.id) ?? 0
    const ya = porNombre.get(clave)
    if (!ya || e > ya.epicas) porNombre.set(clave, { nombre: ya?.nombre ?? nombre, epicas: e })
  }
  return [...porNombre.values()].sort((a, b) => b.epicas - a.epicas || a.nombre.localeCompare(b.nombre)).slice(0, 6)
}
