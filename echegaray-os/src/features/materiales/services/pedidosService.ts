import type { SupabaseClient } from '@supabase/supabase-js'
import { indiceDeAlias } from '../../../../orquestador/lib/obra-operacion.mjs'
import { rotuloDeObra } from '@/shared/utils/obra'
import { resolverObras, type FilaPedido, type IndiceObras, type Pedido } from '../logica/pedidos'

// MATERIAL — la lectura. Una sola función para las dos caras: el teléfono y la computadora leen
// ESTA lista y después la recortan (por obra, por estado). No hay una consulta «para el celular».
//
// ═══ QUÉ FILAS VUELVEN NO LO DECIDE ESTA CAPA ═══
//
// Lo decide la policy `pedidos_materiales_select` (`ve_pedido_material`): Administración ve todo, el
// resto lo de las obras que ve. Acá no se repite el predicado: una segunda copia en TypeScript se
// desincroniza de la de Postgres y encima no protege la llamada directa a PostgREST.
//
// ═══ SIN LA MIGRACIÓN, LA PANTALLA LO DICE ═══
//
// El `select` pide las columnas nuevas (`obra_canonica_id`, `unidad`, `urgencia`…). Si la migración
// 20260923T1900 no está aplicada, Postgres responde `42703` y la pantalla dice qué falta en vez de
// dibujar una lista vacía — una lista vacía por error se lee como «nadie pidió nada».

export const MIGRACION = '20260923T1900_pedido_de_material_desde_la_app'

export interface ObraParaPedir {
  id: string
  nombre: string
}

export type LecturaMaterial =
  | { estado: 'ok'; pedidos: Pedido[]; obras: ObraParaPedir[] }
  | { estado: 'falta_migracion' }
  | { estado: 'error'; mensaje: string }

const COLUMNAS =
  'id_pedido, obra_texto, obra_canonica_id, fecha, material, cantidad, unidad, estado, origen, urgencia, nota, pedido_grupo, created_at'

export async function leerMaterial(supabase: SupabaseClient): Promise<LecturaMaterial> {
  try {
    const [pedidos, alias, obras] = await Promise.all([
      supabase.from('pedidos_materiales').select(COLUMNAS).order('created_at', { ascending: false }),
      supabase.from('obra_alias').select('alias, obra_id, clasificacion'),
      // Las obras ACTIVAS son las que se pueden pedir; el rótulo de las cerradas sale igual para
      // leer los pedidos viejos del Sheet.
      supabase.from('obra_canonica').select('id, nombre, codigo, estado').order('nombre'),
    ])
    if (pedidos.error) {
      if (pedidos.error.code === '42703') return { estado: 'falta_migracion' }
      return { estado: 'error', mensaje: pedidos.error.message }
    }
    if (alias.error) return { estado: 'error', mensaje: alias.error.message }
    if (obras.error) return { estado: 'error', mensaje: obras.error.message }

    const rotulos = new Map<string, string>()
    const activas: ObraParaPedir[] = []
    for (const o of obras.data ?? []) {
      const nombre = rotuloDeObra({ nombre: o.nombre as string, codigo: (o.codigo as string | null) ?? null })
      rotulos.set(o.id as string, nombre)
      if (o.estado === 'activa') activas.push({ id: o.id as string, nombre })
    }
    const indice = indiceDeAlias(alias.data ?? []) as IndiceObras
    const filas = (pedidos.data ?? []).map((f) => ({ ...f, cantidad: f.cantidad == null ? null : Number(f.cantidad) })) as FilaPedido[]
    return { estado: 'ok', pedidos: resolverObras(filas, indice, rotulos), obras: activas }
  } catch (err) {
    return { estado: 'error', mensaje: err instanceof Error ? err.message : 'Error al conectar con Supabase' }
  }
}
