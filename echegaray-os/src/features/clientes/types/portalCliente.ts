// LOS TIPOS DE LAS PANTALLAS 28, 31 Y 32 — cuenta corriente, accesos y esquema de pago.
//
// Viven en `types/portalCliente.ts` y no en un `types.ts` suelto: el módulo `../types` de esta
// feature YA es un directorio (`types/index.ts`). Un `types.ts` al lado de un `types/` deja la
// resolución del módulo ambigua y rompe los imports existentes. Se re-exportan desde el index.
//
// ═══ POR QUÉ TANTO `number | null` Y NINGÚN `number` CON DEFAULT 0 ═══
//
// NULL no es 0. Un DSO nulo significa «no se facturó nada en la ventana, no hay con qué medirlo»;
// un DSO 0 significaría «cobra al instante», que es la afirmación opuesta. Lo mismo con el monto que
// un acceso sin `puede_ver_montos` no tiene derecho a ver: se devuelve null, no cero.

/** Una fila de `public.cliente_cuenta_corriente`. Los nombres son los de la vista. */
export interface CuentaCorrienteCliente {
  cliente_id: string
  nombre_comercial: string
  saldo: number
  vencido: number
  por_vencer: number
  comprobantes_pendientes: number
  /** Las 5 bandas del aging, por la fecha de la columna Q. La primera es «todavía no venció». */
  aging_por_vencer: number
  aging_1_30: number
  aging_31_60: number
  aging_61_90: number
  aging_mas_90: number
  facturado_90d: number
  cobrado_90d: number
  /** (saldo / facturado 90d) x 90. NULL cuando no se facturó nada en la ventana. */
  dso: number | null
  /**
   * cobrado 90d / (cobrado 90d + vencido). NO es tasa de pago EN TÉRMINO: esa no es computable,
   * porque la columna Q del Sheet pisa la fecha prometida con la real al cobrarse.
   */
  efectividad_pct: number | null
  /** Días entre emitir y cobrar, promedio de lo cobrado en 90 días. El comportamiento observado. */
  dias_cobro_promedio: number | null
  /** Reparo retenido y no liberado. Margen ya ganado y todavía no cobrado. */
  fondo_reparo: number
}

export type EstadoCertificadoCliente =
  | 'emitido' | 'en_revision' | 'aprobado' | 'observado' | 'vencido' | 'cobrado' | 'en_disputa'

export interface CertificadoCliente {
  id: string
  cliente_id: string
  obra_id: string | null
  numero: string
  factura: string | null
  periodo_desde: string | null
  periodo_hasta: string | null
  avance_periodo: number | null
  monto: number
  reparo: number | null
  emitido_at: string | null
  vence: string | null
  estado: EstadoCertificadoCliente
  observacion: string | null
  cobranza_fila: number | null
  detalle_rubros: unknown
}

export type EstadoPagoEsquema = 'cobrado' | 'a_vencer' | 'vencido' | 'previsto' | 'retenido'
export type MedioPagoEsquema = 'transferencia' | 'cheque' | 'efectivo'

export interface PagoEsquema {
  id: string
  cliente_id: string
  obra_id: string | null
  cobranza_fila: number | null
  concepto: string
  fecha: string | null
  monto: number
  reparo: number | null
  estado: EstadoPagoEsquema
  medio: MedioPagoEsquema | null
  visible_portal: boolean
  aviso_dias: number | null
  mostrar_reprogramaciones: boolean
  nota_interna: string | null
  reprogramaciones: unknown
  publicado_at: string | null
  /** Hay ediciones que el cliente todavía no vio. */
  cambio_pendiente: boolean
  orden: number
}

/** El estado de la cola, que vuelve a la pantalla 28/32 para que se vea qué pasó con el pedido. */
export type EstadoCambioCobranza = 'pendiente' | 'procesando' | 'aplicado' | 'rechazado' | 'error'

export interface CambioCobranza {
  id: string
  esquema_pago_id: string | null
  cobranza_fila: number
  campo: 'fecha' | 'monto' | 'medio' | 'estado_cobrado'
  valor_nuevo: string | null
  valor_anterior: string | null
  estado: EstadoCambioCobranza
  motivo: string | null
  pedido_at: string
  aplicado_at: string | null
  /** Lo que se releyó de la celda del Sheet. Vacío = todavía no se escribió. */
  leido_de_vuelta: string | null
}

export interface AccesoPortal {
  id: string
  cliente_id: string
  email: string
  persona_contacto: string | null
  puede_ver_obra: boolean
  puede_ver_montos: boolean
  puede_aprobar: boolean
  /** NULL = todas las obras del cliente. Array vacío = ninguna. No son lo mismo. */
  obras: string[] | null
  habilitado_at: string | null
  invitacion_enviada_at: string | null
  primer_ingreso_at: string | null
  ultimo_ingreso_at: string | null
  ultimo_dispositivo: string | null
  revocado_at: string | null
  /** Se completa en el primer ingreso. Null = todavía no entró nunca. */
  auth_user_id: string | null
}

export type TipoActividadPortal =
  | 'aprobo_certificado' | 'observo_certificado' | 'descargo_factura'
  | 'habilitado' | 'ingreso' | 'consulta' | 'informo_transferencia'

export interface ActividadPortal {
  id: string
  cliente_id: string
  acceso_id: string | null
  tipo: TipoActividadPortal
  referencia: string | null
  detalle: string | null
  monto: number | null
  at: string
}

/** Lo que devuelve toda action de estas pantallas. `error` en castellano y mirable por una persona. */
export type ResultadoAccion = { ok: true; id?: string } | { ok: false; error: string }
