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
import { permisosDeRol, rolVerificado, ROL_NO_VERIFICADO } from '../lib/xsas-permisos.mjs'

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
export function crearManejadorXsas({ atender, secreto = null, gateway = {}, maxBytes = 256 * 1024, ruta = '/xsas', servicios = undefined } = {}) {
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

    // ═══ LOS PERMISOS LOS DERIVA EL OS, NO LOS DECLARA QUIEN PIDE ═══
    //
    // El cuerpo puede traer `permisos`; se PISAN con los del rol. Dos motivos, y el segundo es el
    // que importa: (1) la tabla rol→capacidad tiene que estar definida UNA vez y del lado del OS,
    // no copiada en TypeScript donde se quedaría vieja; (2) si el emisor pudiera declarar sus
    // permisos, un secreto filtrado no sería «puede leer lo que su rol lee» sino «puede todo».
    //
    // (27/08/2026) Y EL ROL TAMPOCO LO DECLARA QUIEN PIDE, cuando se lo puede verificar. El comentario
    // de arriba era cierto para `permisos` y falso para `rol`: se derivaban los permisos DEL DATO QUE
    // MANDABA EL EMISOR, así que con el secreto en la mano bastaba con escribir `rol: "direccion"`.
    // Ahora, si el actor se identifica contra `public.perfiles`, manda la base.
    const actor = { ...(bruto?.actor ?? {}) }
    const rol = await rolVerificado(gateway, actor, servicios ? { servicios } : {})
    // Un actor identificable que no existe en `perfiles` no es un pedido mal armado: es una cuenta
    // que no está. Decirlo así evita que el error de forma («actor.rol esperaba un string») tape la
    // razón real, que es la que quien pide necesita para arreglarlo.
    actor.rol = rol.rol
    actor.permisos = permisosDeRol(rol.rol)
    const r = await atender({ ...bruto, actor }, gateway)
    // Que lo declarado no coincida con lo real no se calla: es información sobre quien pide.
    if (rol.declarado && rol.declarado !== rol.rol) {
      r.degradacion = [r.degradacion, rol.rol === ROL_NO_VERIFICADO
        ? `el rol declarado («${rol.declarado}») no se pudo verificar (${rol.via}): este pedido corrió SIN permisos`
        : `el rol declarado («${rol.declarado}») no es el que tiene esta cuenta`].filter(Boolean).join(' · ')
      r.estado = 'degradado'
    }
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
