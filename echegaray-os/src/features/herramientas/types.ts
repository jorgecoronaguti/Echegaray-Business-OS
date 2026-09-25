// EL MODELO DE HERRAMIENTAS TAL COMO LO DEFINE LA MIGRACIÓN 20260921T2100 — sin columnas inventadas.
//
// Cliente ≠ Obra ≠ Ubicación ≠ Estado. La obra sale del índice (`obra_canonica`), la ubicación es
// dónde está el activo HOY y el estado es si sirve. Toda escritura va por las funciones de la base.

/** EPP y ropa de trabajo (20260925T1100): van por talle, pueden estar en 0 y se entregan a una persona. */
export type Clase = 'herramienta' | 'equipo' | 'rodado' | 'epp' | 'ropa'
export type EstadoActivo = 'operativo' | 'requiere_mantenimiento' | 'fuera_servicio' | 'reparacion_externa' | 'baja'
/** 'persona' (20260925T1100): lo que se le entregó de EPP y ropa a alguien del legajo. */
export type TipoUbicacion = 'taller' | 'obra' | 'rodado' | 'servicio_tecnico' | 'tercero' | 'persona'
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
  /** Talle del EPP o la ropa (20260925T1100). null = único, o no es EPP/ropa. */
  talle?: string | null
  /** El producto real (20260925T1300): marca, modelo y código del artículo en la lista del proveedor. */
  marca?: string | null
  modelo?: string | null
  codigo_proveedor?: string | null
  /** Precio neto unitario de una COTIZACIÓN (no es compra); `precio_referencia_de` dice de cuál. */
  precio_referencia?: number | null
  precio_referencia_de?: string | null
  patente: string | null
  numero_serie: string | null
  foto_url: string | null
  compra_fecha: string | null
  compra_precio: number | null
  /** El proveedor del producto (la compra o, si sólo hay cotización, quien cotizó). */
  compra_proveedor_id?: string | null
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
  /** El proveedor que ES este lugar (servicio técnico o tercero, 20260923T2400): el nombre sale de ahí. */
  proveedor_id?: string | null
  /** La persona que ES este lugar (tipo persona, 20260925T1100). */
  persona_id?: string | null
}

/** Lo que Herramientas necesita de un proveedor para nombrarlo como lugar y ofrecerlo como servicio técnico. */
export interface ProveedorLugar {
  id: string
  nombre: string
  cuit: string | null
  rubro: string | null
  rubro_deducido: string | null
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
  /** Unidades movidas (20260922T1300). null = anterior, cuando un lote sólo se movía entero. */
  cantidad?: number | null
  /** La factura de compra que respalda un ingreso (20260925T1300, `comprobantes_arca`). */
  comprobante_id?: string | null
  /** El papel en Drive que respalda el movimiento (20260925T1400): la constancia SRT 299/11 firmada. */
  respaldo_drive_file_id?: string | null
}

/**
 * Cuántas unidades de un activo hay en un lugar (migración 20260922T1300). Un lote puede estar
 * repartido: BAL-001 con 5 en el Taller y 3 en una obra. Es LA verdad de dónde están las cosas;
 * `activo.ubicacion_id` es sólo el lugar donde hay más y `activo.cantidad` el total.
 */
export interface Existencia {
  activo_id: string
  ubicacion_id: string
  cantidad: number
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
  'id, codigo, clase, nombre, cantidad, categoria, talle, marca, modelo, codigo_proveedor, precio_referencia, precio_referencia_de, patente, numero_serie, foto_url, compra_fecha, compra_precio, compra_proveedor_id, ubicacion_id, estado, estado_nota, estado_desde, estado_por, estado_asumido, baja_motivo, baja_detalle, baja_en, alta_desde_obra, etiqueta_impresa_en, legado_id, creado_en'
export const COLUMNAS_UBICACION = 'id, tipo, nombre, obra_id, activo_id, contacto, archivada, proveedor_id, persona_id'
export const COLUMNAS_PROVEEDOR_LUGAR = 'id, nombre, cuit, rubro, rubro_deducido'
export const COLUMNAS_MOVIMIENTO =
  'id, activo_id, origen_id, destino_id, fecha_hora, usuario_id, usuario_texto, lote_id, nota, corrige_a, importado, cantidad, comprobante_id, respaldo_drive_file_id'
export const COLUMNAS_EXISTENCIA = 'activo_id, ubicacion_id, cantidad'

/** Un cambio de cantidad en un lugar que no es un movimiento: recuento o baja de parte de un lote. */
export interface Ajuste {
  id: string
  activo_id: string
  ubicacion_id: string
  antes: number
  despues: number
  motivo: 'recuento' | MotivoBaja
  detalle: string | null
  usuario_id: string | null
  creado_en: string
}
export const COLUMNAS_AJUSTE = 'id, activo_id, ubicacion_id, antes, despues, motivo, detalle, usuario_id, creado_en'
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
