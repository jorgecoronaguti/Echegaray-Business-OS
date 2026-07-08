import type { NaturalezaDato } from '@/shared/types/datoTrazado'

// Continuidad Operacional de Datos y Conocimiento (Track B / B8, dependencia
// transversal antes de OLA 3). Catálogo vivo de las fuentes reales de la empresa
// (Drive, sistemas externos, capacidades propias del OS) con su frescura/cobertura.
// El Motor de Confianza y el Motor de Decisiones deben poder consultar esto antes
// de responder -- una respuesta basada en una fuente atrasada/parcial debe reflejarlo.
export type TipoArchivoFuente =
  | 'google_sheet'
  | 'google_doc'
  | 'google_form'
  | 'pdf_periodico'
  | 'carpeta_documental'
  | 'excel_macro'
  | 'excel_estatico'
  | 'interno_os'
  | 'externo_no_conectado'

export type FrecuenciaActualizacion = 'diaria' | 'semanal' | 'quincenal' | 'mensual' | 'por_evento' | 'esporadica' | 'desconocida'
export type Vigencia = 'vigente' | 'obsoleta' | 'desconocida'
export type Criticidad = 'alta' | 'media' | 'baja'
export type MecanismoIntegracion =
  | 'sincronizacion'
  | 'ingesta_incremental'
  | 'lectura_periodica'
  | 'eventos'
  | 'api'
  | 'webhook'
  | 'extraccion_documental'
  | 'procesamiento_batch'
  | 'interfaz_propia'
  | 'convivencia_temporal'
  | 'reemplazo_progresivo'
  | 'mantenimiento_documento'
  | 'hibrido'
  | 'no_conectado'

export type EstadoFuente = 'actualizado' | 'atrasado' | 'error' | 'cobertura_parcial' | 'conflicto' | 'fuente_no_disponible'

export interface FuenteDatos {
  id: string
  nombre: string
  tipo_archivo: TipoArchivoFuente
  drive_file_id: string | null
  drive_url: string | null
  proceso_negocio: string
  area: string
  responsable_probable: string | null
  frecuencia_actualizacion: FrecuenciaActualizacion
  vigencia: Vigencia
  fuente_primaria: boolean
  naturaleza_dato: NaturalezaDato
  cobertura_desde: string | null
  cobertura_hasta: string | null
  destino_supabase: string | null
  capability_dependiente: string | null
  criticidad: Criticidad
  mecanismo_integracion: MecanismoIntegracion
  duplicada_de: string | null
  conflicto_con: string | null
  ultima_lectura: string | null
  ultima_sincronizacion_exitosa: string | null
  estado: EstadoFuente
  notas: string | null
  created_at: string
  updated_at: string
}

export const ESTADO_FUENTE_LABEL: Record<EstadoFuente, string> = {
  actualizado: 'Actualizado',
  atrasado: 'Atrasado',
  error: 'Error',
  cobertura_parcial: 'Cobertura parcial',
  conflicto: 'Conflicto',
  fuente_no_disponible: 'Fuente no disponible',
}

// Materialidad para el Motor de Decisiones: solo estos 2 estados ameritan advertir
// que una respuesta puede estar basada en información no confiable.
const ESTADOS_QUE_REQUIEREN_ADVERTENCIA: EstadoFuente[] = ['atrasado', 'error', 'cobertura_parcial', 'conflicto', 'fuente_no_disponible']

export function fuentesCriticasConProblema(fuentes: FuenteDatos[]): FuenteDatos[] {
  return fuentes.filter((f) => f.criticidad === 'alta' && ESTADOS_QUE_REQUIEREN_ADVERTENCIA.includes(f.estado))
}

export function fuentesDuplicadasOEnConflicto(fuentes: FuenteDatos[]): FuenteDatos[] {
  return fuentes.filter((f) => f.duplicada_de !== null || f.conflicto_con !== null)
}
