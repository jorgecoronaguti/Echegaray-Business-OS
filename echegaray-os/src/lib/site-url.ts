// URL canónica pública del Business OS.
//
// Objetivo de la migración de dominio: https://app.ecsas.com.ar
// Se controla con la variable NEXT_PUBLIC_SITE_URL (visible en cliente y servidor).
// Fallback seguro al dominio actual de Vercel para NO romper nada mientras el DNS de
// app.ecsas.com.ar todavía no está listo. Cuando el dominio esté validado, se define
// NEXT_PUBLIC_SITE_URL=https://app.ecsas.com.ar en Vercel y toda la app apunta ahí sin
// tocar código.

const DOMINIO_ACTUAL_VERCEL = 'https://echegaray-business-os.vercel.app'

function limpiar(u: string): string {
  return u.trim().replace(/\/+$/, '')
}

/** Devuelve la URL base pública, sin barra final. */
export function siteUrl(): string {
  const explicito = process.env.NEXT_PUBLIC_SITE_URL
  if (explicito && explicito.trim()) return limpiar(explicito)
  // VERCEL_URL sólo existe en el servidor (Vercel la inyecta sin protocolo).
  const vercel = process.env.VERCEL_URL
  if (vercel) return limpiar(`https://${vercel}`)
  return DOMINIO_ACTUAL_VERCEL
}
