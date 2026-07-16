import { z } from 'zod'

// Perfil — rol real del usuario autenticado (PR5). El alta de perfil (asignación de
// rol) se hace manualmente por Jorge en Supabase, no vía signup -- así nadie se
// autoasigna 'direccion'. Ver supabase/migrations/20260708121545_login_roles.sql
export type Rol = 'direccion' | 'administracion' | 'jefe_obra' | 'campo'

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
  campo: 'Campo',
}

// Rutas que el rol 'campo' (operario) PUEDE ver en la web. Todo lo demás (caja, reportes,
// dirección…) queda fuera de su alcance. Se usa en el middleware y en el nav.
export const CAMPO_RUTAS_PERMITIDAS = ['/integraciones/pedidos-materiales', '/integraciones/herramientas', '/integraciones/movimientos', '/campo', '/descargas']
export function esRutaCampoPermitida(pathname: string): boolean {
  return CAMPO_RUTAS_PERMITIDAS.some((r) => pathname === r || pathname.startsWith(r + '/'))
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
