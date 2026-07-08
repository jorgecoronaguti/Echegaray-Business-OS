// Catálogo de preguntas de negocio (Track B / B2). Convierte el catálogo de
// preguntas confiables/no confiables del Marco de Madurez en datos vivos: el OS
// debe poder decir qué puede responder con evidencia y qué no, sin releer un
// documento congelado.
export type EstadoPregunta = 'confiable' | 'parcial' | 'no_confiable'

export interface PreguntaNegocio {
  id: string
  dominio: string
  pregunta: string
  datos_necesarios: string
  fuente: string
  metodo_calculo: string
  estado: EstadoPregunta
  nivel_confianza_actual: string | null
  gap_bloqueante: string | null
  ultima_validacion: string
  created_at: string
  updated_at: string
}

export const ESTADO_PREGUNTA_LABEL: Record<EstadoPregunta, string> = {
  confiable: 'Confiable',
  parcial: 'Parcial',
  no_confiable: 'No confiable todavía',
}
