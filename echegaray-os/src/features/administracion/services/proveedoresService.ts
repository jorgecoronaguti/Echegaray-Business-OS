// PROVEEDORES — la lectura del maestro y de la cola de nombres sin resolver.
//
// Las dos consultas de resolución NO calculan nada acá: leen `proveedor_nombre_pendiente` y
// `proveedor_nombre_resuelto`, que son las vistas donde vive la definición. Si el criterio de "qué
// está pendiente" se escribiera también en TypeScript, habría dos respuestas posibles a la misma
// pregunta y la pantalla podría discrepar con cualquier otro consumidor.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { NombrePendiente, NombreResuelto, Proveedor, ServiceResult } from '../types'

const COLUMNAS = 'id, nombre, razon_social, cuit, notas, activo'

export type FiltroActivo = 'activos' | 'archivados' | 'todos'

export interface FiltroProveedores {
  q?: string
  activo?: FiltroActivo
}

export async function getProveedores(
  supabase: SupabaseClient,
  filtro: FiltroProveedores = {},
): Promise<ServiceResult<Proveedor[]>> {
  let consulta = supabase.from('proveedores').select(COLUMNAS)

  const activo = filtro.activo ?? 'activos'
  if (activo === 'activos') consulta = consulta.eq('activo', true)
  if (activo === 'archivados') consulta = consulta.eq('activo', false)

  const q = filtro.q?.trim()
  if (q) {
    const seguro = q.replace(/[,()]/g, ' ').trim()
    // El CUIT se busca por sus dígitos: quien lo tiene a mano lo tipea con guiones, y la base lo
    // guarda sin ellos. Sin esto, buscar "30-70839055-7" no encontraría nada.
    const digitos = seguro.replace(/\D/g, '')
    const partes = [`nombre.ilike.%${seguro}%`, `razon_social.ilike.%${seguro}%`]
    if (digitos) partes.push(`cuit.ilike.%${digitos}%`)
    if (seguro) consulta = consulta.or(partes.join(','))
  }

  const { data, error } = await consulta.order('nombre', { ascending: true })
  if (error) return { data: null, error: error.message }
  return { data: (data ?? []) as Proveedor[], error: null }
}

export async function getProveedor(supabase: SupabaseClient, id: string): Promise<ServiceResult<Proveedor | null>> {
  const { data, error } = await supabase.from('proveedores').select(COLUMNAS).eq('id', id).maybeSingle()
  if (error) return { data: null, error: error.message }
  return { data: (data as Proveedor) ?? null, error: null }
}

/**
 * Los nombres del Sheet que nadie resolvió, con lo que pesan.
 *
 * Vienen ordenados por cantidad de comprobantes porque la lista es una COLA DE TRABAJO: resolver el
 * nombre que aparece 190 veces mueve mucho más costo de obra que el que aparece una sola.
 */
export async function getNombresPendientes(
  supabase: SupabaseClient,
  limite = 200,
): Promise<ServiceResult<NombrePendiente[]>> {
  const { data, error } = await supabase
    .from('proveedor_nombre_pendiente')
    .select('nombre_norm, nombre_origen, comprobantes, total, primera_fecha, ultima_fecha')
    .order('comprobantes', { ascending: false })
    .limit(limite)
  if (error) return { data: null, error: error.message }
  return { data: (data ?? []) as NombrePendiente[], error: null }
}

export async function getNombresResueltos(
  supabase: SupabaseClient,
  limite = 200,
): Promise<ServiceResult<NombreResuelto[]>> {
  const { data, error } = await supabase
    .from('proveedor_nombre_resuelto')
    .select('nombre_norm, comprobantes, total, estado, proveedor_id, proveedor_nombre, via, alias_id')
    .order('comprobantes', { ascending: false })
    .limit(limite)
  if (error) return { data: null, error: error.message }
  return { data: (data ?? []) as NombreResuelto[], error: null }
}
