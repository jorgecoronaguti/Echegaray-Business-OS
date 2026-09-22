// LA LECTURA DEL MÓDULO — una sola, para todas las pantallas de Herramientas.
//
// El parque es chico (178 herramientas y 6 rodados el 21/09/2026): se lee entero y cada pantalla lo
// mira distinto. Pedirlo por pedazos obligaría a cada pantalla a rearmar «dónde está» y «quién la
// movió» con su propia consulta, que es como nacen dos versiones del mismo dato.
//
// ═══ SIN LA MIGRACIÓN, NO HAY CERO ═══
// Si `activo` no existe todavía (PGRST205 / 42P01) el resultado es `falta_migracion` y la pantalla lo
// dice. Nunca `ok` con listas vacías.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { getUsuarioActual, getPerfilActual } from '@/features/auth/services/authService'
import { codigosDeObra } from '@/shared/services/codigosDeObra'
import { armarParque, type Parque } from '../logica/parque'
import { faltaMigracion } from '../logica/falta-migracion'
import {
  COLUMNAS_ACTIVO, COLUMNAS_INCIDENCIA, COLUMNAS_MOVIMIENTO, COLUMNAS_UBICACION,
  type Activo, type Incidencia, type Movimiento, type ObraIndice, type Ubicacion,
} from '../types'

export type Lectura =
  | { estado: 'ok'; parque: Parque; obras: ObraIndice[]; yo: { id: string | null; nombre: string | null } }
  | { estado: 'falta_migracion' }
  | { estado: 'error'; mensaje: string }

const TOPE = 10_000

async function leerObras(supabase: SupabaseClient): Promise<ObraIndice[]> {
  const [obras, codigos, clientes] = await Promise.all([
    supabase.from('obra_canonica').select('id, nombre, estado, cliente_id').is('fusionada_en', null),
    codigosDeObra(supabase, null),
    supabase.from('clientes').select('id, nombre_comercial'),
  ])
  const nombreCliente = new Map(
    ((clientes.data ?? []) as { id: string; nombre_comercial: string | null }[]).map((c) => [c.id, c.nombre_comercial]),
  )
  return ((obras.data ?? []) as { id: string; nombre: string | null; estado: string | null; cliente_id: string | null }[]).map((o) => ({
    id: o.id,
    codigo: codigos.get(o.id) ?? null,
    nombre: o.nombre,
    estado: o.estado,
    cliente: o.cliente_id ? (nombreCliente.get(o.cliente_id) ?? null) : null,
  }))
}

export async function leerParque(): Promise<Lectura> {
  try {
    const supabase = await createClient()
    const [activos, ubicaciones, movimientos, incidencias, obras, perfiles, usuario, categorias] = await Promise.all([
      supabase.from('activo').select(COLUMNAS_ACTIVO).order('codigo').limit(TOPE),
      supabase.from('ubicacion').select(COLUMNAS_UBICACION).limit(TOPE),
      supabase.from('activo_movimiento').select(COLUMNAS_MOVIMIENTO).order('fecha_hora', { ascending: false }).limit(TOPE),
      supabase.from('activo_incidencia').select(COLUMNAS_INCIDENCIA).order('creado_en', { ascending: false }).limit(TOPE),
      leerObras(supabase),
      supabase.from('perfiles').select('id, nombre'),
      getUsuarioActual(supabase),
      supabase.from('activo_categoria').select('nombre').order('orden'),
    ])
    for (const r of [activos, ubicaciones, movimientos, incidencias]) {
      if (faltaMigracion(r.error)) return { estado: 'falta_migracion' }
      if (r.error) return { estado: 'error', mensaje: r.error.message }
    }
    const nombres: Record<string, string> = {}
    for (const p of (perfiles.data ?? []) as { id: string; nombre: string | null }[]) if (p.nombre) nombres[p.id] = p.nombre
    const perfil = usuario ? await getPerfilActual(supabase, usuario.id) : null
    return {
      estado: 'ok',
      obras,
      parque: armarParque({
        activos: (activos.data ?? []) as unknown as Activo[],
        ubicaciones: (ubicaciones.data ?? []) as unknown as Ubicacion[],
        movimientos: (movimientos.data ?? []) as unknown as Movimiento[],
        incidencias: (incidencias.data ?? []) as unknown as Incidencia[],
        obras,
        nombres,
        categorias: ((categorias.data ?? []) as { nombre: string }[]).map((c) => c.nombre),
      }),
      yo: { id: usuario?.id ?? null, nombre: perfil?.data?.nombre ?? null },
    }
  } catch (err) {
    return { estado: 'error', mensaje: err instanceof Error ? err.message : 'Error al conectar con Supabase' }
  }
}
