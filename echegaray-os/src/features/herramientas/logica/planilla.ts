// EL CONTROL DE HERRAMIENTAS DE UNA OBRA — lo que el sistema sabe, impreso para controlarlo en obra.
//
// Dueño, 22/09: «la planilla q se crea para imprimir por obra no quiero q sea una replica de la foto,
// quiero q crees algo q sea realmente util en base a el sistema». La hoja de papel sólo anotaba
// ingreso y salida a mano; el sistema ya sabe eso. Lo útil en obra es lo que NO sabe: si lo que figura
// está de verdad. Por eso la planilla es un control:
//   · lo que hay hoy, por categoría, con desde cuándo, cuántos días y quién lo llevó, para tildar
//     «está / falta» (lo que falte se reporta después como «no la encuentro»);
//   · lo que ya tiene un problema reportado, para no volver a descubrirlo;
//   · lo que entró y salió en los últimos 30 días, para reconstruir un faltante.

import { activosEn, autorDe, cantidadEn, diasDesde, ETIQUETA_ESTADO, rotuloUbicacion, type Parque } from './parque.ts'
import type { Activo, Movimiento } from '../types.ts'

export interface FilaControl {
  activo: Activo
  /** Unidades que hay EN ESTE LUGAR (un lote repartido puede tener otras en otro lado). */
  cantidad: number
  llego: string | null
  dias: number | null
  trajo: string | null
}

export interface MovimientoControl {
  fecha: string
  activo: Activo
  sentido: 'entró' | 'salió'
  otroLado: string
  quien: string | null
  nota: string | null
}

export interface Control {
  porCategoria: { categoria: string; filas: FilaControl[] }[]
  activos: number
  unidades: number
  conProblema: FilaControl[]
  ultimos: MovimientoControl[]
}

export function controlDeUbicacion(p: Parque, ubicacionId: string, hoy: Date = new Date(), ventanaDias = 30): Control {
  const aca = activosEn(p, ubicacionId)
  const filas = aca.map((a): FilaControl => {
    const llegada = (p.movsDe.get(a.id) ?? []).find((m) => m.destino_id === ubicacionId) ?? null
    return {
      activo: a,
      cantidad: cantidadEn(p, a.id, ubicacionId),
      llego: llegada?.fecha_hora ?? null,
      dias: llegada ? diasDesde(llegada.fecha_hora, hoy) : null,
      trajo: llegada ? autorDe(p, llegada) : null,
    }
  })
  const orden = new Map((p.categorias ?? []).map((c, i) => [c, i]))
  const grupos = new Map<string, FilaControl[]>()
  for (const f of filas) {
    const c = f.activo.categoria ?? 'Sin categoría'
    const l = grupos.get(c)
    if (l) l.push(f)
    else grupos.set(c, [f])
  }
  const porCategoria = [...grupos]
    .sort(([a], [b]) => (orden.get(a) ?? 999) - (orden.get(b) ?? 999) || a.localeCompare(b, 'es'))
    .map(([categoria, fs]) => ({ categoria, filas: fs.sort((x, y) => x.activo.nombre.localeCompare(y.activo.nombre, 'es', { numeric: true })) }))

  const ultimos: MovimientoControl[] = p.movimientos
    .filter((m) => (m.destino_id === ubicacionId || m.origen_id === ubicacionId) && !m.importado && diasDesde(m.fecha_hora, hoy) <= ventanaDias)
    .map((m: Movimiento) => {
      const entro = m.destino_id === ubicacionId
      const otro = entro ? m.origen_id : m.destino_id
      return {
        fecha: m.fecha_hora,
        activo: p.activoPorId.get(m.activo_id)!,
        sentido: entro ? 'entró' as const : 'salió' as const,
        otroLado: otro ? rotuloUbicacion(p, otro) : 'alta',
        quien: autorDe(p, m),
        nota: m.nota && m.nota !== 'alta' ? m.nota : null,
      }
    })
    .filter((x) => x.activo)
    .sort((a, b) => b.fecha.localeCompare(a.fecha))

  return {
    porCategoria,
    activos: aca.length,
    unidades: filas.reduce((s, f) => s + f.cantidad, 0),
    conProblema: filas.filter((f) => f.activo.estado !== 'operativo'),
    ultimos,
  }
}

export function textoEstado(a: Activo): string {
  return ETIQUETA_ESTADO[a.estado]
}
