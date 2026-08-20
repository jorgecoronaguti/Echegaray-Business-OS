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

// ═══ LOS NOMBRES DE COMPRAS DE UN PROVEEDOR, Y LO QUE PESAN ═══
//
// El handoff pide en la ficha «los nombres de Compras vinculados a ese CUIT». No es decoración: es
// la prueba de que la canonicalización funcionó. Ver «CORRALON DEL CENTRO · CORRALON CENTRO SRL ·
// CORR. CENTRO» colgando de una sola ficha es lo que deja confirmar que las tres grafías dejaron de
// ser tres proveedores.
//
// Y de ahí sale también LO COMPRADO, sumando lo que ya suma `proveedor_nombre_resuelto` sobre
// `costos_obra`. NO se guarda en la ficha: un total al lado de sus filas es la segunda versión del
// mismo número, y el día que entre un comprobante nuevo dejan de coincidir sin avisar.
//
// LO QUE NO SE PUEDE MOSTRAR: la ÚLTIMA COMPRA. `proveedor_nombre_resuelto` publica comprobantes y
// total, no la fecha máxima —a diferencia de la cola de pendientes, que sí la tiene—. Ponerle la
// fecha de otra cosa sería inventarla; agregarla exige tocar la vista, o sea una migración, y este
// bloque no abre migraciones. Queda declarado.

export interface ComprasDelProveedor {
  nombres: { nombre_norm: string; comprobantes: number; total: number; manual: boolean }[]
  comprobantes: number
  /** En pesos, histórico. `null` si no hay ningún nombre vinculado: 0 diría que nunca se le compró. */
  comprado: number | null
}

/** El resumen, separado de la consulta para poder probarlo sin base. */
export function resumirCompras(filas: NombreResuelto[]): ComprasDelProveedor {
  const nombres = filas
    .map((f) => ({
      nombre_norm: f.nombre_norm,
      comprobantes: Number(f.comprobantes ?? 0),
      total: Number(f.total ?? 0),
      manual: f.via === 'resolucion_manual',
    }))
    .sort((a, b) => b.total - a.total)
  const comprobantes = nombres.reduce((a, n) => a + n.comprobantes, 0)
  return {
    nombres,
    comprobantes,
    comprado: nombres.length === 0 ? null : nombres.reduce((a, n) => a + n.total, 0),
  }
}

export async function getComprasDelProveedor(
  supabase: SupabaseClient,
  proveedorId: string,
): Promise<ComprasDelProveedor> {
  const { data, error } = await supabase
    .from('proveedor_nombre_resuelto')
    .select('nombre_norm, comprobantes, total, estado, proveedor_id, proveedor_nombre, via, alias_id')
    .eq('proveedor_id', proveedorId)
  // Un error de lectura NO se dibuja como «no compró nada»: se devuelve la lista vacía con
  // `comprado: null`, que la ficha escribe como ausencia y no como cero.
  if (error) return { nombres: [], comprobantes: 0, comprado: null }
  return resumirCompras((data ?? []) as NombreResuelto[])
}
