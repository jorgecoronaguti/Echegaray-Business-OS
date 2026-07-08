import { z } from 'zod'

// Perfil — rol real del usuario autenticado (PR5). El alta de perfil (asignación de
// rol) se hace manualmente por Jorge en Supabase, no vía signup -- así nadie se
// autoasigna 'direccion'. Ver supabase/migrations/20260708121545_login_roles.sql
export type Rol = 'direccion' | 'administracion' | 'jefe_obra'

export interface Perfil {
  id: string
  rol: Rol
  nombre: string
  created_at: string
  updated_at: string
}

export const ROL_LABEL: Record<Rol, string> = {
  direccion: 'Dirección',
  administracion: 'Administración',
  jefe_obra: 'Jefe de Obra',
}

export const loginInputSchema = z.object({
  email: z.string().trim().email('Email inválido'),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
})
export type LoginInput = z.infer<typeof loginInputSchema>

export const signupInputSchema = z.object({
  email: z.string().trim().email('Email inválido'),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
  nombre: z.string().trim().min(1, 'Indicá tu nombre'),
})
export type SignupInput = z.infer<typeof signupInputSchema>
