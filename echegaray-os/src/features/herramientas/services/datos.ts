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
  COLUMNAS_ACTIVO, COLUMNAS_AJUSTE, COLUMNAS_EXISTENCIA, COLUMNAS_INCIDENCIA, COLUMNAS_LECTURA, COLUMNAS_MOVIMIENTO, COLUMNAS_UBICACION,
  type Activo, type Ajuste, type Existencia, type Incidencia, type LecturaUso, type Movimiento, type ObraIndice, type Ubicacion,
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

/** Nombres de quienes operaron (sólo los que la sesión puede ver por RLS de `personas`). */
async function nombresDePersonas(supabase: SupabaseClient, lecs: LecturaUso[] | null): Promise<Record<string, string>> {
  const ids = [...new Set((lecs ?? []).map((l) => l.operador_persona_id).filter((x): x is string => !!x))]
  if (!ids.length) return {}
  const { data } = await supabase.from('personas').select('id, nombre_completo').in('id', ids)
  const out: Record<string, string> = {}
  for (const p of (data ?? []) as { id: string; nombre_completo: string | null }[]) if (p.nombre_completo) out[p.id] = p.nombre_completo
  return out
}

/** Las personas que pueden operar una máquina (M13 «Quién la opera»): las de la empresa que la sesión ve. */
export async function leerOperadores(): Promise<{ id: string; nombre: string }[]> {
  try {
    const supabase = await createClient()
    const { data } = await supabase.from('personas').select('id, nombre_completo')
      .eq('en_la_empresa', true).order('nombre_completo').limit(500)   // las de prueba las esconde la RLS de personas
    return ((data ?? []) as { id: string; nombre_completo: string | null }[])
      .filter((p) => p.nombre_completo).map((p) => ({ id: p.id, nombre: p.nombre_completo as string }))
  } catch {
    return []
  }
}

export async function leerParque(): Promise<Lectura> {
  try {
    const supabase = await createClient()
    const [activos, ubicaciones, movimientos, incidencias, obras, perfiles, usuario, categorias, lecturas, existencias, ajustes] = await Promise.all([
      supabase.from('activo').select(COLUMNAS_ACTIVO).order('codigo').limit(TOPE),
      supabase.from('ubicacion').select(COLUMNAS_UBICACION).limit(TOPE),
      supabase.from('activo_movimiento').select(COLUMNAS_MOVIMIENTO).order('fecha_hora', { ascending: false }).limit(TOPE),
      supabase.from('activo_incidencia').select(COLUMNAS_INCIDENCIA).order('creado_en', { ascending: false }).limit(TOPE),
      leerObras(supabase),
      supabase.from('perfiles').select('id, nombre'),
      getUsuarioActual(supabase),
      supabase.from('activo_categoria').select('nombre').order('orden'),
      supabase.from('activo_lectura_uso').select(COLUMNAS_LECTURA).order('fecha_hora', { ascending: false }).limit(TOPE),
      supabase.from('activo_existencia').select(COLUMNAS_EXISTENCIA).limit(TOPE),
      supabase.from('activo_ajuste').select(COLUMNAS_AJUSTE).order('creado_en', { ascending: false }).limit(TOPE),
    ])
    // Las existencias por lugar son de 20260922T1300: sin esa tabla, cada activo está entero en su lugar.
    if (existencias.error && !faltaMigracion(existencias.error)) return { estado: 'error', mensaje: existencias.error.message }
    for (const r of [activos, ubicaciones, movimientos, incidencias]) {
      if (faltaMigracion(r.error)) return { estado: 'falta_migracion' }
      if (r.error) return { estado: 'error', mensaje: r.error.message }
    }
    const nombres: Record<string, string> = {}
    for (const p of (perfiles.data ?? []) as { id: string; nombre: string | null }[]) if (p.nombre) nombres[p.id] = p.nombre
    const perfil = usuario ? await getPerfilActual(supabase, usuario.id) : null
    // La verificación de uso es de 20260922T1200: si esa tabla todavía no existe, el resto del módulo
    // anda igual y la verificación dice «sin la migración» (null), nunca «nunca».
    if (lecturas.error && !faltaMigracion(lecturas.error)) return { estado: 'error', mensaje: lecturas.error.message }
    const lecs = lecturas.error ? null : ((lecturas.data ?? []) as unknown as LecturaUso[]).map((l) => ({
      ...l, lectura: l.lectura == null ? null : Number(l.lectura),
    }))
    const personas = await nombresDePersonas(supabase, lecs)
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
        lecturas: lecs,
        personas,
        existencias: existencias.error ? undefined : ((existencias.data ?? []) as unknown as Existencia[]),
        ajustes: ajustes.error ? [] : ((ajustes.data ?? []) as unknown as Ajuste[]),
      }),
      yo: { id: usuario?.id ?? null, nombre: perfil?.data?.nombre ?? null },
    }
  } catch (err) {
    return { estado: 'error', mensaje: err instanceof Error ? err.message : 'Error al conectar con Supabase' }
  }
}
