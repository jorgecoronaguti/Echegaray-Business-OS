// Utilidades de PRESENTACIÓN de la estrategia financiera — módulo plano (sin 'use client')
// para poder usarse tanto en Server Components (Tablero) como en Client Components (Calendario).
// No corrige el motor (contrato intocable): sólo lee su salida con robustez.

// El motor a veces materializa `eleccion.por_que` como un objeto de comparación
// ({ranking, objetivo_cfo, justificacion, criterio_decisivo}) en lugar de la frase que el tipo
// declara. Se extrae la frase humana (`justificacion`); si no hay texto legible, se devuelve null
// y la Web no renderiza nada — nunca un objeto crudo (que rompería el render de React).
export function textoPorQue(v: unknown): string | null {
  if (typeof v === 'string') return v.trim() || null
  if (v && typeof v === 'object' && typeof (v as { justificacion?: unknown }).justificacion === 'string') {
    return (v as { justificacion: string }).justificacion.trim() || null
  }
  return null
}
