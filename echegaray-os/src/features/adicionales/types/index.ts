import { z } from 'zod'

// Adicional — una fila por adicional, con TODO su historial de etapas como columnas
// fecha+monto nullable (no un `estado` enum lineal). Deliberado: el objetivo de esta
// capacidad es poder detectar secuencias FUERA de orden (ej. ejecutado sin cotizar),
// algo que un enum "estado actual" no puede representar (PRP-006).
// Columnas en snake_case, igual que la tabla en Supabase.
// Ver supabase/migrations/20260706201926_adicionales_gestion_integral.sql

export interface Adicional {
  id: string
  obra_id: string

  concepto: string
  origen: string
  detectado_por: string
  fecha_deteccion: string

  fecha_cotizacion: string | null
  monto_cotizado: number | null

  fecha_aprobacion: string | null
  monto_aprobado: number | null

  fecha_ejecucion: string | null

  fecha_facturacion: string | null
  monto_facturado: number | null
  referencia_factura: string | null

  fecha_cobranza: string | null
  monto_cobrado: number | null
  movimiento_caja_id: string | null

  frenado: boolean
  motivo_frenado: string | null

  notas: string | null
  created_at: string
  updated_at: string
}

export const adicionalInputSchema = z.object({
  obra_id: z.string().uuid('Obra inválida'),
  concepto: z.string().trim().min(1, 'El concepto es obligatorio'),
  origen: z.string().trim().min(1, 'Indicá qué originó el adicional'),
  detectado_por: z.string().trim().min(1, 'Indicá quién lo detectó'),
  fecha_deteccion: z.string().min(1, 'La fecha de detección es obligatoria'),
})
export type AdicionalInput = z.infer<typeof adicionalInputSchema>

// Actualización de etapa: todos los campos opcionales (se envían solo los que
// correspondan a la etapa que se está registrando). Las parejas fecha/monto se
// validan también en la base (constraint), esto solo da un mensaje de error claro
// antes de llegar ahí.
export const actualizarAdicionalInputSchema = z
  .object({
    fecha_cotizacion: z.string().trim().min(1).optional(),
    monto_cotizado: z.coerce.number().positive('El monto cotizado debe ser mayor a 0').optional(),
    fecha_aprobacion: z.string().trim().min(1).optional(),
    monto_aprobado: z.coerce.number().positive('El monto aprobado debe ser mayor a 0').optional(),
    fecha_ejecucion: z.string().trim().min(1).optional(),
    fecha_facturacion: z.string().trim().min(1).optional(),
    monto_facturado: z.coerce.number().positive('El monto facturado debe ser mayor a 0').optional(),
    referencia_factura: z.string().trim().min(1).optional(),
    fecha_cobranza: z.string().trim().min(1).optional(),
    monto_cobrado: z.coerce.number().positive('El monto cobrado debe ser mayor a 0').optional(),
    movimiento_caja_id: z.string().uuid('Movimiento inválido').optional(),
    frenado: z.coerce.boolean().optional(),
    motivo_frenado: z.string().trim().min(1).optional(),
    notas: z.string().trim().min(1).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.fecha_cotizacion && !data.monto_cotizado) {
      ctx.addIssue({ code: 'custom', message: 'La cotización requiere un monto', path: ['monto_cotizado'] })
    }
    if (data.fecha_aprobacion && !data.monto_aprobado) {
      ctx.addIssue({ code: 'custom', message: 'La aprobación requiere un monto', path: ['monto_aprobado'] })
    }
    if (data.fecha_facturacion && !data.monto_facturado) {
      ctx.addIssue({ code: 'custom', message: 'La facturación requiere un monto', path: ['monto_facturado'] })
    }
    if (data.fecha_cobranza && !data.monto_cobrado) {
      ctx.addIssue({ code: 'custom', message: 'La cobranza requiere un monto', path: ['monto_cobrado'] })
    }
    if (data.frenado && !data.motivo_frenado) {
      ctx.addIssue({ code: 'custom', message: 'Marcar como frenado requiere un motivo', path: ['motivo_frenado'] })
    }
  })
export type ActualizarAdicionalInput = z.infer<typeof actualizarAdicionalInputSchema>

export type TipoAlertaAdicional =
  | 'ejecutado_sin_cotizar'
  | 'cotizado_pendiente_aprobacion'
  | 'aprobado_pendiente_ejecucion'
  | 'ejecutado_pendiente_facturacion'
  | 'facturado_pendiente_cobranza'
  | 'frenado'
  | 'riesgo_perdida_margen'

export interface AlertaAdicional {
  tipo: TipoAlertaAdicional
  mensaje: string
}

// Última cotización/valuación conocida — lo que hoy se sabe que representa este
// adicional, en cascada desde la etapa más avanzada hacia la más temprana.
export function montoRelevanteParaMargen(a: Adicional): number | null {
  return a.monto_cobrado ?? a.monto_facturado ?? a.monto_aprobado ?? a.monto_cotizado ?? null
}

// Deriva las alertas de decisión de un adicional a partir de sus propias columnas —
// no requiere joins ni un historial de transiciones separado. Cálculo puro en
// TypeScript (no vista SQL): son predicados sobre una sola fila, más simple y fácil
// de leer/testear acá que en SQL (a diferencia de PRP-005, que sí necesitaba agregar
// datos de 3 tablas y por eso usó una vista).
export function calcularAlertasAdicional(a: Adicional): AlertaAdicional[] {
  const alertas: AlertaAdicional[] = []

  if (a.fecha_ejecucion && !a.fecha_cotizacion) {
    alertas.push({ tipo: 'ejecutado_sin_cotizar', mensaje: 'Ejecutado sin cotización registrada' })
  }
  if (a.fecha_cotizacion && !a.fecha_aprobacion) {
    alertas.push({ tipo: 'cotizado_pendiente_aprobacion', mensaje: 'Cotizado, pendiente de aprobación del cliente' })
  }
  if (a.fecha_aprobacion && !a.fecha_ejecucion) {
    alertas.push({ tipo: 'aprobado_pendiente_ejecucion', mensaje: 'Aprobado, pendiente de ejecución' })
  }
  if (a.fecha_ejecucion && !a.fecha_facturacion) {
    alertas.push({ tipo: 'ejecutado_pendiente_facturacion', mensaje: 'Ejecutado, pendiente de facturación' })
  }
  if (a.fecha_facturacion && !a.fecha_cobranza) {
    alertas.push({ tipo: 'facturado_pendiente_cobranza', mensaje: 'Facturado, pendiente de cobranza' })
  }
  if (a.frenado) {
    alertas.push({ tipo: 'frenado', mensaje: a.motivo_frenado ?? 'Marcado como frenado' })
  }

  // Riesgo de pérdida de margen: el monto bajó entre una etapa y la siguiente
  // (ej. el cliente negoció el monto aprobado por debajo del cotizado).
  const montosEnOrden = [a.monto_cotizado, a.monto_aprobado, a.monto_facturado, a.monto_cobrado].filter(
    (m): m is number => m !== null
  )
  for (let i = 1; i < montosEnOrden.length; i++) {
    if (montosEnOrden[i] < montosEnOrden[i - 1]) {
      alertas.push({
        tipo: 'riesgo_perdida_margen',
        mensaje: `El monto bajó de $${montosEnOrden[i - 1]} a $${montosEnOrden[i]} en una etapa posterior`,
      })
      break
    }
  }

  return alertas
}
