// LOS FILTROS DE PLANIFICACIÓN — tres, y ninguno más. Módulo NEUTRAL.
//
// Rubro, estado y responsable. No es un motor de consultas: es la respuesta a «mostrame sólo lo mío»
// y «mostrame sólo lo que está frenado», que son las dos maneras en que un jefe de obra entra a un
// cronograma de 124 filas.
//
// SE APLICA UNA SOLA VEZ, ARRIBA. Gantt, Lista, Tablero y Próximos reciben la lista YA filtrada: si
// cada vista filtrara con su propia regla, cambiar de solapa cambiaría lo que se ve sin que nadie
// haya tocado el filtro — que es exactamente lo contrario de «son cuatro maneras de mirar lo mismo».

import type { Actividad } from '../types'
import { normalizarRubro } from './rubros.ts'

export interface FiltroPlan {
  /** El nombre del rubro tal como se muestra. Vacío = todos. */
  rubro: string
  /** Un `estado_operativo`: pendiente · lista · en_curso · bloqueada · hecha. Vacío = todos. */
  estado: string
  /** El id de la persona responsable. Vacío = todos. `sin` = las que no tienen responsable. */
  responsable: string
}

export const FILTRO_VACIO: FiltroPlan = { rubro: '', estado: '', responsable: '' }

export const hayFiltro = (f: FiltroPlan): boolean => Boolean(f.rubro || f.estado || f.responsable)

/** Cuántos de los tres están puestos. Va en el botón, para que se vea que hay un recorte activo sin
 *  tener que abrirlo — un cronograma filtrado que parece completo es cómo se lee mal una obra. */
export const cuantosFiltros = (f: FiltroPlan): number =>
  (f.rubro ? 1 : 0) + (f.estado ? 1 : 0) + (f.responsable ? 1 : 0)

/**
 * El recorte. Las filas de RESUMEN nunca se filtran por estado ni por responsable: son la cabecera
 * del rubro y sacarlas dejaría a sus hijas colgando de un grupo sin nombre. Se van solas cuando el
 * filtro de rubro las excluye, que es el único caso en que sobra la cabecera.
 */
export function aplicarFiltro(actividades: Actividad[], f: FiltroPlan): Actividad[] {
  if (!hayFiltro(f)) return actividades
  const rubro = f.rubro ? normalizarRubro(f.rubro) : null
  return actividades.filter((a) => {
    if (rubro) {
      const suyo = a.tipo === 'resumen' ? a.nombre : (a.seccion ?? '')
      if (normalizarRubro(suyo) !== rubro) return false
    }
    if (a.tipo === 'resumen') return true
    if (f.estado && a.estado_operativo !== f.estado) return false
    if (f.responsable) {
      if (f.responsable === 'sin') { if (a.responsable_id) return false }
      else if (a.responsable_id !== f.responsable) return false
    }
    return true
  })
}
