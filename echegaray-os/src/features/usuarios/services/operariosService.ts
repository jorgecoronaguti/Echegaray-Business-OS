import type { SupabaseClient } from '@supabase/supabase-js'
import type { Rol } from '@/features/auth/types'

export interface Operario {
  id: string
  nombre: string
  rol: Rol
  email: string | null
  created_at: string | null
}

export type ServiceResult<T> = { data: T; error: null } | { data: null; error: string }

// Lista los usuarios con rol 'campo' (operarios), con su email. Usa el admin client (service
// role) para resolver el email desde auth.users. Solo se llama detrás del gate de dirección.
export async function listarOperarios(admin: SupabaseClient): Promise<ServiceResult<Operario[]>> {
  try {
    const { data: perfiles, error } = await admin
      .from('perfiles')
      .select('id, nombre, rol, created_at')
      .eq('rol', 'campo')
      .order('created_at', { ascending: false })
    if (error) return { data: null, error: error.message }

    const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 })
    const emails = new Map<string, string | null>()
    for (const u of list?.users ?? []) emails.set(u.id, u.email ?? null)

    const rows: Operario[] = (perfiles ?? []).map((p) => ({
      id: p.id as string,
      nombre: p.nombre as string,
      rol: p.rol as Rol,
      email: emails.get(p.id as string) ?? null,
      created_at: (p.created_at as string) ?? null,
    }))
    return { data: rows, error: null }
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'Error desconocido' }
  }
}
