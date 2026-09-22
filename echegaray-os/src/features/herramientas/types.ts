// EL MODELO DE HERRAMIENTAS TAL COMO LO DEFINE LA MIGRACIÓN 20260921T2100 — sin columnas inventadas.
//
// Cliente ≠ Obra ≠ Ubicación ≠ Estado. La obra sale del índice (`obra_canonica`), la ubicación es
// dónde está el activo HOY y el estado es si sirve. Toda escritura va por las funciones de la base.

export type Clase = 'herramienta' | 'equipo' | 'rodado'
export type EstadoActivo = 'operativo' | 'requiere_mantenimiento' | 'fuera_servicio' | 'reparacion_externa' | 'baja'
export type TipoUbicacion = 'taller' | 'obra' | 'rodado' | 'servicio_tecnico' | 'tercero'
export type TipoIncidencia = 'fallando' | 'no_anda' | 'no_encontrada'
export type MotivoBaja = 'robada' | 'perdida' | 'descartada' | 'vendida'

export interface Activo {
  id: string
  codigo: string
  clase: Clase
  nombre: string
  /** 1 = una unidad; más = un lote («Balde de albañil · lote», 8). Migración 20260922T1000. */
  cantidad: number
  categoria: string | null
  patente: string | null
  numero_serie: string | null
  foto_url: string | null
  compra_fecha: string | null
  compra_precio: number | null
  ubicacion_id: string | null
  estado: EstadoActivo
  estado_nota: string | null
  estado_desde: string
  estado_por: string | null
  estado_asumido: boolean
  baja_motivo: MotivoBaja | null
  baja_detalle: string | null
  baja_en: string | null
  alta_desde_obra: boolean
  etiqueta_impresa_en: string | null
  legado_id: string | null
  creado_en: string
}

export interface Ubicacion {
  id: string
  tipo: TipoUbicacion
  nombre: string | null
  obra_id: string | null
  activo_id: string | null
  contacto: string | null
  archivada: boolean
}

export interface Movimiento {
  id: string
  activo_id: string
  origen_id: string | null
  destino_id: string
  fecha_hora: string
  usuario_id: string | null
  usuario_texto: string | null
  lote_id: string | null
  nota: string | null
  corrige_a: string | null
  importado: boolean
}

export interface Incidencia {
  id: string
  activo_id: string
  tipo: TipoIncidencia
  texto: string | null
  foto_url: string | null
  ubicacion_id: string | null
  estado_resultante: string
  usuario_id: string | null
  creado_en: string
  cerrada_en: string | null
}

/** Una obra del índice, con lo necesario para rotularla. */
export interface ObraIndice {
  id: string
  codigo: string | null
  nombre: string | null
  estado: string | null
  cliente: string | null
}

export const COLUMNAS_ACTIVO =
  'id, codigo, clase, nombre, cantidad, categoria, patente, numero_serie, foto_url, compra_fecha, compra_precio, ubicacion_id, estado, estado_nota, estado_desde, estado_por, estado_asumido, baja_motivo, baja_detalle, baja_en, alta_desde_obra, etiqueta_impresa_en, legado_id, creado_en'
export const COLUMNAS_UBICACION = 'id, tipo, nombre, obra_id, activo_id, contacto, archivada'
export const COLUMNAS_MOVIMIENTO =
  'id, activo_id, origen_id, destino_id, fecha_hora, usuario_id, usuario_texto, lote_id, nota, corrige_a, importado'
export const COLUMNAS_INCIDENCIA =
  'id, activo_id, tipo, texto, foto_url, ubicacion_id, estado_resultante, usuario_id, creado_en, cerrada_en'

/** Una verificación de uso (migración 20260922T1200): km para un rodado, horas para un equipo. */
export type RespuestaChecklist = 'bien' | 'mal'
export interface LecturaUso {
  id: string
  activo_id: string
  unidad: 'km' | 'h'
  /** null = no se cargó (sin odómetro u horómetro). Vacío no es cero. */
  lectura: number | null
  checklist: Record<string, RespuestaChecklist>
  criticos_mal: string[]
  observacion: string | null
  operador_persona_id: string | null
  usuario_id: string
  fecha_hora: string
  incidencia_id: string | null
  estado_resultante: string
}
/** numeric de Postgres llega como string por PostgREST cuando no entra en un double seguro: se normaliza al leer. */
export const COLUMNAS_LECTURA =
  'id, activo_id, unidad, lectura, checklist, criticos_mal, observacion, operador_persona_id, usuario_id, fecha_hora, incidencia_id, estado_resultante'
