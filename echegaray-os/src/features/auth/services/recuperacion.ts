// LA RECUPERACIÓN DE CONTRASEÑA, EN LO QUE SÍ SE PUEDE PROBAR SIN MANDAR UN CORREO.
//
// El envío del mail lo hace Supabase y no hay forma honesta de verificarlo desde un test: se dispara
// un correo real a una casilla real. Lo que sí decide este archivo —y lo que sí se prueba— son las
// dos cosas que rompen el flujo en silencio si están mal:
//
//   1. LA URL DE VUELTA. `resetPasswordForEmail` la manda tal cual adentro del correo. Si sale con
//      una barra de más, con el path equivocado o apuntando a otro dominio, el enlace del mail lleva
//      a un 404 y la persona se queda afuera del sistema sin entender por qué. Además tiene que
//      coincidir EXACTAMENTE con la lista de Redirect URLs del proyecto de Supabase: cualquier
//      variante que no esté en esa lista Supabase la descarta y redirige al Site URL.
//
//   2. A DÓNDE SE VA DESPUÉS DEL CANJE. El callback acepta un `next` por query, y un `next` que
//      admita `//otrodominio.com` convierte una URL nuestra en un trampolín a cualquier lado — con
//      la sesión recién creada en el bolsillo. El destino se valida acá, no en el handler.

/** La ruta que canjea el `code` del correo por una sesión. Pública: llega sin sesión por definición. */
export const RUTA_CALLBACK = '/callback'

/** Donde se tipea la contraseña nueva, ya con la sesión que dejó el canje. */
export const RUTA_CONTRASENA_NUEVA = '/contrasena-nueva'

/** A dónde vuelve quien no pudo canjear: el enlace de recuperación vence, y decirlo es mejor que un
 *  formulario de contraseña que va a rebotar. */
export const RUTA_RECUPERAR = '/recuperar'

/**
 * La URL que viaja adentro del correo. `base` es la URL pública canónica (`siteUrl()`), sin barra
 * final — y si viene con una, se le saca: `https://app.ecsas.com.ar//callback` no está en la lista
 * de redirects de Supabase y el enlace del mail muere en el Site URL por defecto.
 */
export function urlDeRecuperacion(base: string, destino: string = RUTA_CONTRASENA_NUEVA): string {
  const raiz = base.trim().replace(/\/+$/, '')
  return `${raiz}${RUTA_CALLBACK}?next=${encodeURIComponent(destinoSeguro(destino))}`
}

/**
 * EL DESTINO DESPUÉS DEL CANJE ES SIEMPRE INTERNO.
 *
 * Sólo pasa una ruta de este OS: una sola barra al principio, y nada que un navegador pueda leer
 * como autoridad. `//evil.com` y `/\evil.com` son URLs protocol-relative — el navegador las resuelve
 * como host externo aunque empiecen con barra— y `http://…` es directamente otro sitio. Cualquiera
 * de las tres cae al destino por defecto en vez de rechazarse con un error: quien acaba de canjear
 * un enlace de recuperación tiene que terminar en la pantalla de contraseña, no en un cartel.
 */
export function destinoSeguro(next: string | null | undefined): string {
  if (!next) return RUTA_CONTRASENA_NUEVA
  const limpio = next.trim()
  if (!limpio.startsWith('/')) return RUTA_CONTRASENA_NUEVA
  if (limpio.startsWith('//') || limpio.startsWith('/\\')) return RUTA_CONTRASENA_NUEVA
  return limpio
}
