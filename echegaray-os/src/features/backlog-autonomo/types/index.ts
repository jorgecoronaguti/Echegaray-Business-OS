import type { NaturalezaDato } from '@/shared/types/datoTrazado'
import type { AreaOS } from '@/features/areas/types'
import type { SeveridadAlerta } from '@/features/dashboard/types'

// Backlog Autónomo (Track B / punto 6, OLA 2): trabajo detectado por el propio
// sistema (gap de dato, riesgo, anomalía, oportunidad, deuda técnica...), no
// generado por una acción humana directa. Se convierte en `acciones` (Centro de
// Acción) reutilizando `alerta_origen_id` -- nunca duplica el task manager.
export type TipoBacklog =
  | 'gap_dato'
  | 'gap_proceso'
  | 'riesgo'
  | 'anomalia'
  | 'oportunidad'
  | 'gap_skill'
  | 'deuda_tecnica'
  | 'integracion_faltante'
  | 'mejora_potencial'

export type ImpactoBacklog = 'alta' | 'media' | 'baja'
export type UrgenciaBacklog = 'alta' | 'media' | 'baja' | 'por_confirmar'
export type EsfuerzoBacklog = 'alto' | 'medio' | 'bajo'
export type NivelAutonomia = 'A' | 'B' | 'C' | 'D' | 'E' | 'F'
export type EstadoBacklog = 'abierto' | 'en_curso' | 'resuelto' | 'descartado'

export interface BacklogItem {
  id: string
  tipo: TipoBacklog
  titulo: string
  evidencia: string
  fuente: string
  confianza: NaturalezaDato
  impacto: ImpactoBacklog
  urgencia: UrgenciaBacklog
  esfuerzo: EsfuerzoBacklog
  dependencia: string | null
  recomendacion: string
  nivel_autonomia_permitido: NivelAutonomia
  estado: EstadoBacklog
  created_at: string
  updated_at: string
}

export const TIPO_BACKLOG_LABEL: Record<TipoBacklog, string> = {
  gap_dato: 'Gap de dato',
  gap_proceso: 'Gap de proceso',
  riesgo: 'Riesgo',
  anomalia: 'Anomalía',
  oportunidad: 'Oportunidad',
  gap_skill: 'Gap de skill',
  deuda_tecnica: 'Deuda técnica',
  integracion_faltante: 'Integración faltante',
  mejora_potencial: 'Mejora potencial',
}

export const NIVEL_AUTONOMIA_LABEL: Record<NivelAutonomia, string> = {
  A: 'A — Observar y responder (automático)',
  B: 'B — Investigar y analizar (automático)',
  C: 'C — Crear borradores/propuestas (automático)',
  D: 'D — Ejecutar interno reversible (con política previa)',
  E: 'E — Impacto económico/legal (aprobación humana)',
  F: 'F — Irreversible/legal/fiscal (autorización específica)',
}

export const ESTADO_BACKLOG_LABEL: Record<EstadoBacklog, string> = {
  abierto: 'Abierto',
  en_curso: 'En curso',
  resuelto: 'Resuelto',
  descartado: 'Descartado',
}

// Simplificación deliberada, mismo criterio que AREA_POR_CATEGORIA (features/areas):
// la mayoría del backlog autónomo es transversal al OS, no de una obra o área
// operativa específica -- se asigna a Dirección salvo que sea claramente de obra.
const AREA_POR_TIPO_BACKLOG: Record<TipoBacklog, AreaOS> = {
  gap_dato: 'direccion',
  gap_proceso: 'direccion',
  riesgo: 'direccion',
  anomalia: 'obras_produccion',
  oportunidad: 'direccion',
  gap_skill: 'direccion',
  deuda_tecnica: 'direccion',
  integracion_faltante: 'direccion',
  mejora_potencial: 'direccion',
}

const SEVERIDAD_POR_IMPACTO: Record<ImpactoBacklog, SeveridadAlerta> = {
  alta: 'alta',
  media: 'media',
  baja: 'informativa',
}

// Construye los campos a insertar para convertir un item de backlog en una Acción
// trazable -- copia el contenido una sola vez, igual que accionDesdeAlerta.
export function accionDesdeBacklog(item: BacklogItem) {
  return {
    origen: 'sistema' as const,
    titulo: item.titulo,
    causa: item.evidencia,
    area: AREA_POR_TIPO_BACKLOG[item.tipo],
    categoria_alerta: null,
    alerta_origen_id: item.id,
    severidad: SEVERIDAD_POR_IMPACTO[item.impacto],
    obra_id: null,
    contraparte: null,
    monto: null,
    fecha_limite: null,
  }
}
