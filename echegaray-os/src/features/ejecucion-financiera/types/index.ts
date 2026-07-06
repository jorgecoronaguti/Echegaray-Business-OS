import { z } from 'zod'

// Certificado — avance de obra certificado contra el CONTRATO BASE (obras.monto_contratado).
// Distinto de Adicionales (PRP-006), que tiene su propio ciclo de facturación/cobranza
// separado — nunca se mezclan. Mismo patrón: fecha+monto por etapa, sin imponer orden
// entre ellas, para poder representar (no bloquear) certificados sin facturar, etc.
// Columnas en snake_case, igual que la tabla en Supabase.
// Ver supabase/migrations/20260706202955_ejecucion_financiera_obra.sql

export interface Certificado {
  id: string
  obra_id: string

  numero: string
  descripcion: string | null
  fecha_certificacion: string
  monto_certificado: number

  fecha_facturacion: string | null
  monto_facturado: number | null
  referencia_factura: string | null
  fecha_vencimiento: string | null

  fecha_cobranza: string | null
  monto_cobrado: number | null
  movimiento_caja_id: string | null

  notas: string | null
  created_at: string
  updated_at: string
}

export const certificadoInputSchema = z.object({
  obra_id: z.string().uuid('Obra inválida'),
  numero: z.string().trim().min(1, 'El número de certificado es obligatorio'),
  descripcion: z.string().trim().min(1).optional(),
  fecha_certificacion: z.string().min(1, 'La fecha de certificación es obligatoria'),
  monto_certificado: z.coerce.number().positive('El monto certificado debe ser mayor a 0'),
})
export type CertificadoInput = z.infer<typeof certificadoInputSchema>

// Actualización de etapa: todos los campos opcionales (se envían los que correspondan
// a la etapa que se está registrando). Las parejas fecha/monto también están validadas
// en la base (constraint); esto da un mensaje de error claro antes de llegar ahí.
export const actualizarCertificadoInputSchema = z
  .object({
    fecha_facturacion: z.string().trim().min(1).optional(),
    monto_facturado: z.coerce.number().positive('El monto facturado debe ser mayor a 0').optional(),
    referencia_factura: z.string().trim().min(1).optional(),
    fecha_vencimiento: z.string().trim().min(1).optional(),
    fecha_cobranza: z.string().trim().min(1).optional(),
    monto_cobrado: z.coerce.number().positive('El monto cobrado debe ser mayor a 0').optional(),
    movimiento_caja_id: z.string().uuid('Movimiento inválido').optional(),
    notas: z.string().trim().min(1).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.fecha_facturacion && !data.monto_facturado) {
      ctx.addIssue({ code: 'custom', message: 'La facturación requiere un monto', path: ['monto_facturado'] })
    }
    if (data.fecha_cobranza && !data.monto_cobrado) {
      ctx.addIssue({ code: 'custom', message: 'La cobranza requiere un monto', path: ['monto_cobrado'] })
    }
  })
export type ActualizarCertificadoInput = z.infer<typeof actualizarCertificadoInputSchema>

// Fila de la vista obra_ejecucion_financiera — Contrato vs Certificado vs Facturado
// vs Cobrado, agregado por obra.
export interface ObraEjecucionFinanciera {
  obra_id: string
  obra_nombre: string
  monto_contratado: number
  total_certificado: number
  total_facturado: number
  total_cobrado: number
  pendiente_certificar: number
  pendiente_facturar: number
  pendiente_cobrar: number
  porcentaje_contrato_cobrado: number | null
}

export type TipoAlertaCertificado = 'pendiente_facturacion' | 'pendiente_cobranza' | 'factura_vencida'

export interface AlertaCertificado {
  tipo: TipoAlertaCertificado
  mensaje: string
}

// Alertas por certificado — predicados sobre una sola fila, igual que en adicionales
// (PRP-006): no requieren joins ni agregación, así que se calculan en TypeScript puro.
export function calcularAlertasCertificado(c: Certificado, hoy: Date = new Date()): AlertaCertificado[] {
  const alertas: AlertaCertificado[] = []

  if (!c.fecha_facturacion) {
    alertas.push({ tipo: 'pendiente_facturacion', mensaje: 'Certificado pendiente de facturación' })
    return alertas
  }

  if (!c.fecha_cobranza) {
    // "Factura vencida" solo se puede afirmar si se conoce el vencimiento real de la
    // factura — no se fabrica un plazo estándar (CLAUDE.md raíz: nunca fabricar datos).
    if (c.fecha_vencimiento && new Date(c.fecha_vencimiento) < hoy) {
      alertas.push({ tipo: 'factura_vencida', mensaje: `Factura vencida el ${c.fecha_vencimiento}, pendiente de cobranza` })
    } else {
      alertas.push({ tipo: 'pendiente_cobranza', mensaje: 'Facturado, pendiente de cobranza' })
    }
  }

  return alertas
}

export type TipoAlertaObra = 'certificada_sin_ingreso_caja' | 'baja_conversion_a_caja'

export interface AlertaObraEjecucionFinanciera {
  tipo: TipoAlertaObra
  mensaje: string
}

// Umbral propuesto, no validado todavía con el usuario — decisión de negocio abierta
// (mismo criterio que los umbrales sano/atención/crítico de Control Económico, PRP-005).
export const UMBRAL_BAJA_CONVERSION_PORCENTAJE = 20

export function calcularAlertasObraEjecucionFinanciera(r: ObraEjecucionFinanciera): AlertaObraEjecucionFinanciera[] {
  const alertas: AlertaObraEjecucionFinanciera[] = []

  if (r.total_certificado > 0 && r.total_cobrado === 0) {
    alertas.push({ tipo: 'certificada_sin_ingreso_caja', mensaje: 'Hay avance certificado pero todavía no ingresó dinero a caja' })
  }

  if (
    r.total_certificado > 0 &&
    r.porcentaje_contrato_cobrado !== null &&
    r.porcentaje_contrato_cobrado < UMBRAL_BAJA_CONVERSION_PORCENTAJE
  ) {
    alertas.push({
      tipo: 'baja_conversion_a_caja',
      mensaje: `Solo el ${r.porcentaje_contrato_cobrado}% del contrato ingresó a caja`,
    })
  }

  return alertas
}
