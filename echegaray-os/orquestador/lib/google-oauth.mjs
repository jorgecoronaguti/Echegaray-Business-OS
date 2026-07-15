// PRP-024 (nuevo enfoque) — OAUTH POR USUARIO. En vez de la delegación de dominio (que
// necesita al admin del Workspace), el DUEÑO autoriza el OS sobre su propia cuenta con el
// clásico "Iniciar sesión con Google → Permitir". El OS guarda un refresh_token y actúa
// COMO esa cuenta: Drive completo (copiar/crear donde sea), Gmail, Calendar. Cualquier
// usuario puede autorizar la suya — sin admin, sin Rodrigo.
//
// Config (todo del proyecto GCP que el dueño ya posee): GOOGLE_OAUTH_CLIENT_ID,
// GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REDIRECT (el /api/oauth/callback de Vercel).
// El refresh_token se guarda en orq.google_tokens (por email) — nunca en git/logs.
import { query } from './db.mjs'

export const OAUTH_SCOPES = [
  'openid', 'email', 'profile',
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/spreadsheets',
  // GMAIL completo (menos borrado PERMANENTE, que no exponemos): leer, enviar, redactar,
  // etiquetar, archivar y mandar a papelera. modify+send+compose cubren "todo en los mails".
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/calendar',
]

function cfg() {
  const id = process.env.GOOGLE_OAUTH_CLIENT_ID
  const secret = process.env.GOOGLE_OAUTH_CLIENT_SECRET
  const redirect = process.env.GOOGLE_OAUTH_REDIRECT || 'https://echegaray-business-os.vercel.app/api/oauth/callback'
  return { id, secret, redirect, ok: Boolean(id && secret) }
}

/** URL de consentimiento para que el usuario autorice. state = identificador anti-CSRF. */
export function authUrl(state = 'os') {
  const c = cfg()
  if (!c.ok) throw new Error('falta GOOGLE_OAUTH_CLIENT_ID/SECRET (crear la credencial OAuth en el proyecto GCP)')
  const p = new URLSearchParams({
    client_id: c.id, redirect_uri: c.redirect, response_type: 'code',
    scope: OAUTH_SCOPES.join(' '), access_type: 'offline', prompt: 'consent', state,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${p.toString()}`
}

/** Intercambia el code por tokens y guarda el refresh_token por email. Devuelve {email}. */
export async function exchangeCode(code) {
  const c = cfg()
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: c.id, client_secret: c.secret, redirect_uri: c.redirect, grant_type: 'authorization_code' }),
  })
  if (!res.ok) throw new Error(`token exchange ${res.status}: ${String(await res.text()).slice(0, 200)}`)
  const tok = await res.json()
  // email del id_token (JWT) sin verificar firma (lo emite Google en este intercambio directo).
  let email = null
  try { email = JSON.parse(Buffer.from(String(tok.id_token).split('.')[1], 'base64').toString('utf8')).email } catch { /* */ }
  if (!email) throw new Error('no vino email en el id_token')
  if (!tok.refresh_token) throw new Error('Google no devolvió refresh_token (repetí con prompt=consent / revocá acceso previo)')
  await query(
    `insert into orq.google_tokens (email, refresh_token, scopes, updated_at)
     values ($1, $2, $3, now())
     on conflict (email) do update set refresh_token = excluded.refresh_token, scopes = excluded.scopes, updated_at = now()`,
    [email.toLowerCase(), tok.refresh_token, OAUTH_SCOPES.join(' ')],
  )
  return { email: email.toLowerCase() }
}

/** Access token vigente para un email autorizado (refresca con el refresh_token). null si no. */
export async function accessTokenFor(email) {
  const c = cfg()
  if (!c.ok) return null
  const { rows } = await query(`select refresh_token from orq.google_tokens where email = $1 limit 1`, [String(email || '').toLowerCase()])
  if (!rows.length) return null
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: c.id, client_secret: c.secret, refresh_token: rows[0].refresh_token, grant_type: 'refresh_token' }),
  })
  if (!res.ok) return null
  const tok = await res.json()
  return tok.access_token || null
}

/** ¿Hay al menos una cuenta autorizada? (para saber si el OS ya puede actuar como usuario). */
export async function hayCuentaAutorizada() {
  try { const { rows } = await query(`select count(*)::int n from orq.google_tokens`); return rows[0].n > 0 } catch { return false }
}

/** Cuenta OPERADORA del OS: la que usa para el trabajo autónomo/de fondo sobre Drive.
 *  Preferencia: env ORQ_GOOGLE_IMPERSONATE (si está autorizada), si no la más reciente. */
export async function operadorEmail() {
  try {
    const pref = String(process.env.ORQ_GOOGLE_IMPERSONATE || '').toLowerCase()
    const { rows } = await query(`select email from orq.google_tokens order by updated_at desc`)
    if (!rows.length) return null
    if (pref && rows.some((r) => r.email === pref)) return pref
    return rows[0].email
  } catch { return null }
}

/** Factory de getToken para makeGoogleClient: token fresco de la cuenta operadora. */
export function getTokenFor(email) {
  return async () => accessTokenFor(email)
}

/** ¿Este email autorizó su Google? (sin refrescar token: solo mira la DB). */
export async function tieneToken(email) {
  const e = String(email || '').toLowerCase()
  if (!e) return false
  try { const { rows } = await query(`select 1 from orq.google_tokens where email = $1 limit 1`, [e]); return rows.length > 0 } catch { return false }
}

/** Email cuya cuenta Google usará el OS para ESTE pedido: la del usuario que pide si
 *  autorizó la suya (actúa como él mismo), si no la operadora del OS (fallback). */
export async function operadorPara(userEmail) {
  if (await tieneToken(userEmail)) return String(userEmail).toLowerCase()
  return operadorEmail()
}
