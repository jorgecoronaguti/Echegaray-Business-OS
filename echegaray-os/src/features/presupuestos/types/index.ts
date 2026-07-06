import { z } from 'zod'

// Presupuesto y Partida — representación mínima del presupuesto base de una obra (PRP-003).
// Columnas en snake_case, igual que la tabla en Supabase.
// Ver supabase/migrations/20260706200000_presupuesto_base_obra.sql

export interface Presupuesto {
  id: string
  obra_id: string
  version: number
  estado: 'borrador' | 'aprobado' | 'reemplazado'
  monto_presupuestado: number
  costo_directo_presupuestado: number
  costo_indirecto_presupuestado: number
  margen_esperado: number
  fuente_legacy: string
  fecha_presupuesto: string
  notas: string | null
  created_at: string
  updated_at: string
}

export interface PartidaPresupuesto {
  id: string
  presupuesto_id: string
  codigo: string | null
  descripcion: string
  monto: number
  created_at: string
  updated_at: string
}

// Nota: no se permite elegir 'reemplazado' al crear — es una transición que maneja
// el servicio cuando se aprueba una versión nueva, no una opción del formulario.
export const presupuestoInputSchema = z.object({
  obra_id: z.string().uuid('Obra inválida'),
  estado: z.enum(['borrador', 'aprobado']).default('borrador'),
  monto_presupuestado: z.coerce.number().positive('El monto presupuestado debe ser mayor a 0'),
  costo_directo_presupuestado: z.coerce
    .number()
    .positive('El costo directo presupuestado debe ser mayor a 0'),
  costo_indirecto_presupuestado: z.coerce
    .number()
    .min(0, 'El costo indirecto no puede ser negativo')
    .default(0),
  margen_esperado: z.coerce.number(),
  fuente_legacy: z.string().trim().min(1, 'Indicá de qué archivo o fuente viene'),
  fecha_presupuesto: z.string().min(1, 'La fecha del presupuesto es obligatoria'),
  notas: z.string().trim().min(1).optional(),
})
export type PresupuestoInput = z.infer<typeof presupuestoInputSchema>

export const partidaPresupuestoInputSchema = z.object({
  presupuesto_id: z.string().uuid('Presupuesto inválido'),
  codigo: z.string().trim().min(1).optional(),
  descripcion: z.string().trim().min(1, 'La descripción es obligatoria'),
  monto: z.coerce.number().positive('El monto debe ser mayor a 0'),
})
export type PartidaPresupuestoInput = z.infer<typeof partidaPresupuestoInputSchema>
