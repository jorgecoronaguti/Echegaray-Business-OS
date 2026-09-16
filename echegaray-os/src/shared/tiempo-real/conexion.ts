// LA CONEXIÓN AL CANAL — cuándo se abre, cuándo se corta y cuándo se vuelve a intentar.
//
// Medido en producción el 15/09/2026: un usuario `campo` entra a pantallas de `(main)` que tiene
// permitidas (pedidos de materiales, herramientas, descargas, mi cuenta). La política de
// `realtime.messages` sólo deja leer `os:cambios` a personal interno, así que el join vuelve con
// `CHANNEL_ERROR: Unauthorized: You do not have permissions to read from this Channel topic`… y
// supabase-js lo reintenta cada ~14 s, para siempre. Cada intento es un chequeo de autorización
// contra una base Small de 2 GB, multiplicado por cada pestaña abierta.
//
// UN RECHAZO NO SE ARREGLA INSISTIENDO: con la misma sesión, la respuesta va a ser la misma. Se cierra
// el canal (`leave` resetea el temporizador de rejoin de phoenix) y no se vuelve a abrir hasta que
// llegue OTRO token: un login distinto, o el refresco horario del JWT —que es también cuando un
// cambio de rol podría haber cambiado la respuesta—. Una vez por hora contra una cada 14 s.
//
// UNA CAÍDA DE RED SÍ SE ARREGLA INSISTIENDO: `TIMED_OUT`, un socket cerrado, un transporte caído
// siguen en manos del reintento de supabase-js, como hasta ahora.
//
// No se decide acá quién PUEDE leer. No hay copia en el navegador de `es_administracion()`: la
// cerradura es la política `os_cambios_leer_autenticados`, y esto sólo deja de golpear la puerta
// cuando ya contestó que no. Puro, sin Supabase ni DOM, como `motor.ts`: se prueba con un canal falso.

export type AlEstado = (estado: string, error?: Error) => void

export interface Apertura {
  cerrar: () => void
}

export interface DependenciasDeConexion {
  /** Abre `os:cambios` y reporta cada estado de `channel.subscribe()`, con su error si lo hay. */
  abrir: (alEstado: AlEstado) => Apertura
  /** A dónde van los estados para que el motor sepa si hubo caída (normalmente `motor.alEstadoDelCanal`). */
  alEstado: (estado: string) => void
}

export interface ConexionAlCanal {
  /** La sesión vigente, identificada por su access token; `null` sin sesión. */
  alCambiarSesion: (token: string | null) => void
  detener: () => void
}

// Lo que el servidor de Realtime contesta cuando la política niega el tópico. supabase-js arma el
// `Error` juntando los valores de la respuesta del join (`reason`), así que el texto llega entero.
const TEXTO_DE_RECHAZO = /unauthorized|permission/i

/** Estado propio (no de supabase-js) que se le pasa al motor cuando el servidor negó el tópico. */
export const ESTADO_RECHAZADO = 'RECHAZADO'

/** ¿El servidor dijo que esta sesión no puede leer el tópico? Un error de transporte no lo es. */
export function esRechazoDeAutorizacion(estado: string, error?: unknown): boolean {
  if (estado !== 'CHANNEL_ERROR' || !(error instanceof Error)) return false
  return TEXTO_DE_RECHAZO.test(error.message)
}

export function crearConexion(dep: DependenciasDeConexion): ConexionAlCanal {
  let apertura: Apertura | null = null
  // Cada apertura tiene su número. Cerrar un canal dispara su `CLOSED` (y un rechazo puede llegar
  // tarde): lo que informa un canal que ya no es el vigente no puede cortar ni ensuciar al nuevo.
  let generacion = 0
  let sesion: string | null | undefined
  let detenida = false

  const cerrar = () => {
    generacion++
    const a = apertura
    apertura = null
    a?.cerrar()
  }

  const abrir = () => {
    const mia = ++generacion
    let rechazadaAlAbrir = false
    const nueva = dep.abrir((estado, error) => {
      if (mia !== generacion) return
      dep.alEstado(estado)
      if (!esRechazoDeAutorizacion(estado, error)) return
      // El motor tiene que saber que esto no es una caída de red: sin canal por falta de permiso, el
      // latido no refresca (sería golpear la base cada 30 s por una pantalla que no es de tiempo real).
      dep.alEstado(ESTADO_RECHAZADO)
      if (apertura) cerrar()
      else rechazadaAlAbrir = true // el rechazo llegó antes de que `abrir` devolviera
    })
    apertura = nueva
    if (rechazadaAlAbrir) cerrar()
  }

  return {
    alCambiarSesion(token) {
      if (detenida || token === sesion) return
      sesion = token
      if (token == null) { cerrar(); return }
      // Con el canal abierto no hay nada que hacer: supabase-js le pasa el token nuevo solo. Sin
      // canal —primera sesión, o la anterior fue rechazada— es el momento de intentar.
      if (!apertura) abrir()
    },
    detener() {
      detenida = true
      cerrar()
    },
  }
}
