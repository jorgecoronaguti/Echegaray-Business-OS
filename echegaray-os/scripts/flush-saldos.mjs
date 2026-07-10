#!/usr/bin/env node
// Vacía la cola de saldos cargados desde la web (acciones con
// categoria_alerta='cargar_saldo_caja', estado pendiente) hacia la pestaña Caja
// del Sheet real, y marca cada acción como resuelta. Corre antes del sync del
// calendario en sync-calendario-cron.sh, para que el saldo nuevo entre en el
// snapshot de la misma corrida. Una persona real cargó el dato; esto solo lo
// transcribe (techo de autonomía respetado).
//
// Uso: node scripts/flush-saldos.mjs   (desde echegaray-os/)

import crypto from 'crypto'
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CRED = join(ROOT, 'scripts/google_workspace/credentials/service-account.json')
const SPREADSHEET_ID = '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'

const env = Object.fromEntries(
  readFileSync(join(ROOT, '.env.local'), 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i), l.slice(i + 1).trim()]
    }),
)
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
const { error: authErr } = await supabase.auth.signInWithPassword({
  email: 'jorge.o.corona+direccion-test-1783513222134@gmail.com',
  password: 'TestPassword123!',
})
if (authErr) throw new Error(`auth: ${authErr.message}`)

const { data: pendientes, error } = await supabase
  .from('acciones')
  .select('id, causa')
  .eq('categoria_alerta', 'cargar_saldo_caja')
  .eq('estado', 'pendiente')
  .order('created_at')
if (error) throw new Error(error.message)
if (!pendientes?.length) {
  console.log('sin saldos encolados')
  process.exit(0)
}

const sa = JSON.parse(readFileSync(CRED, 'utf8'))
const now = Math.floor(Date.now() / 1000)
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const input = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
  iss: sa.client_email,
  scope: 'https://www.googleapis.com/auth/spreadsheets',
  aud: 'https://oauth2.googleapis.com/token',
  iat: now,
  exp: now + 3600,
})}`
const sig = crypto.createSign('RSA-SHA256').update(input).sign(sa.private_key).toString('base64url')
const tokRes = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${input}.${sig}` }),
})
const { access_token } = await tokRes.json()

for (const p of pendientes) {
  const d = JSON.parse(p.causa)
  // OVERWRITE, nunca INSERT_ROWS: el panel de saldo vive en filas 1-8 de Caja.
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent('Caja!A5:F')}:append?valueInputOption=USER_ENTERED&insertDataOption=OVERWRITE`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        values: [[d.fecha, d.cuenta, d.saldo, 'OS web (sync)', d.cargado_por, d.notas ?? '']],
      }),
    },
  )
  if (!res.ok) {
    console.error(`falló append de ${p.id}: ${res.status} — queda pendiente para la próxima corrida`)
    continue
  }
  const { error: updErr } = await supabase
    .from('acciones')
    .update({
      estado: 'resuelta',
      fecha_resolucion: new Date().toISOString().slice(0, 10),
      resolucion_notas: 'Saldo transcripto al Sheet por el sync automático',
    })
    .eq('id', p.id)
  console.log(updErr ? `append OK pero no se pudo marcar resuelta ${p.id}: ${updErr.message}` : `saldo ${d.cuenta} ${d.fecha} pasado al Sheet`)
}
await supabase.auth.signOut()
