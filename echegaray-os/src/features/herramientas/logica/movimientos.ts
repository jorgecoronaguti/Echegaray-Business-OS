// EL LIBRO DE MOVIMIENTOS (D06) — agrupado por lote: doce herramientas movidas de una vez son UN renglón.
//
// Un movimiento no se borra ni se edita: se corrige con otro (`corrige_a`). El alta es un movimiento sin
// origen; lo importado sin origen conocido se dice así, no se inventa uno.

import type { Movimiento } from '../types.ts'
import { autorDe, diasDesde, rotuloUbicacion, type Parque } from './parque.ts'

export interface FiltrosMov {
  /** Días hacia atrás; null = todo. */
  dias: number | null
  ubicacion: string | null
  usuario: string | null
}

export interface RenglonMov {
  clave: string
  fecha: string
  activos: { id: string; nombre: string; codigo: string; clase: string }[]
  desde: string[]
  hacia: string
  quien: string | null
  nota: string | null
  alta: boolean
  sinOrigen: boolean
  corregidoPor: Movimiento | null
}

/** La clave de persona de un movimiento, para filtrar y contar: el usuario logueado o el texto del listado. */
export function claveUsuario(m: Pick<Movimiento, 'usuario_id' | 'usuario_texto'>): string | null {
  return m.usuario_id ? `u:${m.usuario_id}` : m.usuario_texto?.trim() ? `t:${m.usuario_texto.trim()}` : null
}

export function libroDeMovimientos(p: Parque, f: FiltrosMov, hoy: Date = new Date()): RenglonMov[] {
  const correcciones = new Map<string, Movimiento>()
  for (const m of p.movimientos) if (m.corrige_a) correcciones.set(m.corrige_a, m)
  const filtrados = p.movimientos.filter((m) => {
    if (f.dias != null && diasDesde(m.fecha_hora, hoy) > f.dias) return false
    if (f.ubicacion && m.destino_id !== f.ubicacion && m.origen_id !== f.ubicacion) return false
    if (f.usuario && claveUsuario(m) !== f.usuario) return false
    return true
  })
  const grupos = new Map<string, Movimiento[]>()
  for (const m of filtrados) {
    // Un lote con destinos distintos (el rodado y la carga que bajó) se parte por destino.
    const k = m.lote_id ? `${m.lote_id}|${m.destino_id}` : m.id
    const l = grupos.get(k)
    if (l) l.push(m)
    else grupos.set(k, [m])
  }
  const out: RenglonMov[] = []
  for (const [clave, ms] of grupos) {
    const primero = ms[0]
    const desde = [...new Set(ms.map((m) => (m.origen_id ? rotuloUbicacion(p, m.origen_id) : null)).filter((x): x is string => !!x))]
    out.push({
      clave,
      fecha: ms.reduce((a, m) => (m.fecha_hora > a ? m.fecha_hora : a), primero.fecha_hora),
      activos: ms.map((m) => {
        const a = p.activoPorId.get(m.activo_id)
        return { id: m.activo_id, nombre: a?.nombre ?? 'activo desconocido', codigo: a?.codigo ?? '', clase: a?.clase ?? '' }
      }).sort((x, y) => Number(y.clase === 'rodado') - Number(x.clase === 'rodado') || x.nombre.localeCompare(y.nombre, 'es')),
      desde,
      hacia: rotuloUbicacion(p, primero.destino_id),
      quien: autorDe(p, primero),
      nota: primero.nota && primero.nota !== 'alta' ? primero.nota : null,
      alta: ms.every((m) => !m.origen_id && !m.importado),
      sinOrigen: ms.every((m) => !m.origen_id),
      corregidoPor: ms.length === 1 ? (correcciones.get(primero.id) ?? null) : null,
    })
  }
  return out.sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0))
}

export function resumenLibro(r: RenglonMov[], p: Parque, f: FiltrosMov, hoy: Date = new Date()) {
  const movs = p.movimientos.filter((m) => (f.dias == null || diasDesde(m.fecha_hora, hoy) <= f.dias)
    && (!f.ubicacion || m.destino_id === f.ubicacion || m.origen_id === f.ubicacion)
    && (!f.usuario || claveUsuario(m) === f.usuario))
  return {
    movimientos: movs.length,
    lotes: r.filter((x) => x.activos.length > 1).length,
    personas: new Set(movs.map(claveUsuario).filter(Boolean)).size,
  }
}
