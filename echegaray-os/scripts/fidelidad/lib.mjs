// Helpers compartidos del medidor de fidelidad. SÓLO LECTURA: nunca escribe en producción ni en el
// Sheet. No hace ninguna llamada a un LLM (ni Anthropic ni ningún otro) — es determinístico: mismos
// insumos (diseño + producción) dan siempre el mismo puntaje.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const HERE = path.dirname(fileURLToPath(import.meta.url))
// scripts/fidelidad -> scripts -> echegaray-os (raíz de la app Next, mismo nivel que package.json)
export const RAIZ = path.resolve(HERE, '..', '..')
const require = createRequire(path.join(RAIZ, 'package.json'))

export const { createClient } = require('@supabase/supabase-js')
export const { chromium, devices } = require('playwright')

export const BASE = process.env.BASE || 'https://app.ecsas.com.ar'
export const DISENO_DIR = path.join(RAIZ, 'docs', 'diseno', 'erp-obras')

function leerEnvLocal() {
  const p = path.join(RAIZ, '.env.local')
  if (!fs.existsSync(p)) return {}
  return Object.fromEntries(fs.readFileSync(p, 'utf8').split('\n')
    .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1')]))
}

const env = { ...leerEnvLocal(), ...process.env }
const URL_SB = env.NEXT_PUBLIC_SUPABASE_URL
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_KEY

export const admin = () => createClient(URL_SB, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } })

/**
 * Cookies de una sesión real (magic link + verifyOtp), la misma técnica que usa la auditoría de
 * fidelidad anterior. Requiere el service role: nunca se loguea ni se imprime.
 */
export async function cookiesDeSesion(email) {
  const a = admin()
  const { data: link, error: e1 } = await a.auth.admin.generateLink({ type: 'magiclink', email })
  if (e1) throw e1
  const anon = createClient(URL_SB, ANON, { auth: { persistSession: false, autoRefreshToken: false, flowType: 'implicit' } })
  const { data: v, error: e2 } = await anon.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' })
  if (e2) throw e2
  const ref = URL_SB.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)[1]
  const nombre = `sb-${ref}-auth-token`
  const valor = 'base64-' + Buffer.from(JSON.stringify(v.session)).toString('base64url')
  const trozos = []
  const MAX = 3180
  if (valor.length <= MAX) trozos.push({ name: nombre, value: valor })
  else for (let i = 0, k = 0; i < valor.length; i += MAX, k += 1) trozos.push({ name: `${nombre}.${k}`, value: valor.slice(i, i + MAX) })
  const dominio = new URL(BASE).hostname
  const seguro = BASE.startsWith('https')
  return trozos.map((c) => ({ ...c, domain: dominio, path: '/', httpOnly: false, secure: seguro, sameSite: 'Lax' }))
}
