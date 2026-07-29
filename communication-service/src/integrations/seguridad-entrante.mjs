// PR-3 · Seguridad del borde entrante (M7).
//
// Reemplaza al "token simple" como única protección de los webhooks entrantes.
// Verifica, sobre el CUERPO BRUTO (no el objeto ya parseado):
//   - firma HMAC-SHA256 de `${timestamp}.${rawBody}` con un secreto compartido;
//   - timestamp dentro de una ventana (anti-mensajes viejos);
//   - anti-replay: una firma vista dentro de la ventana no se acepta dos veces;
//   - comparación en tiempo constante (timingSafeEqual);
//   - allowlist de IP/red configurable;
//   - fail-closed por defecto: sin secreto y sin modo dev explícito, se rechaza.
// Nunca loguea el secreto ni la firma completa. Devuelve un motivo ESTRUCTURADO
// para que el servicio lo audite (no cuenta-y-descarta en silencio).

import { createHmac, timingSafeEqual } from 'node:crypto'

export const MOTIVO = Object.freeze({
  OK: 'ok',
  SECRETO_FALTANTE: 'secreto_faltante',
  FIRMA_FALTANTE: 'firma_faltante',
  FIRMA_INVALIDA: 'firma_invalida',
  TIMESTAMP_VENCIDO: 'timestamp_vencido',
  REPLAY: 'replay',
  IP_NO_PERMITIDA: 'ip_no_permitida',
})

export class VerificadorEntrante {
  /**
   * @param {object} cfg
   * @param {string} [cfg.secreto]           secreto compartido del webhook (HMAC)
   * @param {number} [cfg.ventanaSegundos]   ventana anti-replay / anti-viejo (default 300)
   * @param {string[]} [cfg.allowlist]       IPs exactas o prefijos ("10.0." ) permitidos; vacío = no filtra
   * @param {boolean} [cfg.modoDev]          si true y NO hay secreto, permite (desarrollo local explícito)
   * @param {() => number} [cfg.ahora]       reloj inyectable (epoch ms)
   */
  constructor(cfg = {}) {
    this.secreto = cfg.secreto ?? null
    this.ventanaMs = (cfg.ventanaSegundos ?? 300) * 1000
    this.allowlist = cfg.allowlist ?? []
    this.modoDev = cfg.modoDev === true
    this.ahora = cfg.ahora ?? (() => Date.now())
    this._vistos = new Map() // firma → epoch ms de expiración (anti-replay)
  }

  /**
   * Verifica un request entrante.
   * @param {{rawBody?:string, firma?:string, timestamp?:number|string, ip?:string}} req
   * @returns {{ok:boolean, motivo:string}}
   */
  verificar(req = {}) {
    // Fail-closed: sin secreto, sólo pasa si el modo dev es EXPLÍCITO.
    if (!this.secreto) {
      return this.modoDev ? { ok: true, motivo: 'dev' } : { ok: false, motivo: MOTIVO.SECRETO_FALTANTE }
    }
    // 1) Allowlist de IP/red.
    if (this.allowlist.length && !this._ipPermitida(req.ip)) {
      return { ok: false, motivo: MOTIVO.IP_NO_PERMITIDA }
    }
    // 2) Timestamp dentro de la ventana.
    const ts = Number(req.timestamp)
    if (!Number.isFinite(ts) || Math.abs(this.ahora() - ts) > this.ventanaMs) {
      return { ok: false, motivo: MOTIVO.TIMESTAMP_VENCIDO }
    }
    // 3) Firma presente.
    if (!req.firma) return { ok: false, motivo: MOTIVO.FIRMA_FALTANTE }
    // 4) HMAC del cuerpo BRUTO, comparado en tiempo constante (cubre body alterado).
    const esperado = createHmac('sha256', this.secreto).update(`${ts}.${req.rawBody ?? ''}`).digest('hex')
    if (!igualdadSegura(esperado, String(req.firma))) {
      return { ok: false, motivo: MOTIVO.FIRMA_INVALIDA }
    }
    // 5) Anti-replay: una firma válida no se acepta dos veces dentro de la ventana.
    this._purgar()
    if (this._vistos.has(req.firma)) return { ok: false, motivo: MOTIVO.REPLAY }
    this._vistos.set(req.firma, this.ahora() + this.ventanaMs)
    return { ok: true, motivo: MOTIVO.OK }
  }

  _ipPermitida(ip) {
    if (!ip) return false
    return this.allowlist.some((a) => ip === a || (a.endsWith('.') && ip.startsWith(a)))
  }

  _purgar() {
    const t = this.ahora()
    for (const [firma, exp] of this._vistos) if (exp <= t) this._vistos.delete(firma)
  }
}

/** Comparación en tiempo constante. Distinta longitud ⇒ false sin filtrar por dónde difiere. */
function igualdadSegura(a, b) {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}

/** Helper para el emisor / los tests: firma un cuerpo como lo haría el webhook. */
export function firmar(secreto, rawBody, timestamp) {
  return createHmac('sha256', secreto).update(`${timestamp}.${rawBody}`).digest('hex')
}
