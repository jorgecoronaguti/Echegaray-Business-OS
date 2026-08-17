import type { SupabaseClient } from '@supabase/supabase-js'
import { getHerramientas, type Herramienta } from '@/features/integraciones/services/herramientasService'
import { getPedidosMateriales, type PedidoMaterial } from '@/features/integraciones/services/pedidosMaterialesService'
import { getMovimientos, type MovimientoConHerramienta } from '@/features/integraciones/services/movimientosService'

// Detalle OPERATIVO de UNA obra: sus herramientas, pedidos y movimientos. Reusa los servicios
// existentes de integraciones y filtra por el NOMBRE de la obra (la obra operativa vive como
// texto en esas 3 tablas, no hay tabla canónica). Cero SQL nuevo, cero dato fabricado. Es el
// contenido de la vista por-obra (cartera → obra) del control de obras.

export interface ObraDetalle {
  obra: string
  herramientas: Herramienta[]
  pedidos: PedidoMaterial[]
  movimientos: MovimientoConHerramienta[]
}

export interface AvanceActividad {
  codigo: string | null
  actividad: string
  pct: number
  estado: string | null
}

export interface AvanceObra {
  obra: string
  estructurado: boolean
  motivo: string | null
  /** Sobre cuántas actividades se tomó el promedio. La cobertura viaja pegada al número. */
  actividades: number
  completadas: number
  /** Actividades reales que todavía no tienen fecha: no entran al promedio y hay que decirlo. */
  sin_planificar: number
  avance_promedio: number | null
  detalle: AvanceActividad[]
  sincronizado_en: string | null
}

export type ServiceResult<T> = { data: T; error: null } | { data: null; error: string }

const norm = (s: string | null | undefined): string => (s ?? '').trim().toLowerCase()

export async function getObraDetalle(supabase: SupabaseClient, nombre: string): Promise<ServiceResult<ObraDetalle>> {
  try {
    const key = norm(nombre)
    const [h, p, m] = await Promise.all([
      getHerramientas(supabase),
      getPedidosMateriales(supabase),
      getMovimientos(supabase),
    ])
    if (h.error) return { data: null, error: h.error }
    if (p.error) return { data: null, error: p.error }
    if (m.error) return { data: null, error: m.error }

    return {
      data: {
        obra: nombre,
        herramientas: (h.data ?? []).filter((x) => norm(x.ubicacion_actual) === key),
        pedidos: (p.data ?? []).filter((x) => norm(x.obra_texto) === key),
        movimientos: (m.data ?? []).filter((x) => norm(x.destino) === key),
      },
      error: null,
    }
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'Error desconocido' }
  }
}

// Avance físico de TODAS las obras (para la cartera).
//
// ═══ DE DÓNDE SALE EL NÚMERO, DESDE EL 17/08/2026 ═══
//
// Antes salía de la tabla `avance_obra`, que era el resultado de un SEGUNDO cálculo sobre el mismo
// archivo de Drive: esta pantalla decía San Francisco 85% mientras /obras decía 44%, con los dos
// leyendo lo mismo. Ahora lee `obra_avance`, la vista que define el avance UNA vez para todo el OS
// —web, chat y briefings—, y el detalle sale de las actividades que entran en ese promedio.
// La definición está escrita en la migración 20260818010000.
export async function getAvanceMap(supabase: SupabaseClient): Promise<Map<string, AvanceObra>> {
  const map = new Map<string, AvanceObra>()
  const [av, act] = await Promise.all([
    supabase.from('obra_avance')
      .select('obra_id, obra, avance_pct, n_actividades, n_medidas, n_sin_planificar, n_completas, sincronizado_en'),
    supabase.from('obra_actividad')
      .select('obra_id, codigo, nombre, pct, estado, tipo, inicio_plan, orden')
      .order('orden', { ascending: true }),
  ])
  if (av.error || !av.data) return map

  // El detalle son las actividades QUE ENTRAN EN EL PROMEDIO, no todas: mostrar una lista distinta
  // de la que se promedió es el mismo defecto de dos números, un renglón más abajo.
  const detallePorObra = new Map<string, AvanceActividad[]>()
  for (const a of (act.data ?? []) as Array<Record<string, unknown>>) {
    if (a.tipo === 'resumen' || a.inicio_plan == null || a.pct == null) continue
    const lista = detallePorObra.get(a.obra_id as string) ?? []
    lista.push({
      codigo: (a.codigo as string | null) ?? null,
      actividad: a.nombre as string,
      pct: Number(a.pct),
      estado: (a.estado as string | null) ?? null,
    })
    detallePorObra.set(a.obra_id as string, lista)
  }

  for (const r of av.data as Array<Record<string, unknown>>) {
    const avancePct = r.avance_pct == null ? null : Number(r.avance_pct)
    const sinPlanificar = Number(r.n_sin_planificar ?? 0)
    map.set(norm(r.obra as string), {
      obra: r.obra as string,
      estructurado: avancePct !== null,
      motivo: avancePct !== null ? null
        : Number(r.n_actividades ?? 0) > 0
          ? 'el cronograma está cargado pero ninguna actividad tiene fecha de inicio'
          : 'esta obra todavía no tiene cronograma en el tracker de Drive',
      actividades: Number(r.n_medidas ?? 0),
      completadas: Number(r.n_completas ?? 0),
      sin_planificar: sinPlanificar,
      avance_promedio: avancePct,
      detalle: detallePorObra.get(r.obra_id as string) ?? [],
      sincronizado_en: (r.sincronizado_en as string | null) ?? null,
    })
  }
  return map
}

// Avance físico de UNA obra. Match por nombre normalizado; si no hay exacto, prueba por
// inclusión (los nombres del tracker no siempre son idénticos a los operativos). null si no hay.
export async function getAvanceObra(supabase: SupabaseClient, nombre: string): Promise<AvanceObra | null> {
  const map = await getAvanceMap(supabase)
  const key = norm(nombre)
  const exacto = map.get(key)
  if (exacto) return exacto
  for (const [k, v] of map) if (k.includes(key) || key.includes(k)) return v
  return null
}

// Un pedido está PENDIENTE si tiene estado y no está entregado ni anulado.
export function pedidoPendiente(estado: string | null): boolean {
  const e = norm(estado)
  return e !== '' && !e.includes('entreg') && !e.includes('cancel') && !e.includes('anulad')
}
