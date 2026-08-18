import { createClient } from '@supabase/supabase-js'

// Cliente Supabase con la CLAVE DE SERVICIO — SOLO servidor (server actions / route handlers).
// NUNCA importar en un componente cliente ni exponer la clave. Saltea el RLS: usarlo únicamente
// detrás de un chequeo de rol explícito.
//
// ═══ POR QUÉ ESTO MIRA MÁS DE UN NOMBRE (19/08/2026) ═══
//
// `/administracion/usuarios` daba 500 en producción y las otras doce rutas del MVP abrían. Es la
// única pantalla que necesita esta clave —las cuentas viven en el esquema `auth` y no se pueden
// leer con la sesión de una persona— y leía un nombre fijo: `SUPABASE_SERVICE_ROLE_KEY`.
//
// Ese nombre no es el único que existe. Supabase renombró la clave a `SUPABASE_SECRET_KEY` con las
// claves nuevas (`sb_secret_…`), y la integración de Vercel puede inyectarla con el nombre de la
// tienda por delante (`SUPABASE_<ALGO>_SERVICE_ROLE_KEY`). Un despliegue que la tiene bajo otro
// nombre está, para este código, sin clave — y el síntoma es una pantalla en blanco.
//
// Así que se buscan los nombres conocidos y, si ninguno está, se BARRE el entorno por la forma del
// nombre. Nunca se lee ni se registra un valor.

/** Los nombres conocidos, en orden de preferencia. NINGUNO es `NEXT_PUBLIC_*`: no llegan al navegador. */
const NOMBRES = ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_KEY'] as const

/** La forma de un nombre de clave de servicio, para el caso de la integración con prefijo de tienda. */
const FORMA = /^SUPABASE_[A-Z0-9_]*(SERVICE_ROLE_KEY|SECRET_KEY|SERVICE_KEY)$/

/** Qué nombre está definido en este entorno, o null. Devuelve el NOMBRE, nunca el valor. */
export function nombreDeLaClaveDeServicio(): string | null {
  for (const n of NOMBRES) if (process.env[n]) return n
  return Object.keys(process.env).find((k) => FORMA.test(k) && process.env[k]) ?? null
}

/**
 * QUÉ NOMBRES DE CONFIGURACIÓN EXISTEN EN ESTE ENTORNO — sólo los nombres.
 *
 * Existe para poder decirle a un administrador qué falta en vez de dejarlo frente a una pantalla en
 * blanco. Un nombre de variable no es un secreto; su valor sí, y acá no se lee ninguno. Se acota a
 * las de Supabase para no publicar el inventario entero del despliegue.
 */
export function nombresDeConfiguracionSupabase(): string[] {
  return Object.keys(process.env).filter((k) => k.startsWith('SUPABASE_') || k.startsWith('NEXT_PUBLIC_SUPABASE_')).sort()
}

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const nombre = nombreDeLaClaveDeServicio()
  const key = nombre ? process.env[nombre] : undefined
  if (!url || !key) {
    // El mensaje nombra lo que falta y NO acarrea ningún valor.
    throw new Error(!url
      ? 'falta NEXT_PUBLIC_SUPABASE_URL'
      : `falta la clave de servicio: ninguna de ${NOMBRES.join(' · ')} está definida`)
  }
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}
