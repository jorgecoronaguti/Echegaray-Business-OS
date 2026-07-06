import { z } from 'zod'

// Obra — unidad económica central del negocio (PRP-002).
// Columnas en snake_case, igual que la tabla en Supabase.
// Ver supabase/migrations/20260706193000_obras_unidad_economica.sql

export interface Obra {
  id: string
  cliente_id: string
  nombre: string
  estado: 'contratada' | 'activa' | 'pausada' | 'cerrada'
  monto_contratado: number
  fecha_inicio: string
  fecha_fin_objetivo: string
  created_at: string
  updated_at: string
}

export const obraInputSchema = z
  .object({
    cliente_id: z.string().uuid('Elegí un cliente'),
    nombre: z.string().trim().min(1, 'El nombre es obligatorio'),
    monto_contratado: z.coerce.number().positive('El monto contratado debe ser mayor a 0'),
    fecha_inicio: z.string().min(1, 'La fecha de inicio es obligatoria'),
    fecha_fin_objetivo: z.string().min(1, 'La fecha objetivo es obligatoria'),
    estado: z.enum(['contratada', 'activa', 'pausada', 'cerrada']).default('contratada'),
  })
  .superRefine((data, ctx) => {
    if (data.fecha_fin_objetivo < data.fecha_inicio) {
      ctx.addIssue({
        code: 'custom',
        message: 'La fecha objetivo debe ser posterior a la fecha de inicio',
        path: ['fecha_fin_objetivo'],
      })
    }
  })

export type ObraInput = z.infer<typeof obraInputSchema>
