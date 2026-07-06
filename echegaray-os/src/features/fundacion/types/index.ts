import { z } from 'zod'

// Entidades — columnas en snake_case, igual que la tabla en Supabase.
// Ver supabase/migrations/20260706161253_fundacion.sql

export interface Cliente {
  id: string
  nombre: string
  created_at: string
  updated_at: string
}

export interface Obra {
  id: string
  cliente_id: string
  nombre: string
  estado: 'activa' | 'pausada' | 'cerrada'
  created_at: string
  updated_at: string
}

export interface CuentaFinanciera {
  id: string
  nombre: string
  tipo: 'banco' | 'caja'
  saldo_inicial: number
  created_at: string
  updated_at: string
}

export interface Proveedor {
  id: string
  nombre: string
  created_at: string
  updated_at: string
}

// Validación de entrada (echegaray-os/CLAUDE.md: "Validar toda entrada de usuario con Zod")

export const clienteInputSchema = z.object({
  nombre: z.string().trim().min(1, 'El nombre es obligatorio'),
})
export type ClienteInput = z.infer<typeof clienteInputSchema>

export const obraInputSchema = z.object({
  cliente_id: z.string().uuid('Elegí un cliente'),
  nombre: z.string().trim().min(1, 'El nombre es obligatorio'),
  estado: z.enum(['activa', 'pausada', 'cerrada']).default('activa'),
})
export type ObraInput = z.infer<typeof obraInputSchema>

export const cuentaFinancieraInputSchema = z.object({
  nombre: z.string().trim().min(1, 'El nombre es obligatorio'),
  tipo: z.enum(['banco', 'caja']),
  saldo_inicial: z.coerce.number().finite('El saldo inicial debe ser un número').default(0),
})
export type CuentaFinancieraInput = z.infer<typeof cuentaFinancieraInputSchema>

export const proveedorInputSchema = z.object({
  nombre: z.string().trim().min(1, 'El nombre es obligatorio'),
})
export type ProveedorInput = z.infer<typeof proveedorInputSchema>
