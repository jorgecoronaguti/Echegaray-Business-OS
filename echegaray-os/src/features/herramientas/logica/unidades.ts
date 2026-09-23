// LAS UNIDADES DE UN LOTE CON CÓDIGO PROPIO (migración 20260923T1500) — puro: sin Supabase, sin React.
//
// Dueño, 23/09: «lo que tiene cantidad tiene que ir generando códigos únicos cuando haga falta». El lote
// sigue siendo UN activo; cada unidad que se individualiza recibe `<código del lote>/<n>`: BAL-001/3.
// Los códigos se piden de a tantos como haga falta, nunca más que unidades tiene el lote.
//
// Un activo con cantidad 1 (rodado, máquina, herramienta suelta) YA está identificado por su código:
// no tiene unidades, y esta lógica lo dice antes de que la base lo rechace.

import type { Activo } from '../types.ts'

export interface Unidad {
  id: string
  activo_id: string
  numero: number
  codigo: string
  estado: 'operativo' | 'baja'
  ubicacion_id: string | null
  nota: string | null
  creado_en: string
}

/** La migración que crea `activo_unidad`; la pantalla la nombra cuando falta. */
export const MIGRACION_UNIDADES = '20260923T1500'
export const COLUMNAS_UNIDAD = 'id, activo_id, numero, codigo, estado, ubicacion_id, nota, creado_en'

/** Cuántos códigos se proponen por defecto: una hoja de etiquetas (24), o lo que falte si es menos. */
export const TANDA_POR_DEFECTO = 24

const UNIDAD_RE = /^([A-Z]{3}-\d{3,4})\/(\d{1,6})$/

/** «BAL-001/3» → { lote: 'BAL-001', numero: 3 }. Cualquier otra cosa → null. */
export function partesDeUnidad(codigo: string): { lote: string; numero: number } | null {
  const m = UNIDAD_RE.exec(codigo.trim().toUpperCase())
  if (!m) return null
  const numero = Number(m[2])
  return numero >= 1 ? { lote: m[1], numero } : null
}

export const esCodigoDeUnidad = (codigo: string) => partesDeUnidad(codigo) !== null

/** El código que la base va a dar: espejo de `individualizar_unidades` (lote || '/' || n). */
export function codigoDeUnidad(lote: string, numero: number): string {
  return `${lote}/${numero}`
}

/** Las unidades de un activo, por número. Sin la migración (`null`) devuelve []: la pantalla lo distingue por `unidades`. */
export function unidadesDe(unidades: readonly Unidad[] | null | undefined, activoId: string): Unidad[] {
  return (unidades ?? []).filter((u) => u.activo_id === activoId).sort((a, b) => a.numero - b.numero)
}

export type Individualizable =
  | { puede: true; tiene: number; faltan: number; propuesta: number }
  | { puede: false; motivo: 'una_sola' | 'baja' | 'completo' | 'sin_migracion'; tiene: number }

/**
 * Si al lote se le pueden dar más códigos y cuántos se proponen. `unidades === null` = la tabla no existe
 * todavía: se dice «sin la migración», no «ninguna».
 */
export function individualizable(a: Pick<Activo, 'id' | 'cantidad' | 'estado'>, unidades: readonly Unidad[] | null | undefined): Individualizable {
  const tiene = unidadesDe(unidades, a.id).length
  if (unidades == null) return { puede: false, motivo: 'sin_migracion', tiene }
  if (a.estado === 'baja') return { puede: false, motivo: 'baja', tiene }
  if (a.cantidad <= 1) return { puede: false, motivo: 'una_sola', tiene }
  const faltan = a.cantidad - tiene
  if (faltan <= 0) return { puede: false, motivo: 'completo', tiene }
  return { puede: true, tiene, faltan, propuesta: Math.min(faltan, TANDA_POR_DEFECTO) }
}

/** Con `?codigos=` de la pantalla de etiquetas: los códigos de las unidades de un lote, para imprimirlos. */
export function codigosParaEtiquetas(unidades: readonly Unidad[]): string {
  return unidades.filter((u) => u.estado !== 'baja').map((u) => u.codigo).join(',')
}
