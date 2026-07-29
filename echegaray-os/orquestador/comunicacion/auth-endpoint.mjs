// PR-4.1 (activación) · Autenticación de la CAPA HTTP del endpoint.
//
// Encapsula TODA la lógica de autenticación del borde entrante, SIN tocar el
// Communication Service, el contrato canónico ni Ports & Adapters. Reutiliza el
// VerificadorEntrante de PR-3 COMO LIBRERÍA (no lo modifica) para el camino HMAC,
// y agrega el camino token nativo de Mattermost. Regla:
//   - HMAC válida            → aceptar
//   - token de Mattermost OK → aceptar
//   - cualquier otro caso    → rechazar (fail-closed)
//
// Cuando se usa este autenticador, el Communication Service se construye SIN
// verificador (la auth NO vive en el comm-service): así la diferencia HMAC/token
// no se propaga al resto del sistema — queda contenida acá.

import { timingSafeEqual } from 'node:crypto'
import { VerificadorEntrante } from '../../../communication-service/src/index.mjs'

/**
 * @param {object} cfg
 * @param {string} [cfg.secretoHmac]       secreto HMAC (camino firmado; opcional)
 * @param {string} [cfg.tokenMattermost]   token del outgoing webhook (camino nativo; opcional)
 * @param {number} [cfg.ventanaSegundos]   ventana anti-replay / anti-viejo (default 300)
 * @param {string[]} [cfg.allowlist]       IPs/prefijos permitidos (aplica a ambos caminos)
 * @param {() => number} [cfg.ahora]
 */
export function crearAutenticadorEndpoint(cfg = {}) {
  const ventanaMs = (cfg.ventanaSegundos ?? 300) * 1000
  const allowlist = cfg.allowlist ?? []
  const ahora = cfg.ahora ?? (() => Date.now())
  const secretoHmac = cfg.secretoHmac ?? null
  const tokenMM = cfg.tokenMattermost ?? null
  // Reutiliza el verificador de PR-3 para el camino HMAC (sin modificarlo).
  const verifHmac = secretoHmac
    ? new VerificadorEntrante({ secreto: secretoHmac, ventanaSegundos: cfg.ventanaSegundos ?? 300, allowlist, ahora })
    : null
  const vistosToken = new Map() // anti-replay del camino token

  return {
    /** @returns {{ok:boolean, via?:string, motivo?:string}} */
    verificar({ rawBody, firma, timestamp, ip, token } = {}) {
      // Fail-closed: si no hay NINGÚN método configurado, rechazar.
      if (!secretoHmac && !tokenMM) return { ok: false, motivo: 'sin_metodo_configurado' }

      // 1) HMAC válida → aceptar.
      if (firma && verifHmac) {
        const r = verifHmac.verificar({ rawBody, firma, timestamp, ip })
        if (r.ok) return { ok: true, via: 'hmac' }
        // HMAC presente pero inválida: el contrato permite probar token igual.
      }

      // 2) token de Mattermost válido → aceptar.
      if (tokenMM) {
        if (!token) return { ok: false, motivo: firma ? 'firma_invalida' : 'token_faltante' }
        return this._token({ token, timestamp, ip })
      }

      // 3) sólo había HMAC configurada y falló.
      return { ok: false, motivo: firma ? 'firma_invalida' : 'firma_faltante' }
    },

    _token({ token, timestamp, ip }) {
      if (allowlist.length && !ipPermitida(ip, allowlist)) return { ok: false, motivo: 'ip_no_permitida' }
      const ts = Number(timestamp)
      if (!Number.isFinite(ts) || Math.abs(ahora() - ts) > ventanaMs) return { ok: false, motivo: 'timestamp_vencido' }
      if (!igualdadSegura(token, tokenMM)) return { ok: false, motivo: 'token_invalido' }
      // anti-replay: mismo token+timestamp no se acepta dos veces en la ventana.
      purgar(vistosToken, ahora())
      const nonce = `${ts}.${token}`
      if (vistosToken.has(nonce)) return { ok: false, motivo: 'replay' }
      vistosToken.set(nonce, ahora() + ventanaMs)
      return { ok: true, via: 'token' }
    },
  }
}

function igualdadSegura(a, b) {
  const ba = Buffer.from(String(a)); const bb = Buffer.from(String(b))
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}

function ipPermitida(ip, allowlist) {
  if (!ip) return false
  return allowlist.some((a) => ip === a || (a.endsWith('.') && ip.startsWith(a)))
}

function purgar(m, t) {
  for (const [k, exp] of m) if (exp <= t) m.delete(k)
}
