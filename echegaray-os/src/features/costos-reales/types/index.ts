import { z } from 'zod'

// Costo Real — costo devengado/comprometido contra una Obra, independiente de si ya
// impactó caja (PRP-004). Columnas en snake_case, igual que la tabla en Supabase.
// Ver supabase/migrations/20260706195537_costos_reales_obra.sql

export interface CostoReal {
  id: string
  obra_id: string
  proveedor_id: string | null
  concepto: string
  monto: number
  fecha: string
  estado: 'comprometido' | 'pendiente' | 'pagado'
  movimiento_caja_id: string | null
  fuente_legacy: string
  notas: string | null
  created_at: string
  updated_at: string
}

// Nota: movimiento_caja_id, si se indica, debe referenciar un movimiento de tipo
// 'pago' — lo valida un trigger en la base (un CHECK no puede mirar otra tabla).
export const costoRealInputSchema = z.object({
  obra_id: z.string().uuid('Obra inválida'),
  proveedor_id: z.string().uuid('Proveedor inválido').optional(),
  concepto: z.string().trim().min(1, 'El concepto es obligatorio'),
  monto: z.coerce.number().positive('El monto debe ser mayor a 0'),
  fecha: z.string().min(1, 'La fecha es obligatoria'),
  estado: z.enum(['comprometido', 'pendiente', 'pagado']).default('pendiente'),
  movimiento_caja_id: z.string().uuid('Movimiento inválido').optional(),
  fuente_legacy: z.string().trim().min(1, 'Indicá de qué archivo o fuente viene'),
  notas: z.string().trim().min(1).optional(),
})
export type CostoRealInput = z.infer<typeof costoRealInputSchema>
