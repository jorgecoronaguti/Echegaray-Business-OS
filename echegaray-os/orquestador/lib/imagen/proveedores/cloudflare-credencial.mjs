// LA CREDENCIAL DE CLOUDFLARE, VIVA — sin volver a pedirle nada al dueño.
//
// ═══ POR QUÉ NO ES UNA VARIABLE Y LISTO ═══
//
// El dueño autorizó Cloudflare UNA vez, por el flujo de dispositivo de Wrangler (27/08/2026). Ese
// flujo no deja un token eterno: deja un `oauth_token` que vence en una hora y un `refresh_token`
// que lo renueva. Copiar el primero a un `.env` habría funcionado hasta la hora siguiente, y después
// el síntoma sería «XSAS dejó de generar imágenes» sin nada roto a la vista.
//
// Intenté crear un token de servicio acotado (`POST /accounts/{id}/tokens`) y Cloudflare contestó
// 9109 «Unauthorized to access requested resource»: el token de OAuth de Wrangler no puede fabricar
// otros tokens. Así que el mecanismo productivo ES éste — leer la credencial que dejó Wrangler y
// renovarla cuando vence — y queda declarado como lo que es: una dependencia de un archivo del
// sistema, no de un secreto en el repositorio.
//
// `CLOUDFLARE_API_TOKEN` en el entorno SIEMPRE gana. El día que exista un token de servicio de
// verdad, se pone ahí y este archivo deja de usarse sin tocar nada más.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/** El client_id público de Wrangler. No es un secreto: viaja en cada login del CLI. */
const CLIENT_ID = '54d11594-84e4-41aa-b438-e81b8fa78ee7'
const URL_TOKEN = 'https://dash.cloudflare.com/oauth2/token'

/** Los dos lugares donde Wrangler deja su configuración, en el orden en que la busca él. */
export function rutasDeConfig(home = os.homedir()) {
  return [
    path.join(home, '.config', '.wrangler', 'config', 'default.toml'),
    path.join(home, '.wrangler', 'config', 'default.toml'),
  ]
}

/** Un TOML plano de tres claves. No se usa un parser general a propósito: este archivo tiene una
 *  forma conocida y fija, y meter una dependencia para leer tres líneas es peor. PURA. */
export function leerToml(texto) {
  const val = (k) => texto.match(new RegExp(`^${k}\\s*=\\s*"([^"]*)"`, 'm'))?.[1] ?? null
  return { oauth_token: val('oauth_token'), refresh_token: val('refresh_token'), expiration_time: val('expiration_time') }
}

/** ¿Está vencido? Con un minuto de colchón: pedir con un token que vence en tres segundos es pedir
 *  un 401 en el medio de una generación. PURA. */
export function vencido(expiration, ahora = new Date()) {
  if (!expiration) return true
  const t = Date.parse(expiration)
  return !Number.isFinite(t) || t - ahora.getTime() < 60_000
}

function configVigente() {
  for (const ruta of rutasDeConfig()) {
    try { return { ruta, ...leerToml(fs.readFileSync(ruta, 'utf8')) } } catch { /* siguiente */ }
  }
  return null
}

/** Escribe el token renovado donde estaba, para que Wrangler y el OS compartan la misma credencial
 *  en vez de pelearse por renovarla cada uno por su lado. */
function guardar(ruta, { oauth_token, refresh_token, expiration_time }) {
  try {
    const previo = fs.readFileSync(ruta, 'utf8')
    const reemplazar = (t, k, v) => (v == null ? t : (new RegExp(`^${k}\\s*=.*$`, 'm').test(t)
      ? t.replace(new RegExp(`^${k}\\s*=.*$`, 'm'), `${k} = "${v}"`)
      : `${k} = "${v}"\n${t}`))
    let t = previo
    t = reemplazar(t, 'oauth_token', oauth_token)
    t = reemplazar(t, 'refresh_token', refresh_token)
    t = reemplazar(t, 'expiration_time', expiration_time)
    fs.writeFileSync(ruta, t)
  } catch { /* si no se pudo guardar, el token igual sirve para esta corrida */ }
}

/**
 * UN TOKEN QUE FUNCIONA AHORA, o null.
 *
 * NUNCA lanza y NUNCA registra el valor: quien la llama sólo necesita saber si hay credencial.
 */
export async function tokenCloudflare({ fetchImpl = globalThis.fetch, ahora = new Date() } = {}) {
  const delEntorno = process.env.CLOUDFLARE_API_TOKEN
  if (delEntorno && delEntorno.trim()) return delEntorno.trim()

  const cfg = configVigente()
  if (!cfg?.oauth_token) return null
  if (!vencido(cfg.expiration_time, ahora)) return cfg.oauth_token
  if (!cfg.refresh_token) return null

  try {
    const r = await fetchImpl(URL_TOKEN, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: cfg.refresh_token, client_id: CLIENT_ID }),
    })
    if (!r.ok) return null
    const j = await r.json()
    if (!j?.access_token) return null
    const vence = new Date(ahora.getTime() + Number(j.expires_in ?? 3600) * 1000).toISOString()
    guardar(cfg.ruta, { oauth_token: j.access_token, refresh_token: j.refresh_token ?? cfg.refresh_token, expiration_time: vence })
    return j.access_token
  } catch { return null }
}
