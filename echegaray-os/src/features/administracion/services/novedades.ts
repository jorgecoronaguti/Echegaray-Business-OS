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

// ═══ LA CAMPANITA NO SE PIDE EN CADA NAVEGACIÓN (12/09/2026) ═══
//
// `campanita_atencion()` es la consulta más llamada del OS —una por pantalla— y lo medido en
// producción la pone en 203 llamadas, 1.149 ms de media y 17.730 ms de máximo. No bloquea el primer
// pintado (se pide después de hidratar), pero sí le disputa el pool de PostgREST a la pantalla que el
// usuario está mirando justo cuando llega la ola del render. Es un impuesto por navegación.
//
// La lectura se guarda en `sessionStorage` y se reusa mientras sea más joven que `TTL_NOVEDADES_MS`.
// Elegido por encima de un caché del servidor por dos razones concretas:
//
//   · NO PUEDE FILTRAR ENTRE USUARIOS. Un caché de servidor necesita una clave de usuario confiable;
//     una clave mal elegida le sirve a una persona el tablero de otra. `sessionStorage` es del
//     navegador de quien entró y muere con la pestaña: no hay clave que equivocar.
//   · LA INVALIDACIÓN ES EL PROPIO GESTO. Lo guardado gobierna SÓLO el punto rojo. Abrir el
//     desplegable —el momento en que la persona va a actuar sobre el número— fuerza una lectura
//     nueva. Un número viejo nunca termina siendo la base de una acción.
//
// Y NO SE ESCONDE: mientras se muestra una lectura guardada, el desplegable dice su edad. Un número
// sin edad declarada es un número que afirma ser de ahora.
export const TTL_NOVEDADES_MS = 60_000

/** Lo que viaja a `sessionStorage`: la lectura y CUÁNDO se tomó. */
export type NovedadesGuardadas = {
  en: number
  lectura: { ok: true; chips: ChipAtencion[]; noLeida: boolean }
}

/**
 * ¿Sirve lo guardado? Sólo una lectura BUENA y del último minuto.
 *
 * Un error no se guarda nunca: cachear un «no pude leer» sería repetir durante un minuto una
 * ignorancia que quizá ya se resolvió. Y una edad NEGATIVA —reloj que se movió para atrás, máquina
 * suspendida— no es «fresquísimo», es desconocido: se descarta.
 */
export function sirveLoGuardado(
  g: NovedadesGuardadas | null, ahora: number, ttl = TTL_NOVEDADES_MS,
): boolean {
  if (!g || typeof g.en !== 'number' || g.lectura?.ok !== true) return false
  const edad = ahora - g.en
  return edad >= 0 && edad < ttl
}

/** «hace N s» para el encabezado del desplegable. `null` cuando la lectura es de este instante: no
 *  hace falta declararle la edad a algo que se acaba de leer. */
export function edadDeLaLectura(g: NovedadesGuardadas | null, ahora: number): string | null {
  if (!g || typeof g.en !== 'number') return null
  const s = Math.floor((ahora - g.en) / 1000)
  if (s < 1) return null
  return `hace ${s} s`
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
