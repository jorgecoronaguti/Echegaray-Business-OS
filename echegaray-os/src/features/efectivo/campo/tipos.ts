// LO QUE EL TELÉFONO LEE DEL EFECTIVO A RENDIR — el contrato de la migración 20260922T1500.
//
// Se define acá y no en `src/features/efectivo/` porque la web de escritorio la construye otro frente
// en paralelo: dos archivos de tipos para las mismas vistas terminarían divergiendo, pero dos frentes
// escribiendo el mismo archivo a la vez es peor. Cuando los dos estén mergeados, se unifican.

/** Una fila de `efectivo_entrega_saldo`: la cuenta de una entrega, siempre igual. */
export interface EntregaSaldo {
  id: string
  codigo: string
  persona_id: string
  persona: string | null
  obra_id: string | null
  obra: string | null
  estructura: boolean
  /** `yyyy-mm-dd`. */
  fecha: string
  entregado: number
  rendido: number
  filas_rendidas: number
  devuelto: number
  en_su_poder: number
  /** Firmó con el dedo o Administración subió el papel. */
  conformidad: boolean
  estado: 'abierta' | 'cerrada' | 'anulada'
  para_que: string | null
  conformidad_en: string | null
  /** De `efectivo_entrega.entregada_por` (no está en la vista), resuelto a nombre si se puede. */
  entregada_por_nombre?: string | null
  /** La PERSONA de quien entregó, que es lo que pide `declarar_devolucion_efectivo` (M08). */
  entregada_por_persona?: string | null
}

/** Una fila de `efectivo_devolucion_estado`: lo declarado y lo ya recibido. */
export interface DevolucionEstado {
  id: string
  entrega_id: string
  entrega: string
  monto: number
  fecha: string
  recibe: string | null
  declarada_en: string | null
  confirmada_en: string | null
  firmo_entrega: boolean
  firmo_recibe: boolean
  estado: 'declarada' | 'recibida'
}

/** El estado que ve la gente, derivado en la base — nunca tipeado. */
export type EstadoTicket =
  | 'leyendo' | 'a_confirmar' | 'en_compras' | 'observado' | 'respondido' | 'duplicado' | 'error' | 'descartado'

/** Un renglón de papel: lo mismo se haya escrito o sólo leído. */
export interface RenglonLeido {
  proveedor?: string | null
  total?: string | number | null
  fecha?: string | null
  clave?: string | null
  obra?: string | null
}

/**
 * Lo que el worker guardó del circuito de comprobantes (`comprobante_entrada.resultado`).
 *
 * `comprobantes` es lo que SE ESCRIBIÓ en Compras, leído del registro; `leidos` es lo que el modelo
 * leyó del papel en un lote que se frenó esperando la confirmación de la persona (M05). No son lo
 * mismo y por eso son dos campos: uno es un hecho y el otro una lectura.
 */
export interface ResultadoLectura {
  comprobantes?: RenglonLeido[] | null
  leidos?: RenglonLeido[] | null
}

/** Una fila de `efectivo_comprobante_estado`: un ticket mandado para rendir una entrega. */
export interface TicketRendicion {
  id: string
  entrega_id: string
  entrega: string
  canal: 'app' | 'mattermost'
  enviado_en: string
  storage_path: string | null
  nombre_archivo: string | null
  media_type: string | null
  motivo: string | null
  resultado: ResultadoLectura | null
  monto_rendido: number | null
  observacion: string | null
  observado_en: string | null
  respuesta: string | null
  respondido_en: string | null
  descartado_motivo: string | null
  /** Cuándo la persona miró lo leído y dijo que estaba bien (M05). */
  confirmado_en: string | null
  estado: EstadoTicket
}
