// INCIDENTE 10/09/2026 — el worker de comunicación quedó COLGADO 23 horas.
//
// Supabase reinició del lado del servidor a las 17:59:07. Una query del tick murió con
// «terminating connection due to administrator command» (SQLSTATE 57P01), el barrido de
// sesiones lo logueó sin propagarlo (así está diseñado), y el `await` siguiente del mismo
// tick NUNCA se resolvió: el socket quedó medio abierto y el pool de `pg` no tenía
// `connectionTimeoutMillis` ni `query_timeout`, así que la promesa no se cumple ni se
// rechaza jamás. El proceso quedó vivo, `systemctl` lo veía `active`, CPU 0, y ni siquiera
// atendió el SIGTERM (el `while` nunca volvió a mirar la bandera de parada: hubo que
// matarlo con SIGKILL). El evento 139 del inbox —comprobantes del dueño— esperó 23 h.
//
// LA REGLA, y es deliberadamente tonta: NO HAY RECONEXIÓN MÁGICA NI REINTENTO INFINITO.
// Ante una conexión perdida el proceso LOGUEA con nivel error y SALE con código ≠ 0;
// systemd lo vuelve a levantar (`Restart=always`, `RestartSec=5`). Morir y renacer es el
// diseño: todo el estado vive en la base, con leases, así que un reinicio no pierde nada.
// Y como ninguna lista de errores es completa, arriba de todo hay un LATIDO: si pasan N
// intervalos sin que se complete un tick, el proceso sale igual — sin saber por qué.
//
// Módulo PURO a propósito: no importa `pg`, no abre sockets, no lee el entorno. Así se
// puede probar el cuelgue con un pool falso, que es la única manera de probarlo sin
// esperar a que Supabase se reinicie de nuevo.

/** Código de salida ante conexión perdida. 75 = EX_TEMPFAIL (sysexits): «fallo temporal,
 *  volvé a intentar». Distinto de 1 (arranque imposible: falta token, falta env) para que
 *  el journal distinga un reinicio por red de un error de configuración. */
export const SALIDA_CONEXION_PERDIDA = 75

/** SQLSTATE que significan «esta conexión ya no existe». No son errores de la consulta:
 *  ninguna cantidad de reintentos sobre el mismo cliente los arregla.
 *   57P01 admin_shutdown · 57P02 crash_shutdown · 57P03 cannot_connect_now
 *   08006 connection_failure · 08003 connection_does_not_exist · 08001/08004 rechazo
 *   53300 too_many_connections — el pooler nos echó; renacer con el pool limpio */
export const SQLSTATE_CONEXION_PERDIDA = new Set([
  '57P01', '57P02', '57P03', '08000', '08001', '08003', '08004', '08006', '08007', '53300',
])

/** `code` de errno de Node sobre el socket. ENOTFOUND/EAI_AGAIN entran porque el resolver
 *  de la VM ya falló antes (ver memoria «DNS de la VM»): sin DNS no hay base. */
export const ERRNO_CONEXION_PERDIDA = new Set([
  'ECONNRESET', 'ECONNREFUSED', 'EPIPE', 'ETIMEDOUT', 'EHOSTUNREACH', 'ENETUNREACH',
  'ENOTFOUND', 'EAI_AGAIN', 'ERR_SOCKET_CLOSED', 'ECONNABORTED',
])

/** Mensajes de `pg` que no traen `code`. Se comparan en minúsculas y por inclusión: son
 *  los literales que emite el driver, no texto del servidor. */
const FRASES_CONEXION_PERDIDA = [
  'terminating connection due to administrator command',
  'connection terminated',                       // Connection terminated unexpectedly / …
  'client has encountered a connection error',
  'timeout exceeded when trying to connect',     // connectionTimeoutMillis
  'query read timeout',                          // query_timeout
  'connection ended unexpectedly',
  'server closed the connection unexpectedly',
  'cannot use a pool after calling end',
  'read econnreset',
  'socket hang up',
]

/** ¿Este error significa que hay que morir y renacer, en vez de reintentar?
 *
 *  PUEDE DECIR NO, y eso es la mitad del valor: un `unique_violation`, un error de sintaxis
 *  o un timeout de negocio NO son conexión perdida. Si esto devolviera true siempre, el
 *  worker se reiniciaría ante cualquier bug y nadie vería el bug. Hay test de las dos caras. */
export function esConexionPerdida(err) {
  if (!err) return false
  const code = String(err.code ?? err.errno ?? '')
  if (SQLSTATE_CONEXION_PERDIDA.has(code)) return true
  if (ERRNO_CONEXION_PERDIDA.has(code)) return true
  const msg = String(err.message ?? err).toLowerCase()
  if (FRASES_CONEXION_PERDIDA.some((f) => msg.includes(f))) return true
  // `pg` anida el error original en .cause / .originalError según el camino.
  for (const hijo of [err.cause, err.originalError, err.previousError]) {
    if (hijo && hijo !== err && esConexionPerdida(hijo)) return true
  }
  return false
}

/** EL LATIDO. No sabe de bases ni de sockets: sabe que alguien tenía que decir «seguí
 *  vivo» cada tanto y dejó de decirlo.
 *
 *  Esta es la red que habría cortado las 23 horas sin conocer la causa: el tick colgado no
 *  lanzó nada que clasificar, simplemente no volvió. La clasificación de arriba acelera el
 *  reinicio cuando el error SÍ llega; el latido lo garantiza cuando no llega nada.
 *
 *  `salir` se inyecta para poder probarlo (en producción es `process.exit`). `periodoMs`
 *  es cada cuánto se mira el reloj, no la tolerancia. */
export function crearLatido({
  toleranciaMs,
  periodoMs = null,
  ahora = () => Date.now(),
  salir,
  log = null,
  nombre = 'proceso',
} = {}) {
  const tol = Number.isFinite(toleranciaMs) && toleranciaMs > 0 ? toleranciaMs : 300_000
  const per = Number.isFinite(periodoMs) && periodoMs > 0 ? periodoMs : Math.max(1_000, Math.round(tol / 4))
  if (typeof salir !== 'function') throw new Error('crearLatido: falta salir()')
  let ultimo = ahora()
  let reloj = null
  let muerto = false

  /** Sale UNA sola vez: el pool puede avisar el mismo corte por varios clientes a la vez,
   *  y dos `process.exit` encimados pierden el log del primero. */
  function morir(motivo, detalle = {}) {
    if (muerto) return false
    muerto = true
    if (reloj) { clearInterval(reloj); reloj = null }
    log?.error?.(`${nombre}: conexión perdida — salgo para que systemd me reinicie`, { motivo, ...detalle })
    salir(SALIDA_CONEXION_PERDIDA)
    return true
  }

  return {
    /** «Completé un ciclo». Se llama DESPUÉS del tick, nunca antes: el latido tiene que
     *  medir trabajo terminado, no trabajo empezado. */
    tocar() { ultimo = ahora() },
    /** Mira el reloj. Devuelve true si mató al proceso. */
    revisar() {
      if (muerto) return true
      const atraso = ahora() - ultimo
      if (atraso < tol) return false
      return morir('latido', { atraso_ms: atraso, tolerancia_ms: tol })
    },
    /** Si el error es de conexión, mata; si no, devuelve false y el caller lo maneja. */
    fatalSiEsConexionPerdida(err, motivo = 'error') {
      if (!esConexionPerdida(err)) return false
      return morir(motivo, { error: String(err?.message ?? err), code: err?.code ?? null })
    },
    /** Arranca el reloj. `unref` a propósito: no mantiene vivo un proceso que ya terminó. */
    armar() {
      if (reloj || muerto) return
      reloj = setInterval(() => { try { this.revisar() } catch { /* el reloj no tira */ } }, per)
      reloj.unref?.()
    },
    desarmar() { if (reloj) { clearInterval(reloj); reloj = null } },
    get muerto() { return muerto },
    get toleranciaMs() { return tol },
    get periodoMs() { return per },
  }
}
