import type { SupabaseClient } from '@supabase/supabase-js'
import { rotuloDeObra } from '@/shared/utils/obra'
import { nombresDeUsuariosPlano } from '@/shared/personas/nombresDeUsuarios'
import { destinosPosibles, type Destino, type Existencia, type Lugar, type Remito } from '../logica/stock'
import type { MovimientoMaterial } from '../logica/inventario'

// MATERIAL · STOCK — la lectura del saldo por lugar y de los remitos.
//
// Qué filas vuelven lo deciden las policies de `material_existencia` y `remito` (Administración todo; el
// resto sólo lo de las obras que ve). Acá no se repite ese predicado por la misma razón que en
// `pedidosService`: una segunda copia se desincroniza y no protege la llamada directa a PostgREST.
//
// Sin la migración (`42P01`, tabla inexistente) la pantalla lo dice en vez de mostrar «no hay stock»:
// un depósito vacío por error se lee como «no hay nada en obra» y lleva a comprar de nuevo.

export const MIGRACION_STOCK = '20260929T1500_material_stock_por_lugar_y_remito'
const SIN_TABLA = new Set(['42P01', 'PGRST205'])

export type LecturaStock =
  | { estado: 'ok'; lugares: Lugar[]; destinos: Destino[]; existencias: Existencia[]; remitos: Remito[] }
  | { estado: 'falta_migracion' }
  | { estado: 'error'; mensaje: string }

interface FilaExistencia { material_id: string; ubicacion_id: string; cantidad: number | string; material: { nombre: string; unidad: string | null } | { nombre: string; unidad: string | null }[] | null }
interface FilaRemito extends Omit<Remito, 'items' | 'numero'> { numero: number; remito_item: Array<{ material: string; unidad: string | null; cantidad: number | string }> }

const uno = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v)

export async function leerStock(supabase: SupabaseClient): Promise<LecturaStock> {
  try {
    const [ubic, obras, exi, rem] = await Promise.all([
      supabase.from('ubicacion').select('id, tipo, nombre, obra_id, archivada').in('tipo', ['taller', 'obra']).eq('archivada', false),
      supabase.from('obra_canonica').select('id, nombre, codigo, estado'),
      supabase.from('material_existencia').select('material_id, ubicacion_id, cantidad, material:material_id(nombre, unidad)'),
      supabase.from('remito')
        .select('id, numero, emitido_en, origen_id, destino_id, origen_rotulo, destino_rotulo, entrega_nombre, recibe_nombre, nota, remito_item(material, unidad, cantidad)')
        .order('numero', { ascending: false }).limit(200),
    ])
    for (const r of [exi, rem]) {
      if (r.error) return SIN_TABLA.has(r.error.code ?? '') ? { estado: 'falta_migracion' } : { estado: 'error', mensaje: r.error.message }
    }
    if (ubic.error) return { estado: 'error', mensaje: ubic.error.message }
    if (obras.error) return { estado: 'error', mensaje: obras.error.message }

    const rotulos = new Map((obras.data ?? []).map((o) => [o.id as string, rotuloDeObra({ nombre: o.nombre as string, codigo: (o.codigo as string | null) ?? null })]))
    const lugares: Lugar[] = (ubic.data ?? []).map((u) => ({
      id: u.id as string,
      tipo: u.tipo as 'taller' | 'obra',
      obra_id: (u.obra_id as string | null) ?? null,
      // El nombre de una obra sale de la obra, no de `ubicacion.nombre` (que es null para ella).
      rotulo: u.tipo === 'taller' ? ((u.nombre as string | null) ?? 'Taller') : (rotulos.get(u.obra_id as string) ?? 'Obra'),
    }))
    const existencias: Existencia[] = ((exi.data ?? []) as unknown as FilaExistencia[]).map((f) => {
      const m = uno(f.material)
      return { material_id: f.material_id, ubicacion_id: f.ubicacion_id, cantidad: Number(f.cantidad), material: m?.nombre ?? '—', unidad: m?.unidad ?? null }
    })
    const remitos: Remito[] = ((rem.data ?? []) as unknown as FilaRemito[]).map(({ remito_item, ...r }) => ({
      ...r,
      items: remito_item.map((i) => ({ material: i.material, unidad: i.unidad, cantidad: Number(i.cantidad) })),
    }))
    const activas = (obras.data ?? []).filter((o) => o.estado === 'activa').map((o) => o.id as string)
    return { estado: 'ok', lugares, destinos: destinosPosibles(lugares, activas, rotulos), existencias, remitos }
  } catch (err) {
    return { estado: 'error', mensaje: err instanceof Error ? err.message : 'Error al conectar con Supabase' }
  }
}

// ─── EL LIBRO ───────────────────────────────────────────────────────────────────────────────────

/** Tope de asientos que se leen: el libro crece siempre y la pantalla muestra los más nuevos. */
export const MAX_MOVIMIENTOS = 400

interface FilaMovimiento extends Omit<MovimientoMaterial, 'material' | 'unidad' | 'quien' | 'cantidad'> {
  cantidad: number | string
  usuario_id: string | null
  material: { nombre: string; unidad: string | null } | { nombre: string; unidad: string | null }[] | null
}

/**
 * Los asientos de `material_movimiento`, más nuevos primero, con quién los hizo. Sólo lo lee la
 * computadora: el teléfono no dibuja el libro, así que `leerStock` no carga con esta consulta. Qué
 * asientos vuelven lo decide la policy: los de los lugares que el usuario ve.
 */
export async function leerMovimientos(supabase: SupabaseClient): Promise<{ estado: 'ok'; movimientos: MovimientoMaterial[] } | { estado: 'error'; mensaje: string }> {
  try {
    const [mov, nombres] = await Promise.all([
      supabase.from('material_movimiento')
        .select('id, material_id, tipo, origen_id, destino_id, cantidad, pedido_id, remito_id, motivo, nota, usuario_id, creado_en, material:material_id(nombre, unidad)')
        .order('creado_en', { ascending: false }).limit(MAX_MOVIMIENTOS),
      nombresDeUsuariosPlano(supabase),
    ])
    if (mov.error) return { estado: 'error', mensaje: mov.error.message }
    const movimientos = ((mov.data ?? []) as unknown as FilaMovimiento[]).map(({ material, usuario_id, cantidad, ...m }) => {
      const mat = uno(material)
      return { ...m, cantidad: Number(cantidad), material: mat?.nombre ?? '—', unidad: mat?.unidad ?? null, quien: usuario_id ? (nombres[usuario_id] ?? null) : null }
    })
    return { estado: 'ok', movimientos }
  } catch (err) {
    return { estado: 'error', mensaje: err instanceof Error ? err.message : 'Error al conectar con Supabase' }
  }
}
