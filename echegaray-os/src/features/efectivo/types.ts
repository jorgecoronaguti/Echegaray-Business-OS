// EFECTIVO A RENDIR — la forma de lo que la web lee (migración 20260922T1500).
//
// Sin imports: lo usan la lógica pura (probada con `node --test`), los servicios y los componentes.

/** Una fila de `public.efectivo_entrega_saldo`. La cuenta la hace la vista, nunca la pantalla. */
export interface Entrega {
  id: string
  codigo: string
  persona_id: string
  persona: string
  obra_id: string | null
  obra: string | null
  estructura: boolean
  fecha: string
  entregado: number
  rendido: number
  filas_rendidas: number
  devuelto: number
  en_su_poder: number
  conformidad: boolean
  estado: 'abierta' | 'cerrada' | 'anulada'
  para_que: string | null
  conformidad_en: string | null
  cerrada_en: string | null
  anulada_en: string | null
  anulada_motivo: string | null
  /** Declarada prueba al crearla: no llega a la CAJA ni a Compras, y se puede borrar entera. */
  es_prueba: boolean
}

export const COLUMNAS_ENTREGA = [
  'id', 'codigo', 'persona_id', 'persona', 'obra_id', 'obra', 'estructura', 'fecha', 'entregado', 'rendido',
  'filas_rendidas', 'devuelto', 'en_su_poder', 'conformidad', 'estado', 'para_que', 'conformidad_en', 'cerrada_en',
  'anulada_en', 'anulada_motivo', 'es_prueba',
].join(', ')

/** El estado que ve la gente, derivado por la vista `efectivo_comprobante_estado` — nunca tipeado. */
// `respondido` (20260922T1500, commit 1af709b0): la persona ya contestó lo que faltaba y la carga todavía no se
// completó. Es pendiente, pero NO se le vuelve a pedir el dato.
//
// `a_confirmar` (20260922T3000, el circuito del teléfono): el worker LEYÓ el ticket y todavía no escribió la
// fila de Compras porque espera que la persona confirme que lo leído está bien. El escritorio tiene que
// conocer este estado aunque no lo produzca: sin él, `ROTULO_COMPROBANTE[estado]` queda en `undefined` y la
// fila de D03 y la cabecera de D04 se rompen al leer `.texto` de nada.
export type EstadoComprobante =
  | 'leyendo' | 'a_confirmar' | 'en_compras' | 'observado' | 'respondido' | 'duplicado' | 'error' | 'descartado'

/** Lo que el worker guardó de cada comprobante leído (`comprobante_entrada.resultado.comprobantes[]`). */
export interface LeidoDelPapel {
  proveedor?: string | null
  cuit?: string | null
  tipo?: string | null
  numero?: string | null
  total?: string | number | null
  fecha?: string | null
  clave?: string | null
  fila?: number | null
}

/** Una fila de `public.efectivo_comprobante_estado`. */
export interface Comprobante {
  id: string
  entrega_id: string
  entrega: string
  persona_id: string
  canal: 'app' | 'mattermost'
  enviado_en: string
  storage_path: string | null
  nombre_archivo: string | null
  media_type: string | null
  estado_cola: string | null
  motivo: string | null
  resultado: { comprobantes?: LeidoDelPapel[] | null; texto?: string | null } | null
  compra_clave: string | null
  monto_rendido: number | null
  observacion: string | null
  observado_en: string | null
  respuesta: string | null
  respondido_en: string | null
  descartado_en: string | null
  descartado_motivo: string | null
  estado: EstadoComprobante
}

export const COLUMNAS_COMPROBANTE = [
  'id', 'entrega_id', 'entrega', 'persona_id', 'canal', 'enviado_en', 'storage_path', 'nombre_archivo', 'media_type',
  'estado_cola', 'motivo', 'resultado', 'compra_clave', 'monto_rendido', 'observacion', 'observado_en', 'respuesta',
  'respondido_en', 'descartado_en', 'descartado_motivo', 'estado',
].join(', ')

/**
 * Una fila de `public.efectivo_devolucion_estado` (migraciones 20260922T2800/2900).
 *
 * `comprobante` es UNA definición del estado del papel, en la base: la pantalla no vuelve a sumar dos
 * booleanos por su cuenta. La firma de quien recibe se toma en D06; la de quien devolvió, en su teléfono.
 */
export interface Devolucion {
  id: string
  entrega_id: string
  monto: number
  fecha: string
  recibida_por: string | null
  /** Nombre de quien recibió el vuelto. Decorativo: llega por LEFT JOIN, puede ser null. */
  recibe: string | null
  registrada_en: string
  nota: string | null
  firmo_entrega: boolean
  firmo_recibe: boolean
  comprobante: 'completo' | 'falta_quien_devolvio' | 'falta_quien_recibio' | 'sin_firmas'
  papel_url: string | null
}

export const COLUMNAS_DEVOLUCION = [
  'id', 'entrega_id', 'monto', 'fecha', 'recibida_por', 'recibe', 'registrada_en', 'nota',
  'firmo_entrega', 'firmo_recibe', 'comprobante', 'papel_url',
].join(', ')

export interface Rendicion {
  id: string
  entrega_id: string
  compra_clave: string
  monto: number
  imputada_en: string
  comprobante_id: string | null
}

/** La fila de Compras que rinde (lo que se mira de `compra_sheet`). La verdad del gasto es ésa. */
export interface FilaDeCompras {
  fila: number
  clave: string
  fecha: string | null
  proveedor: string | null
  concepto: string | null
  tipo: string | null
  comprobante: string | null
  total: number | null
  tipo_pago: string | null
}

export interface PersonaOpcion {
  id: string
  nombre: string
  puesto: string | null
}

export interface ObraOpcion {
  id: string
  nombre: string
  cliente: string | null
  /** Sólo las activas se ofrecen para entregar; las otras hacen falta para nombrar entregas viejas. */
  activa: boolean
}
