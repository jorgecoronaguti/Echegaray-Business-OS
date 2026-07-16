import { createClient } from '@supabase/supabase-js'

// Cliente Supabase con SERVICE_ROLE — SOLO servidor (server actions / route handlers).
// NUNCA importar en un componente cliente ni exponer la key. Bypassa RLS: usarlo únicamente
// detrás de un chequeo de rol explícito (ej. solo 'direccion' puede crear operarios).
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}
