// Scorecard vivo (Programa de Ejecución Continua, punto 2). Escala 0-10 definida en
// el Marco de Madurez del Operador Digital: 0 inexistente ... 10 mejora continua.
// Esta tabla reemplaza al documento estático -- el criterio de avance y el
// bloqueante viven acá para poder responder "qué dominio puede avanzar ahora" sin
// releer un artifact viejo.
export interface ScorecardDominio {
  id: string
  dominio: string
  nivel_actual: number
  evidencia: string
  fecha_evaluacion: string
  bloqueante: string
  criterio_objetivo_avance: string
  incremento_activo: string | null
  resultado_esperado: string | null
  resultado_real: string | null
  created_at: string
  updated_at: string
}

export function dominioMasAtrasado(dominios: ScorecardDominio[]): ScorecardDominio | null {
  if (dominios.length === 0) return null
  return [...dominios].sort((a, b) => a.nivel_actual - b.nivel_actual)[0]
}

export function dominiosConIncrementoActivo(dominios: ScorecardDominio[]): ScorecardDominio[] {
  return dominios.filter((d) => d.incremento_activo !== null)
}
