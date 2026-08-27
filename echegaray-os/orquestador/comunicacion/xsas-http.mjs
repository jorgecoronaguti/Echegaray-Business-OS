// EL BORDE HTTP DE LA PUERTA DE XSAS — transporte y nada más.
//
// ═══ QUÉ TRAE Y QUÉ NO ═══
//
// Traduce un pedido HTTP al contrato de `xsas-pedido.mjs` y devuelve la respuesta común tal cual.
// No decide nada: el ruteo, los permisos y la degradación son del gateway. Está separado del
// servidor de sockets a propósito — un manejador puro `(method, headers, rawBody) → {status, body}`
// se prueba sin levantar un puerto, y ésa es la diferencia entre un borde que se ejercita en cada
// corrida y uno que se ejercita el día que falla.
//
// ═══ LA CADENA DE CONFIANZA, QUE ES LO ÚNICO DELICADO ACÁ ═══
//
// El cuerpo trae `actor`, `permisos` y `entidad`. Nada de eso se puede creer por venir en un POST:
// lo que lo hace creíble es QUIÉN lo mandó. El secreto compartido prueba que el emisor es el
// servidor de app.ecsas (que ya comprobó la sesión contra Supabase CON la RLS del usuario) o un
// proceso del propio OS — nunca un navegador, que no lo tiene.
//
// Por eso: SIN SECRETO NO ATIENDE. No hay modo dev que lo relaje. Un borde que se abre "para
// probar" es un borde abierto.
import { igualEnTiempoConstante } from './secreto-compartido.mjs'

const NO_ENCONTRADO = { status: 404, body: { error: 'not_found' } }

/** El secreto que viaja en el header. Nunca en la query: esta URL la puede loguear un proxy. */
function secretoDelHeader(headers = {}) {
  const v = headers['x-xsas-secreto'] ?? headers['X-XSAS-Secreto']
  return typeof v === 'string' && v.length ? v : null
}

/**
 * @param {object} deps
 * @param {(bruto:object, deps:object)=>Promise<object>} deps.atender  el gateway
 * @param {string|null} deps.secreto   `XSAS_GATEWAY_SECRET`. Sin él, todo pedido se rechaza.
 * @param {object} [deps.gateway]      deps que se le pasan al gateway (query, google, logger)
 * @param {number} [deps.maxBytes]
 * @returns {(req:{method:string, url:string, headers:object, rawBody:string}) => Promise<{status:number, body:object}>}
 */
export function crearManejadorXsas({ atender, secreto = null, gateway = {}, maxBytes = 256 * 1024, ruta = '/xsas' } = {}) {
  return async function manejar({ method, url, headers = {}, rawBody = '' } = {}) {
    const camino = String(url ?? '').split('?')[0]
    if (camino !== ruta) return NO_ENCONTRADO
    if (method !== 'POST') return { status: 405, body: { error: 'method_not_allowed' } }
    // FAIL-CLOSED. Un servidor sin secreto configurado no atiende: es preferible un 503 ruidoso a
    // una puerta abierta que nadie nota hasta que alguien la usa.
    if (!secreto) return { status: 503, body: { error: 'xsas: falta XSAS_GATEWAY_SECRET (fail-closed)' } }
    if (!igualEnTiempoConstante(secretoDelHeader(headers), secreto)) {
      return { status: 401, body: { error: 'no autorizado' } }
    }
    if (Buffer.byteLength(rawBody ?? '') > maxBytes) return { status: 413, body: { error: 'too_large' } }

    let bruto
    try {
      bruto = JSON.parse(rawBody || '{}')
    } catch {
      return { status: 400, body: { error: 'json inválido' } }
    }

    const r = await atender(bruto, gateway)
    // El código HTTP sigue al ESTADO, no al `ok`: una respuesta degradada es 200 con su motivo
    // adentro —el consumidor tiene que verla, no reintentarla—, y un pedido mal armado es 400
    // porque reintentarlo igual no lo va a arreglar.
    if (r.ok) return { status: 200, body: r }
    const status = r.error?.tipo === 'pedido_invalido' ? 400
      : r.error?.tipo === 'sin_permiso' ? 403
        : r.error?.tipo === 'capacidad_desconocida' ? 404
          : 500
    return { status, body: r }
  }
}
