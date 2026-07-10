// Reportes automáticos (skill reportes-automaticos-y-comunicaciones, 2026-07-10).
// Un tipo de reporte = fila en reportes_definiciones + generador en
// services/generadores.ts. El contenido y la confianza son jsonb con esta forma.

export type FrecuenciaReporte = 'diario' | 'semanal' | 'mensual' | 'bajo_demanda' | 'por_condicion'
export type CanalReporte = 'os' | 'email' | 'pdf' | 'gdoc' | 'whatsapp' | 'telegram' | 'slack'
export type EstadoEntrega = 'generado' | 'publicado' | 'enviado' | 'fallido'

export interface ReporteDefinicion {
  id: string
  clave: string
  nombre: string
  objetivo: string
  audiencia: string
  dominio: string
  frecuencia: FrecuenciaReporte
  dia_hora: string | null
  periodo_cubierto: string
  fuentes: string[]
  nivel_detalle: string
  formato: string
  canal: CanalReporte
  responsable: string | null
  condicion_envio: string | null
  si_faltan_datos: string
  activo: boolean
  created_at: string
}

export interface NumeroClave {
  label: string
  valor: string
  link?: string
}

export interface ContenidoReporte {
  resumen_ejecutivo: string
  principales_cambios: string[]
  numeros_clave: NumeroClave[]
  riesgos: string[]
  decisiones_requeridas: string[]
  acciones_vencidas: string[]
  recomendaciones: string[]
  links_os: { label: string; href: string }[]
}

export interface ConfianzaReporte {
  confirmados: string[]
  calculados: string[]
  estimados: string[]
  parciales: string[]
  fuentes_atrasadas: string[]
  gaps: string[]
}

export interface ReporteGenerado {
  id: string
  definicion_id: string
  periodo_desde: string
  periodo_hasta: string
  contenido: ContenidoReporte
  confianza: ConfianzaReporte
  fuentes_usadas: string[]
  canal: CanalReporte
  estado_entrega: EstadoEntrega
  generado_por: string
  created_at: string
}

export const FRECUENCIA_LABEL: Record<FrecuenciaReporte, string> = {
  diario: 'Diario',
  semanal: 'Semanal',
  mensual: 'Mensual',
  bajo_demanda: 'Bajo demanda',
  por_condicion: 'Por condición',
}
