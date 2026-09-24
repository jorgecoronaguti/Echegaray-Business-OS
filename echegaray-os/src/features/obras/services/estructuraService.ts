// LAS LECTURAS DE «CREAR LA ESTRUCTURA» (C01–C10) — lo que el árbol no trae y estas pantallas
// necesitan. La aritmética no está acá: está en `estructura.ts`, `partidasParaConvertir.ts` y
// `listoParaProducir.ts`, que son puros y tienen su prueba. Acá sólo se traen las filas.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ServiceResult } from '../types'
import type { Ponderaciones } from './estructura'
import { versionQueVale } from './versionDelPresupuesto'
import { partidasParaConvertir, type PartidaParaConvertir } from './partidasParaConvertir'

const num = (v: unknown): number | null => (v == null || v === '' ? null : Number(v))

/** El peso a mano y el costo de MO de cada ítem de la obra (columnas C04/C05 y H2). Una lectura. */
export async function getPonderaciones(supabase: SupabaseClient, obraId: string): Promise<ServiceResult<Ponderaciones>> {
  const { data, error } = await supabase.from('obra_actividad')
    .select('id, ponderacion, costo_mo').eq('obra_id', obraId).eq('archivada', false)
  if (error) return { data: null, error: error.message }
  const salida: Ponderaciones = {}
  for (const f of (data ?? []) as { id: string; ponderacion: unknown; costo_mo: unknown }[]) {
    salida[f.id] = { ponderacion: num(f.ponderacion), costo_mo: num(f.costo_mo) }
  }
  return { data: salida, error: null }
}

export interface PresupuestoDeLaObra {
  id: string
  /** «PR-0042 · R03». */
  rotulo: string
  estado: string | null
  congelada: boolean
  partidas: PartidaParaConvertir[]
}

/**
 * EL PRESUPUESTO VINCULADO A LA OBRA Y SUS PARTIDAS (C02/MC5). `data: null` sin error = la obra no
 * tiene presupuesto vinculado. Las partidas son dato económico: quien no ve economía recibe la
 * lectura vacía por RLS, y la pantalla lo dice en vez de dibujar «0 partidas».
 */
export async function getPresupuestoDeLaObra(
  supabase: SupabaseClient, obraId: string,
): Promise<ServiceResult<PresupuestoDeLaObra | null>> {
  // LA VERSIÓN QUE SE VENDIÓ, NO LA ÚLTIMA QUE SE EDITÓ (23/09/2026): QP tiene la v3 adjudicada y una
  // v4 borrador vigente (recotización en curso). Tomar la vigente bloqueaba la conversión con «el
  // presupuesto no está adjudicado». El plan de obra sale de lo adjudicado; sin ninguna adjudicada,
  // se muestra la vigente y la pantalla dice por qué no se puede convertir.
  const { data: versiones, error: eC } = await supabase.from('cotizaciones')
    .select('id, numero, version, estado, congelada_en, vigente')
    .eq('obra_canonica_id', obraId)
    .order('version', { ascending: false })
  if (eC) return { data: null, error: eC.message }
  const cab = versionQueVale((versiones ?? []) as { estado: string | null; vigente: boolean | null; version: number }[])
  if (!cab) return { data: null, error: null }
  const c = cab as { id: string; numero: string | null; version: number; estado: string | null; congelada_en: string | null }

  const [partidasRes, convertidasRes] = await Promise.all([
    supabase.from('cotizacion_partida')
      .select('id, rubro, codigo, descripcion, unidad, cantidad, hs_unitarias, costo_unitario, orden')
      .eq('cotizacion_id', c.id).order('orden', { ascending: true }),
    supabase.from('obra_actividad').select('cotizacion_partida_id').eq('obra_id', obraId)
      .not('cotizacion_partida_id', 'is', null),
  ])
  if (partidasRes.error) return { data: null, error: partidasRes.error.message }
  if (convertidasRes.error) return { data: null, error: convertidasRes.error.message }
  const convertidas = new Set((convertidasRes.data ?? []).map((f) => String((f as { cotizacion_partida_id: string }).cotizacion_partida_id)))
  const filas = ((partidasRes.data ?? []) as Record<string, unknown>[]).map((f) => ({
    id: String(f.id), rubro: f.rubro == null ? null : String(f.rubro), codigo: f.codigo == null ? null : String(f.codigo),
    descripcion: String(f.descripcion ?? ''), unidad: f.unidad == null ? null : String(f.unidad),
    cantidad: num(f.cantidad), hs_unitarias: num(f.hs_unitarias), costo_unitario: num(f.costo_unitario), orden: Number(f.orden ?? 0),
  }))
  return {
    data: {
      id: c.id,
      rotulo: `${c.numero ?? 'sin número'} · R${String(c.version).padStart(2, '0')}`,
      estado: c.estado,
      congelada: c.congelada_en != null,
      partidas: partidasParaConvertir(filas, convertidas),
    },
    error: null,
  }
}

/** Las órdenes del cliente para esta obra: cuántas. null = no se pudo leer. */
export async function contarOrdenesDeObra(supabase: SupabaseClient, obraId: string): Promise<number | null> {
  const { count, error } = await supabase.from('cliente_orden').select('id', { count: 'exact', head: true }).eq('obra_id', obraId)
  if (error) return null
  return count ?? 0
}

/** Las subtareas hechas de una tarea (C08): cuáles ya se tildaron. */
export async function getEstadosDeSubtareas(
  supabase: SupabaseClient, obraId: string, padreId: string,
): Promise<Record<string, string | null>> {
  const { data } = await supabase.from('obra_actividad').select('id, estado')
    .eq('obra_id', obraId).eq('actividad_padre_id', padreId)
  const salida: Record<string, string | null> = {}
  for (const f of (data ?? []) as { id: string; estado: string | null }[]) salida[f.id] = f.estado
  return salida
}

/** ¿La obra ya tiene línea base sellada? (C01 «Línea base: sin sellar»). null = no se pudo leer. */
export async function hayLineaBase(supabase: SupabaseClient, obraId: string): Promise<boolean | null> {
  const { count, error } = await supabase.from('obra_actividad').select('id', { count: 'exact', head: true })
    .eq('obra_id', obraId).not('sellada_en', 'is', null)
  if (error) return null
  return (count ?? 0) > 0
}

/** Cuántos ítems tiene el árbol (la página decide con esto si dibuja la C01). null = no se pudo leer. */
export async function contarItemsDeObra(supabase: SupabaseClient, obraId: string): Promise<number | null> {
  const { count, error } = await supabase.from('obra_wbs').select('actividad_id', { count: 'exact', head: true }).eq('obra_id', obraId)
  if (error) return null
  return count ?? 0
}
