// LA COLA DE MANTENIMIENTO (D07, etapa 1) — con lo que la base sabe: estados e incidencias.
//
// Etapa 1: la reparación externa es un ESTADO. La orden (remito, presupuesto, fecha prometida) es etapa
// 2, igual que el plan de service de rodados y máquinas («Se operan con gente» lee la verificación de uso):
// esos bloques no se dibujan vacíos.

import type { Activo, Incidencia } from '../types.ts'
import { estaAfuera } from './arreglo.ts'
import { conProblema, diasDesde, tipoDe, vivo, type Parque } from './parque.ts'

export type GrupoMant = 'en_obra' | 'en_taller' | 'externa' | 'otros'

export interface ItemMant {
  activo: Activo
  incidencia: Incidencia | null
  dias: number
}

export const TITULO_GRUPO: Record<GrupoMant, { titulo: string; bajada: string }> = {
  en_obra: { titulo: 'Reportado, todavía en obra', bajada: 'hay que decidir si se retira' },
  en_taller: { titulo: 'En el taller', bajada: 'esperando reparación propia o salida' },
  externa: { titulo: 'Afuera, en reparación externa', bajada: 'servicio técnico' },
  otros: { titulo: 'En otro lugar', bajada: 'en un rodado, con un tercero o sin ubicación cargada' },
}

export function grupoDe(p: Parque, a: Activo): GrupoMant {
  if (a.estado === 'reparacion_externa' || tipoDe(p, a.ubicacion_id) === 'servicio_tecnico') return 'externa'
  const t = tipoDe(p, a.ubicacion_id)
  if (t === 'obra') return 'en_obra'
  if (t === 'taller') return 'en_taller'
  return 'otros'
}

/**
 * La cola por grupo, lo más viejo primero dentro de cada uno. Lo que está en el mecánico CON un arreglo cargado
 * no entra acá: tiene su propio cuadro (ingreso, mecánico, días, vuelta estimada) y listarlo dos veces
 * duplicaría el conteo. Lo que está en reparación externa SIN arreglo cargado sigue acá: es lo que falta cargar.
 */
export function colaDeMantenimiento(p: Parque, hoy: Date = new Date()): Record<GrupoMant, ItemMant[]> {
  const out: Record<GrupoMant, ItemMant[]> = { en_obra: [], en_taller: [], externa: [], otros: [] }
  const enMecanico = new Set((p.eventos ?? []).filter(estaAfuera).map((e) => e.activo_id))
  for (const a of p.activos.filter((x) => vivo(x) && conProblema(x) && !enMecanico.has(x.id))) {
    const incidencia = p.incDe.get(a.id)?.find((i) => !i.cerrada_en) ?? null
    out[grupoDe(p, a)].push({ activo: a, incidencia, dias: diasDesde(incidencia?.creado_en ?? a.estado_desde, hoy) })
  }
  for (const k of Object.keys(out) as GrupoMant[]) out[k].sort((x, y) => y.dias - x.dias)
  return out
}
