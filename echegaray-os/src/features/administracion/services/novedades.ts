// CUÁNDO SE PRENDE EL PUNTO ROJO DE LA CAMPANITA — la regla, aparte del dibujo.
//
// Un punto siempre encendido deja de leerse a la semana; uno siempre apagado afirma que está todo
// en orden sin haber mirado. Las dos fallas son silenciosas y las dos se han pagado en este
// repositorio, así que la decisión vive en una función pura con prueba y no adentro de un `&&`.

import type { ChipAtencion } from './homeAdministracion'

/** Lo que la campanita sabe en este momento. `null` = todavía no contestó el servidor. */
export type LecturaNovedades =
  | { ok: true; chips: ChipAtencion[]; noLeida: boolean }
  | { ok: false; error: string }
  | null

export type EstadoCampana = 'sin_pedir' | 'sin_lectura' | 'error' | 'al_dia' | 'con_novedades'

export function estadoDeCampana(l: LecturaNovedades): EstadoCampana {
  if (l === null) return 'sin_pedir'
  if (!l.ok) return 'error'
  // NI UNA FUENTE CONTESTÓ. Sin esto, la base caída y el área sin pendientes se dibujan igual.
  if (l.noLeida) return 'sin_lectura'
  return l.chips.length > 0 ? 'con_novedades' : 'al_dia'
}

/**
 * EL PUNTO SÓLO SE PRENDE CON UN PENDIENTE MEDIDO.
 *
 * No con un error —un error no es un pendiente, es un no sé—, no mientras se espera la respuesta, y
 * nunca «por las dudas». El estado que no se pudo leer se cuenta en el desplegable, con palabras;
 * llevarlo al punto rojo lo convertiría en una alarma permanente el día que una tabla no exista.
 */
export function hayPunto(estado: EstadoCampana): boolean {
  return estado === 'con_novedades'
}

/** Cuántas cosas piden trabajo. Es la SUMA de los chips, no cuántos chips hay: «14 proveedores sin
 *  CUIT» y «1 compra sin obra» son quince cosas, no dos. */
export function cuantasNovedades(chips: ChipAtencion[]): number {
  return chips.reduce((t, c) => t + c.numero, 0)
}

/** Lo que dice el desplegable cuando no hay lista que mostrar. `null` = hay lista. */
export function leyendaCampana(estado: EstadoCampana, error: string | null): string | null {
  switch (estado) {
    case 'sin_pedir': return 'Leyendo…'
    case 'error': return error ?? 'No pude leer las novedades.'
    case 'sin_lectura': return 'No pude leer ninguna de las fuentes. Esto NO quiere decir que no haya nada pendiente.'
    case 'al_dia': return 'Nada pide trabajo ahora.'
    case 'con_novedades': return null
  }
}
