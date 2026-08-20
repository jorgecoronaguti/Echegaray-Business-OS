// QUIÉN PUEDE HABLARLE AL OS — la decisión, separada del servidor para poder probarla.
//
// ═══ POR QUÉ SE SACÓ DE `interactive-server.mjs` (18/08/2026) ═══
//
// El portón estaba escrito así:
//
//     if (TOKEN && bearer === TOKEN) authEmail = null
//     else if (bearer) { ...buscar la llave del usuario... }
//     else if (TOKEN) return 401        // ← acá
//
// Leído de abajo hacia arriba: **sin `Authorization` y sin `TOKEN` configurado, no hay 401**. La
// petición seguía de largo hacia las rutas protegidas con `authEmail = null`, que es exactamente la
// identidad del dueño. O sea: el OS quedaba abierto a internet —vía el proxy público
// `/api/os/*`— por una variable de entorno vacía, y nada lo gritaba.
//
// Hoy no está pasando: probado contra `app.ecsas.com.ar` el 18/08/2026, las seis rutas devuelven
// 401 sin credencial, incluida `/ask`. Pero un control que depende de que alguien se acuerde de
// setear una variable no es un control: es una costumbre. Un OS sin llave configurada no atiende.
//
// LA REGLA: **falla cerrado**. Si falta la llave, se rechaza todo — no se abre todo.

/** Rutas que se atienden sin credencial, a propósito y por una razón cada una. */
export const RUTAS_ABIERTAS = [
  '/version',          // un número, para que la extensión sepa si está vieja
  '/oauth/start',      // el consentimiento de Google no puede traer la llave del OS
  '/oauth/exchange',   // el retorno del callback de Vercel, con un code de un solo uso
  '/',                 // la página de descarga
  '/index.html',
  '/extension.zip',
]

export function esRutaAbierta(url = '') {
  const camino = String(url).split('?')[0]
  return RUTAS_ABIERTAS.includes(camino) || camino.startsWith('/oauth/')
}

/**
 * Decide si una petición entra.
 *
 * @param {object} p
 * @param {string} p.token        la llave compartida configurada (ORQ_INTERACTIVE_TOKEN)
 * @param {string} p.authorization el header tal cual vino
 * @param {(llave:string)=>Promise<string|null>} p.buscarUsuario  llave por usuario → email, o null
 * @returns {Promise<{ok:boolean, status?:number, error?:string, email:string|null, quien:string}>}
 */
export async function decidirAcceso({ token, authorization, buscarUsuario }) {
  const bearer = String(authorization || '').replace(/^Bearer\s+/i, '').trim()

  // SIN LLAVE CONFIGURADA NO SE ATIENDE. Es lo primero, antes de mirar qué trajo el que llama:
  // si esto estuviera después, un pedido sin credencial contra un OS sin llave volvería a pasar.
  if (!token) {
    return { ok: false, status: 503, error: 'el OS no tiene llave configurada: no atiende rutas protegidas', email: null, quien: 'nadie' }
  }
  if (!bearer) return { ok: false, status: 401, error: 'no autorizado', email: null, quien: 'nadie' }
  if (bearer === token) return { ok: true, email: null, quien: 'llave compartida' }

  let email = null
  try {
    email = await buscarUsuario(bearer)
  } catch {
    // Si la base no contesta, no se asume que la llave es buena. Falla cerrado también acá.
    return { ok: false, status: 401, error: 'no autorizado', email: null, quien: 'nadie' }
  }
  if (!email) return { ok: false, status: 401, error: 'no autorizado', email: null, quien: 'nadie' }
  return { ok: true, email, quien: 'llave de usuario' }
}
