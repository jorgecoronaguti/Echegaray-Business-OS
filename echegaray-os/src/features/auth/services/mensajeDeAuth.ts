// EL ERROR DE SUPABASE NO SE LE MUESTRA CRUDO A UN PEÓN DE OBRA. «Invalid login credentials» en
// inglés, en una pantalla escrita entera en español, es lo primero que ve quien se equivoca de
// contraseña (auditoría UX 25/08). Acá se traduce lo que Auth devuelve; lo desconocido se dice en
// español sin inventar la causa.
const TABLA: Array<[RegExp, string]> = [
  [/invalid login credentials|invalid_credentials/i, 'Usuario o contraseña incorrectos.'],
  [/email not confirmed/i, 'Tu correo todavía no está confirmado. Pedile a Administración que lo active.'],
  [/too many requests|rate limit/i, 'Demasiados intentos seguidos. Esperá un minuto y volvé a probar.'],
  [/user not found/i, 'No hay una cuenta con ese correo.'],
  [/password should be|password is too short|weak password/i, 'La contraseña es demasiado corta o débil.'],
  [/user already registered|already been registered/i, 'Ya existe una cuenta con ese correo.'],
  [/network|fetch failed|timeout|upstream/i, 'No se pudo hablar con el servidor. Probá de nuevo en un momento.'],
]

export function mensajeDeAuth(mensaje: string | null | undefined): string {
  const m = (mensaje ?? '').trim()
  for (const [patron, texto] of TABLA) if (patron.test(m)) return texto
  return m ? `No se pudo completar: ${m}` : 'No se pudo completar. Probá de nuevo.'
}
