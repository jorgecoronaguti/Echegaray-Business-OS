// QUÉ DEJA PASAR EL PROXY `/api/os/*` HACIA EL MOTOR INTERACTIVO DE LA VM — núcleo puro, con prueba.
//
// Auditoría independiente del 25/09/2026: el proxy era un relé abierto (CORS `*`, cualquier camino,
// sin mirar credenciales) y toda la seguridad dependía del motor. El motor falla cerrado
// (`orquestador/lib/os-auth.mjs`), pero un relé abierto sigue siendo una puerta a internet para lo que
// el motor decida dejar sin llave mañana. Ahora el proxy decide primero, con denegación por defecto:
//
//   · ABIERTAS (sin credencial, a propósito): `/health` (sólo {ok, ready}: la extensión muestra si el
//     OS está vivo), `/version` (un número), `/`, `/index.html` y `/extension.zip` (la descarga de
//     la extensión), `/oauth/start` (el consentimiento de Google no puede traer la llave).
//   · PROTEGIDAS: las que usa la extensión. El proxy exige que venga `Authorization: Bearer …` y el
//     motor la verifica (llave compartida o llave por usuario). Sin cabecera no se sale a la red.
//   · TODO LO DEMÁS: 404 en el proxy. `/oauth/exchange` incluido: lo llama el callback del servidor
//     directo contra el motor, nunca un navegador por acá.
//
// CORS: sólo el origen de la app. La extensión no depende de CORS (su manifiesto declara el dominio
// en `host_permissions`, y Chrome no le aplica CORS a una extensión con permiso de host).

export const RUTAS_ABIERTAS = ['/health', '/version', '/', '/index.html', '/extension.zip', '/oauth/start'] as const

export const RUTAS_PROTEGIDAS = [
  '/ask', '/pending', '/cost', '/progress', '/cancel', '/result', '/operation', '/operation-status',
  '/schedules', '/schedule', '/schedule/toggle',
] as const

export const ORIGENES_PERMITIDOS = ['https://app.ecsas.com.ar', 'https://echegaray-business-os.vercel.app'] as const

export type Decision = { pasa: true } | { pasa: false; status: 401 | 404; error: string }

export function decidirProxy(segmentos: string[], authorization: string | null): Decision {
  const camino = '/' + segmentos.join('/')
  if ((RUTAS_ABIERTAS as readonly string[]).includes(camino)) return { pasa: true }
  if (!(RUTAS_PROTEGIDAS as readonly string[]).includes(camino)) return { pasa: false, status: 404, error: 'ruta desconocida' }
  const bearer = (authorization ?? '').replace(/^Bearer\s+/i, '').trim()
  if (!bearer) return { pasa: false, status: 401, error: 'no autorizado' }
  return { pasa: true }
}

/** El `access-control-allow-origin` que corresponde a este origen, o `null` si no es de la app. */
export function origenPermitido(origen: string | null): string | null {
  return origen && (ORIGENES_PERMITIDOS as readonly string[]).includes(origen) ? origen : null
}
