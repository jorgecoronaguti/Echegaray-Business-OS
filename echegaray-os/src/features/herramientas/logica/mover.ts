// MOVER — lo que el panel muestra antes de confirmar. La base decide; esto sólo prepara la pregunta.
//
// Reglas de la migración que acá no se reinterpretan: el origen no se elige (es donde cada uno está
// hoy); mover no cambia el estado; un activo en baja no se mueve; una obra de destino tiene que estar
// activa; un rodado no se mueve adentro de sí mismo.

import type { Activo, ObraIndice, Ubicacion } from '../types.ts'
import { rotuloUbicacion, vivo, type Parque } from './parque.ts'
import { rotuloDeObra } from '../../../shared/utils/obra.ts'

export interface GrupoOrigen {
  ubicacionId: string | null
  rotulo: string
  cuenta: number
}

/** «Desde»: cada origen con cuántos salen de ahí, en el orden en que aparecen. */
export function origenes(p: Parque, activos: Activo[]): GrupoOrigen[] {
  const m = new Map<string, GrupoOrigen>()
  for (const a of activos) {
    const k = a.ubicacion_id ?? ''
    const g = m.get(k)
    if (g) g.cuenta++
    else m.set(k, { ubicacionId: a.ubicacion_id, rotulo: rotuloUbicacion(p, a.ubicacion_id), cuenta: 1 })
  }
  return [...m.values()]
}

export interface Advertencias {
  /** Los que se mueven con un problema: se mueven igual, el estado viaja con ellos. */
  conProblema: Activo[]
  /** Los que ya están en el destino: la base los saltea. */
  yaEstan: Activo[]
  /** Bajas: la base las rechaza. No se ofrecen. */
  bajas: Activo[]
  /** Rodados que se mueven y llevan algo encima: hay que preguntar si la carga baja o viaja. */
  rodadosConCarga: { rodado: Activo; carga: number }[]
  /** El destino es uno de los rodados que se mueven. */
  adentroDeSiMismo: Activo | null
}

export function advertencias(p: Parque, activos: Activo[], destinoId: string | null): Advertencias {
  const destino = destinoId ? p.ubicacionPorId.get(destinoId) : undefined
  const rodadosConCarga = activos
    .filter((a) => a.clase === 'rodado' && vivo(a))
    .map((r) => {
      const u = p.ubicaciones.find((x) => x.tipo === 'rodado' && x.activo_id === r.id)
      return { rodado: r, carga: u ? p.activos.filter((a) => vivo(a) && a.ubicacion_id === u.id).length : 0 }
    })
    .filter((x) => x.carga > 0)
  return {
    conProblema: activos.filter((a) => a.estado === 'requiere_mantenimiento' || a.estado === 'fuera_servicio' || a.estado === 'reparacion_externa'),
    yaEstan: destinoId ? activos.filter((a) => a.ubicacion_id === destinoId) : [],
    bajas: activos.filter((a) => a.estado === 'baja'),
    rodadosConCarga,
    adentroDeSiMismo: destino?.tipo === 'rodado' ? (activos.find((a) => a.id === destino.activo_id) ?? null) : null,
  }
}

export type OpcionDestino =
  | { tipo: 'ubicacion'; ubicacionId: string; rotulo: string; grupo: 'taller' | 'rodado' | 'servicio_tecnico' | 'tercero' | 'obra' }
  | { tipo: 'obra'; obraId: string; rotulo: string; grupo: 'obra' }

/**
 * Los destinos que se ofrecen. Las obras salen del ÍNDICE y sólo las activas; si todavía no tienen
 * ubicación, se ofrecen igual por su `obra_id` y la ubicación la crea `ubicacion_de_obra()` al elegirla.
 * Nada archivado, ningún rodado dado de baja.
 */
export function destinos(p: Parque, obrasActivas: ObraIndice[]): OpcionDestino[] {
  const fijos = p.ubicaciones
    .filter((u): u is Ubicacion & { tipo: 'taller' | 'rodado' | 'servicio_tecnico' | 'tercero' } => u.tipo !== 'obra' && !u.archivada)
    .filter((u) => u.tipo !== 'rodado' || (u.activo_id && p.activoPorId.get(u.activo_id)?.estado !== 'baja'))
    .map((u) => ({ tipo: 'ubicacion' as const, ubicacionId: u.id, rotulo: rotuloUbicacion(p, u.id), grupo: u.tipo }))
  // Orden del dueño (22/09): «q primero salgan las obras y dp los rodados». Después, Taller y el resto.
  const orden = { rodado: 0, taller: 1, servicio_tecnico: 2, tercero: 3 } as const
  fijos.sort((a, b) => orden[a.grupo] - orden[b.grupo] || a.rotulo.localeCompare(b.rotulo))
  const obras = obrasActivas
    .filter((o) => o.estado === 'activa')
    .map((o) => {
      const u = p.ubicaciones.find((x) => x.tipo === 'obra' && x.obra_id === o.id && !x.archivada)
      return u
        ? { tipo: 'ubicacion' as const, ubicacionId: u.id, rotulo: rotuloDeObra(o), grupo: 'obra' as const }
        : { tipo: 'obra' as const, obraId: o.id, rotulo: rotuloDeObra(o), grupo: 'obra' as const }
    })
    .sort((a, b) => a.rotulo.localeCompare(b.rotulo))
  return [...obras, ...fijos]
}

/** Clave estable de una opción, para el valor de un radio o de un `<select>`. */
export function claveDestino(o: OpcionDestino): string {
  return o.tipo === 'obra' ? `obra:${o.obraId}` : `u:${o.ubicacionId}`
}

/** «Mover 12 activos» / «Mover la Amoladora…». */
export function textoBotonMover(n: number): string {
  return n === 1 ? 'Mover 1 activo' : `Mover ${n} activos`
}
