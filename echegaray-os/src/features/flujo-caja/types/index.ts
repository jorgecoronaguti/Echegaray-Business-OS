import { z } from 'zod'

// Entidad — columnas en snake_case, igual que la tabla en Supabase.
// Ver supabase/migrations/20260706190257_flujo_caja_movimientos.sql

export interface MovimientoCaja {
  id: string
  tipo: 'cobro' | 'pago'
  estado: 'proyectado' | 'real'
  monto: number
  cuenta_financiera_id: string
  fecha_esperada: string
  fecha_real: string | null
  cliente_id: string | null
  proveedor_id: string | null
  obra_id: string | null
  concepto: string
  origen: 'manual' | 'flujo_caja_sheet' | 'control_gastos'
  referencia_externa: string | null
  notas: string | null
  created_at: string
  updated_at: string
}

// Validación de entrada — refleja los mismos CHECK constraints de la migración,
// para dar un mensaje de error claro antes de llegar a la base.
export const movimientoCajaInputSchema = z
  .object({
    tipo: z.enum(['cobro', 'pago']),
    estado: z.enum(['proyectado', 'real']),
    monto: z.coerce.number().positive('El monto debe ser mayor a 0'),
    cuenta_financiera_id: z.string().uuid('Elegí una cuenta financiera'),
    fecha_esperada: z.string().min(1, 'La fecha esperada es obligatoria'),
    fecha_real: z.string().trim().min(1).optional(),
    cliente_id: z.string().uuid().optional(),
    proveedor_id: z.string().uuid().optional(),
    obra_id: z.string().uuid().optional(),
    concepto: z.string().trim().min(1, 'El concepto es obligatorio'),
    origen: z.enum(['manual', 'flujo_caja_sheet', 'control_gastos']).default('manual'),
    referencia_externa: z.string().trim().min(1).optional(),
    notas: z.string().trim().min(1).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.tipo === 'cobro') {
      if (!data.cliente_id) {
        ctx.addIssue({ code: 'custom', message: 'Un cobro requiere un Cliente', path: ['cliente_id'] })
      }
      if (!data.obra_id) {
        ctx.addIssue({ code: 'custom', message: 'Un cobro requiere una Obra', path: ['obra_id'] })
      }
      if (data.proveedor_id) {
        ctx.addIssue({ code: 'custom', message: 'Un cobro no debe tener Proveedor', path: ['proveedor_id'] })
      }
    }
    if (data.tipo === 'pago') {
      if (!data.proveedor_id) {
        ctx.addIssue({ code: 'custom', message: 'Un pago requiere un Proveedor', path: ['proveedor_id'] })
      }
      if (data.cliente_id) {
        ctx.addIssue({ code: 'custom', message: 'Un pago no debe tener Cliente', path: ['cliente_id'] })
      }
    }
    if (data.estado === 'real' && !data.fecha_real) {
      ctx.addIssue({ code: 'custom', message: 'Un movimiento real requiere fecha real', path: ['fecha_real'] })
    }
  })

export type MovimientoCajaInput = z.infer<typeof movimientoCajaInputSchema>
