#!/usr/bin/env node
// Habilita una o más APIs de Google Cloud en el proyecto del OS, usando la service account
// (token cloud-platform, sin consentimiento interactivo). Requiere que la SA tenga el rol
// "Service Usage Admin" (roles/serviceusage.serviceUsageAdmin) en el proyecto.
//
//   node orquestador/scripts/enable-google-api.mjs gmail.googleapis.com calendar-json.googleapis.com
//   node orquestador/scripts/enable-google-api.mjs            # sin args: Gmail + Calendar (default)
//
// Es seguro y reversible (habilitar una API estándar no cuesta ni cambia datos). Idempotente:
// si ya está habilitada, Google responde ok.
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { JWT } from 'google-auth-library'

const DIR = dirname(fileURLToPath(import.meta.url))
const SA_PATH = process.env.ORQ_GOOGLE_SA_JSON
  || join(DIR, '..', '..', 'scripts', 'google_workspace', 'credentials', 'service-account.json')

const DEFAULT_APIS = ['gmail.googleapis.com', 'calendar-json.googleapis.com']

async function main() {
  const apis = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_APIS
  const sa = JSON.parse(readFileSync(SA_PATH, 'utf8'))
  const project = sa.project_id
  const client = new JWT({ email: sa.client_email, key: sa.private_key, scopes: ['https://www.googleapis.com/auth/cloud-platform'] })
  const { token } = await client.getAccessToken()

  let ok = 0
  for (const api of apis) {
    const r = await fetch(`https://serviceusage.googleapis.com/v1/projects/${project}/services/${api}:enable`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: '{}',
    })
    const j = await r.json().catch(() => ({}))
    if (r.ok) { console.log(`✓ ${api}: habilitada (o ya lo estaba)`); ok++ }
    else console.log(`✗ ${api}: ${r.status} ${JSON.stringify(j.error || j).slice(0, 180)}`)
  }
  console.log(`\n${ok}/${apis.length} API(s) habilitada(s) en proyecto ${project}`)
  if (ok < apis.length) process.exit(1)
}
main().catch((e) => { console.error('falló:', e.message); process.exit(1) })
