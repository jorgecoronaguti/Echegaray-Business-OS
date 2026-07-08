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
  // Vínculo opcional con la compra que este pago liquida (PRP-009). Una misma compra
  // puede tener varios movimientos_caja vinculados (cuotas, pagos parciales) — no hay
  // unique index acá, a diferencia del patrón anterior (costos_reales/adicionales).
  // Solo válido cuando tipo = 'pago' (CHECK en la base).
  compra_id: string | null
  // Medio real con el que se pagó/cobrará (PRP-010). El ciclo emisión→vencimiento→
  // débito de un cheque/echeq ya lo representa `estado` (proyectado/real) — este
  // campo solo clasifica el medio, no duplica ese ciclo con una tabla nueva.
  medio_pago: 'efectivo' | 'transferencia' | 'debito' | 'tarjeta' | 'cheque' | 'echeq' | 'otro' | null
  referencia_instrumento: string | null
  // Solo para tipo='pago' sin proveedor_id: gasto interno recurrente sin contraparte
  // comercial (nómina, cargas sociales, impuestos). Ver migración
  // relajar_contraparte_movimientos_caja (F1) — antes el esquema exigía proveedor_id
  // en todo pago, lo que impedía cargar nómina real sin fabricar un proveedor ficticio.
  categoria_pago: 'nomina' | 'cargas_sociales' | 'impuestos' | null
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
    compra_id: z.string().uuid('Compra inválida').optional(),
    medio_pago: z.enum(['efectivo', 'transferencia', 'debito', 'tarjeta', 'cheque', 'echeq', 'otro']).optional(),
    referencia_instrumento: z.string().trim().min(1).optional(),
    categoria_pago: z.enum(['nomina', 'cargas_sociales', 'impuestos']).optional(),
    notas: z.string().trim().min(1).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.tipo === 'cobro') {
      if (!data.cliente_id) {
        ctx.addIssue({ code: 'custom', message: 'Un cobro requiere un Cliente', path: ['cliente_id'] })
      }
      if (data.proveedor_id) {
        ctx.addIssue({ code: 'custom', message: 'Un cobro no debe tener Proveedor', path: ['proveedor_id'] })
      }
      if (data.categoria_pago) {
        ctx.addIssue({ code: 'custom', message: 'Un cobro no lleva categoría de pago', path: ['categoria_pago'] })
      }
    }
    if (data.tipo === 'pago') {
      // Un pago con categoria_pago (nómina/cargas sociales/impuestos) es un gasto
      // interno sin proveedor comercial — no lo exigimos en ese caso (migración
      // relajar_contraparte_movimientos_caja, F1).
      if (!data.proveedor_id && !data.categoria_pago) {
        ctx.addIssue({
          code: 'custom',
          message: 'Un pago requiere un Proveedor, o una categoría de gasto interno (nómina/cargas sociales/impuestos)',
          path: ['proveedor_id'],
        })
      }
      if (data.proveedor_id && data.categoria_pago) {
        ctx.addIssue({
          code: 'custom',
          message: 'Un pago no puede tener Proveedor y categoría de gasto interno a la vez',
          path: ['categoria_pago'],
        })
      }
      if (data.cliente_id) {
        ctx.addIssue({ code: 'custom', message: 'Un pago no debe tener Cliente', path: ['cliente_id'] })
      }
    }
    if (data.estado === 'real' && !data.fecha_real) {
      ctx.addIssue({ code: 'custom', message: 'Un movimiento real requiere fecha real', path: ['fecha_real'] })
    }
    if (data.compra_id && data.tipo !== 'pago') {
      ctx.addIssue({ code: 'custom', message: 'Solo un pago puede vincularse a una compra', path: ['compra_id'] })
    }
  })

export type MovimientoCajaInput = z.infer<typeof movimientoCajaInputSchema>
