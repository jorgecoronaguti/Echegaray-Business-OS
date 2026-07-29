// PR-3 · Puerto de Adapter de Plataforma.
//
// Este es el CONTRATO que toda plataforma de comunicación debe cumplir para
// enchufarse al Communication Service. Mattermost es el primer adapter; mañana
// puede haber uno de WhatsApp, Telegram, email o lo que sea, sin tocar el
// servicio ni el contrato de eventos.
//
// Un adapter traduce en DOS direcciones y NADA MÁS:
//   - saliente:  evento canónico  →  llamada concreta a la plataforma
//   - entrante:  payload de la plataforma  →  evento canónico
//
// Regla dura: el adapter NO tiene lógica de negocio. No decide, no consulta
// Supabase, no razona. Sólo mapea. Si aparece una decisión, va en otro lado.

/**
 * @typedef {object} ResultadoPublicacion
 * @property {boolean} ok
 * @property {string} [platform_ref]  id del mensaje/objeto creado en la plataforma
 * @property {string} [error]
 * @property {boolean} [reintentable]  si el error admite reintento (5xx/timeout) vs. permanente (4xx)
 */

/**
 * Interfaz que documenta lo que un adapter concreto debe exponer. En JS no hay
 * interfaces reales; esta clase sirve de contrato ejecutable: un adapter puede
 * extenderla (hereda los "not implemented") o simplemente cumplir la forma.
 * `verificarAdapter()` comprueba la forma en tiempo de arranque.
 */
export class PuertoAdapter {
  /** Nombre corto y estable de la plataforma. Ej: 'mattermost'. */
  get plataforma() {
    throw new Error('adapter: falta getter plataforma')
  }

  /** Tipos canónicos SALIENTES que este adapter sabe publicar. El servicio no le
   *  manda un tipo que el adapter no declaró soportar. */
  get tiposSalientesSoportados() {
    return []
  }

  /**
   * Publica un evento canónico saliente en la plataforma.
   * @param {object} _evento  evento canónico (dirección saliente)
   * @returns {Promise<ResultadoPublicacion>}
   */
  async publicar(_evento) {
    throw new Error(`${this.plataforma}: publicar() no implementado`)
  }

  /**
   * Convierte un payload crudo entrante de la plataforma (webhook / outgoing
   * hook / slash command / evento de websocket) en un evento canónico, o null
   * si ese payload no corresponde traducir (ej. eco de un mensaje propio).
   *
   * PUEDE ser async: el servicio hace `await adapter.aCanonico(...)`, así un
   * adapter futuro (Email/IMAP, WhatsApp con descarga de media) que necesite
   * normalización asíncrona encaja sin romper el contrato.
   * @param {object} _payload
   * @returns {object|null|Promise<object|null>}  evento canónico entrante o null
   */
  aCanonico(_payload) {
    throw new Error(`${this.plataforma}: aCanonico() no implementado`)
  }
}

/** Verifica en arranque que un objeto cumple la forma de PuertoAdapter. Falla
 *  ruidosa y temprana antes que un método faltante explote en producción. */
export function verificarAdapter(adapter) {
  const faltan = []
  if (!adapter || typeof adapter !== 'object') return { ok: false, error: 'adapter no es objeto' }
  if (typeof adapter.plataforma !== 'string' || !adapter.plataforma) faltan.push('plataforma')
  if (!Array.isArray(adapter.tiposSalientesSoportados)) faltan.push('tiposSalientesSoportados')
  if (typeof adapter.publicar !== 'function') faltan.push('publicar()')
  if (typeof adapter.aCanonico !== 'function') faltan.push('aCanonico()')
  return faltan.length ? { ok: false, error: `adapter incompleto: ${faltan.join(', ')}` } : { ok: true }
}
