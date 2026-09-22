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
}

/** El estado que ve la gente, derivado en la base — nunca tipeado. */
export type EstadoTicket = 'leyendo' | 'en_compras' | 'observado' | 'respondido' | 'duplicado' | 'error' | 'descartado'

/** Lo que el worker guardó del circuito de comprobantes (`comprobante_entrada.resultado`). */
export interface ResultadoLectura {
  comprobantes?: Array<{
    proveedor?: string | null
    total?: string | number | null
    fecha?: string | null
    clave?: string | null
  }> | null
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
  estado: EstadoTicket
}
