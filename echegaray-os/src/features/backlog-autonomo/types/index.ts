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
  gap_dato: 'gestion_general',
  gap_proceso: 'gestion_general',
  riesgo: 'gestion_general',
  anomalia: 'obras',
  oportunidad: 'gestion_general',
  gap_skill: 'gestion_general',
  deuda_tecnica: 'gestion_general',
  integracion_faltante: 'gestion_general',
  mejora_potencial: 'gestion_general',
}

const SEVERIDAD_POR_IMPACTO: Record<ImpactoBacklog, SeveridadAlerta> = {
  alta: 'alta',
  media: 'media',
  baja: 'informativa',
}

// UX-4: getBacklogAutonomo ordena por created_at ascendente (más viejo primero) --
// correcto para el listado completo, pero un resumen de "primeros N" sobre esa
// lista muestra los ítems más viejos, no los más importantes. Bug real encontrado en
// esta ola (Operador Digital mostraba 8 ítems de meses atrás y no el hallazgo de
// hoy). Prioriza por impacto, después por urgencia, después por más reciente.
const ORDEN_IMPACTO: Record<ImpactoBacklog, number> = { alta: 0, media: 1, baja: 2 }
const ORDEN_URGENCIA: Record<UrgenciaBacklog, number> = { alta: 0, media: 1, por_confirmar: 2, baja: 3 }

export function ordenarBacklogPorPrioridad(items: BacklogItem[]): BacklogItem[] {
  return [...items].sort((a, b) => {
    const porImpacto = ORDEN_IMPACTO[a.impacto] - ORDEN_IMPACTO[b.impacto]
    if (porImpacto !== 0) return porImpacto
    const porUrgencia = ORDEN_URGENCIA[a.urgencia] - ORDEN_URGENCIA[b.urgencia]
    if (porUrgencia !== 0) return porUrgencia
    return a.created_at < b.created_at ? 1 : -1
  })
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
