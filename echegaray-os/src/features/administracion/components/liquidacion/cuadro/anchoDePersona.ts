// EL ANCHO DE LA COLUMNA PERSONA LO DECIDE QUIEN MIRA — dueño, 16/09/2026, textual: *«me tenés que permitir mover, hacer
// más ancha la columna»*. Con los dos renglones Recibo/Plataforma, 250 px truncan «Oficial especializado · $7.420/h».
//
// Puro: la aritmética del arrastre y el recuerdo por navegador. La medida vive en la variable CSS `--liq-persona` que
// ya gobierna la columna (ver `GrillaEspejoQuincena.tsx`); esto sólo decide cuántos píxeles.

export const ANCHO_PERSONA_MIN = 150
export const ANCHO_PERSONA_MAX = 560
export const CLAVE_ANCHO_PERSONA = 'liq-persona-px'

/** El ancho tras arrastrar `dx` desde `inicio`, acotado: nunca menos que el teléfono ni más que media pantalla. */
export function anchoArrastrado(inicio: number, dx: number): number {
  const n = Math.round(inicio + dx)
  return Math.min(ANCHO_PERSONA_MAX, Math.max(ANCHO_PERSONA_MIN, n))
}

/** Lo recordado en el navegador, o `null` si no hay nada válido. Nunca lanza: sin storage, no hay recuerdo. */
export function anchoRecordado(leer: (clave: string) => string | null): number | null {
  try {
    const v = Number(leer(CLAVE_ANCHO_PERSONA))
    return Number.isFinite(v) && v >= ANCHO_PERSONA_MIN && v <= ANCHO_PERSONA_MAX ? Math.round(v) : null
  } catch {
    return null
  }
}
