// SESIÓN CON FIRMA VÁLIDA Y SIN ROL LEGIBLE — qué hace el portero (01/10/2026).
//
// El dueño: «se me cayó app ecsas no levanta». No estaba caída: su sesión se había cerrado desde otro aparato
// y la PC quedó con el token viejo —la firma sigue siendo válida hasta que vence, una hora—. El portero no
// pudo leerle el rol, `puedeVerRuta(null, …)` dio «no», y el rebote de quien no tiene rol es `/obras`: de
// `/obras` a `/obras`, 300 veces en cinco minutos (ERR_TOO_MANY_REDIRECTS). Sin rol no se rebota a ninguna
// pantalla de adentro: se decide acá, con una pregunta al servidor de Auth que sólo se paga en este caso.

export type SalidaSinRol = 'login' | 'sin_backend' | 'sin_perfil'

/**
 *   la sesión ya no existe en Auth          → al login, con las cookies de sesión borradas
 *   la sesión vive y la lectura dio error   → «la base no responde» (no se echa a nadie por un tropiezo)
 *   la sesión vive y no hay fila de perfil  → 403 que lo dice: la cuenta no tiene nivel asignado
 */
export function salidaSinRol(e: { sesionViva: boolean; errorDePerfil: boolean }): SalidaSinRol {
  if (!e.sesionViva) return 'login'
  return e.errorDePerfil ? 'sin_backend' : 'sin_perfil'
}

/** Las cookies de la sesión de Supabase (`sb-<ref>-auth-token`, entera o en trozos `.0`, `.1`…). */
export function cookiesDeSesion(nombres: readonly string[]): string[] {
  return nombres.filter((n) => /^sb-[a-z0-9]+-auth-token(\.\d+)?$/.test(n))
}
