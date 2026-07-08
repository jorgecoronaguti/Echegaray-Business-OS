// Motor de Confianza transversal (Track B / B1). Generaliza el patrón nacido en
// O1-C (features/actividades-semanales/types/produccionEconomica.ts) para que
// cualquier feature pueda declarar la naturaleza de un dato sin fabricar
// precisión que la evidencia no sostiene.
//
// 'confirmado'  -- verificado contra una fuente externa autoritativa (banco, AFIP).
// 'conciliado'   -- dos fuentes internas coinciden.
// 'observado'    -- viene directo de una fuente real (una tabla, un registro).
// 'calculado'    -- aritmética exacta sobre datos observados.
// 'estimado'     -- una simplificación explícita (ej. interpolación lineal).
// 'inferido'     -- un juicio, no un cálculo determinista.
// 'conflictivo'  -- dos fuentes no coinciden y no se resolvió automáticamente.
// 'sin_dato'     -- falta la fuente; no se fabrica un valor.
export type NaturalezaDato =
  | 'confirmado'
  | 'conciliado'
  | 'observado'
  | 'calculado'
  | 'estimado'
  | 'inferido'
  | 'conflictivo'
  | 'sin_dato'

export interface DatoTrazado<T> {
  valor: T | null
  naturaleza: NaturalezaDato
  explicacion: string
}

export function datoObservado<T>(valor: T, explicacion: string): DatoTrazado<T> {
  return { valor, naturaleza: 'observado', explicacion }
}

export function datoSinDato<T = never>(explicacion: string): DatoTrazado<T> {
  return { valor: null, naturaleza: 'sin_dato', explicacion }
}
