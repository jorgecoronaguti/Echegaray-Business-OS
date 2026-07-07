import { z } from 'zod'

// Compra — proceso operativo/comercial de abastecimiento de una Obra, con columnas
// fecha+monto por etapa (necesidad, solicitud, cotización, orden, recepción), sin
// imponer orden entre ellas (PRP-009, mismo patrón validado en Adicionales/PRP-006):
// una compra urgente puede saltar solicitud/cotización, y eso debe poder detectarse,
// no bloquearse.
//
// Decisión de arquitectura central: el vínculo con Costos Reales y Caja NO vive acá
// como una FK única (a diferencia de costos_reales.movimiento_caja_id) — una compra
// real puede tener VARIOS costos reales (entregas parciales) y VARIOS pagos (cuotas,
// distintos medios). Por eso la FK vive del lado de "muchos": costos_reales.compra_id
// y movimientos_caja.compra_id. Ver supabase/migrations/20260707115703_compras_abastecimiento_obra.sql
export interface Compra {
  id: string
  obra_id: string | null
  proveedor_id: string | null

  concepto: string
  fecha_necesidad: string

  fecha_solicitud: string | null

  fecha_cotizacion: string | null
  monto_cotizado: number | null

  fecha_orden: string | null
  monto_orden: number | null
  referencia_orden: string | null

  fecha_entrega_prevista: string | null

  fecha_recepcion: string | null
  monto_recibido: number | null

  fuente_legacy: string
  notas: string | null
  created_at: string
  updated_at: string
}

export const compraInputSchema = z.object({
  obra_id: z.string().uuid('Obra inválida').optional(),
  proveedor_id: z.string().uuid('Proveedor inválido').optional(),
  concepto: z.string().trim().min(1, 'El concepto es obligatorio'),
  fecha_necesidad: z.string().min(1, 'La fecha de necesidad es obligatoria'),
  fuente_legacy: z.string().trim().min(1, 'Indicá de qué fuente viene (ej. manual, Control de Gastos)'),
})
export type CompraInput = z.infer<typeof compraInputSchema>

// Actualización de etapa: todos los campos opcionales. Incluye además
// movimiento_caja_id_a_vincular, que no es un campo propio de compras sino una acción
// de vincular un pago existente (actualiza movimientos_caja.compra_id del otro lado).
export const actualizarCompraInputSchema = z
  .object({
    fecha_solicitud: z.string().trim().min(1).optional(),
    fecha_cotizacion: z.string().trim().min(1).optional(),
    monto_cotizado: z.coerce.number().positive('El monto cotizado debe ser mayor a 0').optional(),
    fecha_orden: z.string().trim().min(1).optional(),
    monto_orden: z.coerce.number().positive('El monto de la orden debe ser mayor a 0').optional(),
    referencia_orden: z.string().trim().min(1).optional(),
    fecha_entrega_prevista: z.string().trim().min(1).optional(),
    fecha_recepcion: z.string().trim().min(1).optional(),
    monto_recibido: z.coerce.number().positive('El monto recibido debe ser mayor a 0').optional(),
    notas: z.string().trim().min(1).optional(),
    movimiento_caja_id_a_vincular: z.string().uuid('Movimiento inválido').optional(),
  })
  .superRefine((data, ctx) => {
    if (data.fecha_cotizacion && !data.monto_cotizado) {
      ctx.addIssue({ code: 'custom', message: 'La cotización requiere un monto', path: ['monto_cotizado'] })
    }
    if (data.fecha_orden && !data.monto_orden) {
      ctx.addIssue({ code: 'custom', message: 'La orden requiere un monto', path: ['monto_orden'] })
    }
    if (data.fecha_recepcion && !data.monto_recibido) {
      ctx.addIssue({ code: 'custom', message: 'La recepción requiere un monto', path: ['monto_recibido'] })
    }
  })
export type ActualizarCompraInput = z.infer<typeof actualizarCompraInputSchema>

// Fila de la vista compra_resumen — agrega los costos_reales y movimientos_caja
// vinculados a esta compra (1 compra -> N costos, 1 compra -> N pagos).
export interface CompraResumen {
  compra_id: string
  obra_id: string | null
  proveedor_id: string | null
  concepto: string
  fecha_necesidad: string
  fecha_solicitud: string | null
  fecha_cotizacion: string | null
  monto_cotizado: number | null
  fecha_orden: string | null
  monto_orden: number | null
  fecha_entrega_prevista: string | null
  fecha_recepcion: string | null
  monto_recibido: number | null
  costo_real_acumulado: number
  monto_pagado: number
  cantidad_pagos: number
}

export type EstadoOperativoCompra = 'necesidad' | 'solicitada' | 'cotizada' | 'ordenada' | 'recibida'

// Estado operativo derivado de la última etapa con fecha cargada — no es una columna
// almacenada (evita desincronización), igual que el resto de las capacidades de ciclo.
export function estadoOperativoCompra(c: Compra): EstadoOperativoCompra {
  if (c.fecha_recepcion) return 'recibida'
  if (c.fecha_orden) return 'ordenada'
  if (c.fecha_cotizacion) return 'cotizada'
  if (c.fecha_solicitud) return 'solicitada'
  return 'necesidad'
}

export type TipoAlertaCompra =
  | 'sin_obra'
  | 'sin_proveedor'
  | 'pendiente_entrega'
  | 'entrega_retrasada'
  | 'recibida_sin_costo_real'
  | 'costo_sin_pago_trazable'
  | 'pagada_no_recibida'

export interface AlertaCompra {
  tipo: TipoAlertaCompra
  mensaje: string
}

// Alertas por compra — predicados sobre una fila + su resumen agregado (sin necesitar
// una vista adicional): mismo criterio que Adicionales (PRP-006), cálculo en
// TypeScript puro, auditable y ajustable sin migración.
export function calcularAlertasCompra(compra: Compra, resumen: CompraResumen, hoy: Date = new Date()): AlertaCompra[] {
  const alertas: AlertaCompra[] = []

  if (!compra.obra_id) alertas.push({ tipo: 'sin_obra', mensaje: 'Compra sin Obra asociada' })
  if (!compra.proveedor_id) alertas.push({ tipo: 'sin_proveedor', mensaje: 'Compra sin Proveedor asociado' })

  if (compra.fecha_orden && !compra.fecha_recepcion) {
    if (compra.fecha_entrega_prevista && new Date(compra.fecha_entrega_prevista) < hoy) {
      alertas.push({
        tipo: 'entrega_retrasada',
        mensaje: `Entrega prevista para el ${compra.fecha_entrega_prevista}, todavía no recibida`,
      })
    } else {
      alertas.push({ tipo: 'pendiente_entrega', mensaje: 'Ordenada, pendiente de entrega' })
    }
  }

  if (compra.fecha_recepcion && resumen.costo_real_acumulado === 0) {
    alertas.push({ tipo: 'recibida_sin_costo_real', mensaje: 'Recibida sin costo real asociado todavía' })
  }

  if (resumen.costo_real_acumulado > 0 && resumen.monto_pagado === 0) {
    alertas.push({ tipo: 'costo_sin_pago_trazable', mensaje: 'Tiene costo real pero ningún pago trazable todavía' })
  }

  if (resumen.monto_pagado > 0 && !compra.fecha_recepcion) {
    alertas.push({ tipo: 'pagada_no_recibida', mensaje: 'Tiene pagos registrados pero no consta recepción' })
  }

  return alertas
}

export type TipoAlertaObraCompras = 'concentracion_urgentes' | 'proveedor_retrasos_recurrentes'

export interface AlertaObraCompras {
  tipo: TipoAlertaObraCompras
  mensaje: string
  proveedorId?: string
}

// Umbrales propuestos, no validados con el usuario todavía — mismo criterio abierto
// que el resto de las capacidades (Control Económico, HH).
export const UMBRAL_DIAS_COMPRA_URGENTE = 2
export const UMBRAL_CANTIDAD_URGENTES = 3
export const MINIMO_COMPRAS_PROVEEDOR_PARA_ANALISIS = 3

function diasEntre(a: string, b: string): number {
  return (new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60 * 24)
}

// Alertas a nivel de la lista de compras de una obra (no de una compra individual).
// "Proveedor con retrasos recurrentes" se analiza solo dentro de esta obra — un
// análisis cruzado entre obras pertenece al futuro Dashboard consolidado, no a esta
// capacidad (regla explícita: no construir Dashboard global todavía).
export function calcularAlertasObraCompras(compras: Compra[]): AlertaObraCompras[] {
  const alertas: AlertaObraCompras[] = []

  const urgentes = compras.filter(
    (c) => c.fecha_orden && diasEntre(c.fecha_necesidad, c.fecha_orden) <= UMBRAL_DIAS_COMPRA_URGENTE
  )
  if (urgentes.length >= UMBRAL_CANTIDAD_URGENTES) {
    alertas.push({
      tipo: 'concentracion_urgentes',
      mensaje: `${urgentes.length} compras urgentes (orden a ${UMBRAL_DIAS_COMPRA_URGENTE} días o menos de la necesidad)`,
    })
  }

  const porProveedor = new Map<string, Compra[]>()
  for (const c of compras) {
    if (!c.proveedor_id) continue
    const lista = porProveedor.get(c.proveedor_id) ?? []
    lista.push(c)
    porProveedor.set(c.proveedor_id, lista)
  }
  for (const [proveedorId, comprasDelProveedor] of porProveedor) {
    if (comprasDelProveedor.length < MINIMO_COMPRAS_PROVEEDOR_PARA_ANALISIS) continue
    const conRetraso = comprasDelProveedor.filter(
      (c) => c.fecha_entrega_prevista && c.fecha_recepcion && c.fecha_recepcion > c.fecha_entrega_prevista
    )
    if (conRetraso.length / comprasDelProveedor.length > 0.5) {
      alertas.push({
        tipo: 'proveedor_retrasos_recurrentes',
        mensaje: `${conRetraso.length} de ${comprasDelProveedor.length} compras con retraso en esta obra`,
        proveedorId,
      })
    }
  }

  return alertas
}
