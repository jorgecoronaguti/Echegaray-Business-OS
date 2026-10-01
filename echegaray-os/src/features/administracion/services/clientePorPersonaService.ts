// DE QUÉ CLIENTE ES CADA PERSONA HOY — para el recorte «Cliente» de Liquidación (`recorteDeLiquidacion.ts`).
//
// Tres lecturas chicas y un cruce en memoria: el directorio dice la obra actual, la obra dice su cliente y el
// cliente su nombre. No hay una vista que lo dé junto, y crear una para un filtro sería una migración por un
// `join` de veinte filas. Si una de las tres falla, se devuelve el error y el cuadro sigue sin el recorte:
// un filtro que no se pudo armar no puede dejar la quincena sin dibujar.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ClientePorPersona } from './recorteDeLiquidacion.ts'
import { sinDireccion } from './vocabularioPersona.ts'

interface FilaDirectorio { id: string; obra_actual_id: string | null; puesto?: string | null }
interface FilaObra { id: string; cliente_id: string | null }
interface FilaCliente { id: string; nombre_comercial: string | null }

/** El cruce, sin base: se prueba solo. */
export function cruzarClientes(
  directorio: readonly FilaDirectorio[], obras: readonly FilaObra[], clientes: readonly FilaCliente[],
): ClientePorPersona {
  const clienteDeObra = new Map(obras.map((o) => [o.id, o.cliente_id]))
  const nombre = new Map(clientes.map((c) => [c.id, (c.nombre_comercial ?? '').trim()]))
  const mapa: Record<string, { id: string; nombre: string }> = {}
  for (const p of directorio) {
    const cliente = p.obra_actual_id ? clienteDeObra.get(p.obra_actual_id) : null
    const texto = cliente ? nombre.get(cliente) : null
    if (cliente && texto) mapa[p.id] = { id: cliente, nombre: texto }
  }
  return mapa
}

export async function leerClientePorPersona(
  supabase: SupabaseClient,
): Promise<{ mapa: ClientePorPersona; error: string | null }> {
  const [dir, obras, clientes] = await Promise.all([
    supabase.from('persona_directorio').select('id, obra_actual_id, puesto'),
    supabase.from('obra_canonica').select('id, cliente_id'),
    supabase.from('clientes').select('id, nombre_comercial'),
  ])
  const error = dir.error?.message ?? obras.error?.message ?? clientes.error?.message ?? null
  if (error) return { mapa: {}, error }
  return {
    // DIRECCIÓN NO ES PLANTEL (dueño, 22/09/2026): la regla única del módulo Personal, también acá.
    mapa: cruzarClientes(
      sinDireccion((dir.data ?? []) as FilaDirectorio[]), (obras.data ?? []) as FilaObra[], (clientes.data ?? []) as FilaCliente[],
    ),
    error: null,
  }
}
