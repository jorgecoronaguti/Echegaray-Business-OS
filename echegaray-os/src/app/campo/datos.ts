import type { SupabaseClient } from '@supabase/supabase-js'
import { getPuenteObras, getHerramientasGlobal, getPedidosGlobal } from '@/features/integraciones/services/operacionGlobalService'
import { lecturaPedido } from '@/features/integraciones/services/estados'

// LO QUE `/campo` NECESITA SABER, EN UNA SOLA LECTURA.
//
// ═══ QUÉ OBRAS SON «LAS MÍAS» ═══
//
// No se decide acá: `obra_canonica` tiene RLS por `ve_obra(id)`, así que la consulta devuelve
// exactamente las obras que esta persona tiene asignadas (y todas, si es Administración). Repetir el
// criterio en TypeScript sería una segunda definición del alcance que se desincroniza de la de
// Postgres y encima no protege la llamada directa a PostgREST.
//
// ═══ CADA CONTEO PUEDE FALLAR SOLO ═══
//
// Un conteo que falla vuelve `null`, no `0`. La diferencia es toda la pantalla: `0` afirma que no
// hay nada que hacer y `null` dice que no se pudo contar. La fila se dibuja sin señal y el error
// viaja aparte, con el mensaje de la fuente.

export interface ObraDelCampo {
  id: string
  nombre: string
}

export interface DatosCampo {
  obras: ObraDelCampo[]
  partesHoy: number | null
  pedidosSinEntregar: number | null
  herramientasEnObra: number | null
  impedimentosAbiertos: number | null
  /** El primer error real que devolvió alguna fuente. Se muestra tal cual. */
  error: string | null
}

const VACIO: DatosCampo = {
  obras: [],
  partesHoy: null,
  pedidosSinEntregar: null,
  herramientasEnObra: null,
  impedimentosAbiertos: null,
  error: null,
}

/** `YYYY-MM-DD` en la zona del navegador del servidor: la fecha del parte es un día calendario. */
export function hoyISO(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export async function leerDatosCampo(supabase: SupabaseClient): Promise<DatosCampo> {
  try {
    const [obras, puente] = await Promise.all([
      supabase.from('obra_canonica').select('id, nombre').eq('estado', 'activa').order('nombre'),
      getPuenteObras(supabase),
    ])
    if (obras.error) return { ...VACIO, error: obras.error.message }
    const mias = (obras.data ?? []).map((o) => ({ id: o.id as string, nombre: o.nombre as string }))
    if (puente.error !== null) return { ...VACIO, obras: mias, error: puente.error }

    const ids = mias.map((o) => o.id)
    const [partes, impedimentos, pedidos, herramientas] = await Promise.all([
      ids.length
        ? supabase.from('obra_ejecucion').select('id', { count: 'exact', head: true }).eq('fecha', hoyISO()).in('obra_id', ids)
        : Promise.resolve({ count: 0, error: null }),
      ids.length
        ? supabase.from('obra_restriccion').select('id', { count: 'exact', head: true }).eq('estado', 'abierta').in('obra_id', ids)
        : Promise.resolve({ count: 0, error: null }),
      getPedidosGlobal(supabase, puente.data),
      getHerramientasGlobal(supabase, puente.data),
    ])

    const enMisObras = <T extends { obra_canonica_id: string | null }>(filas: T[]) =>
      filas.filter((f) => f.obra_canonica_id !== null && ids.includes(f.obra_canonica_id))

    return {
      obras: mias,
      partesHoy: partes.error ? null : (partes.count ?? 0),
      impedimentosAbiertos: impedimentos.error ? null : (impedimentos.count ?? 0),
      pedidosSinEntregar:
        pedidos.error !== null
          ? null
          : enMisObras(pedidos.data).filter((p) => lecturaPedido(p.estado).clave !== 'entregado').length,
      herramientasEnObra: herramientas.error !== null ? null : enMisObras(herramientas.data).length,
      error: partes.error?.message ?? impedimentos.error?.message ?? pedidos.error ?? herramientas.error ?? null,
    }
  } catch (err) {
    return { ...VACIO, error: err instanceof Error ? err.message : 'Error al conectar con Supabase' }
  }
}
