#!/usr/bin/env node
// Vacía la cola de saldos cargados desde la web (acciones con
// categoria_alerta='cargar_saldo_caja', estado pendiente) hacia la pestaña Caja
// del Sheet real, y marca cada acción como resuelta. Corre antes del sync del
// calendario en sync-calendario-vm.sh, para que el saldo nuevo entre en el
// snapshot de la misma corrida. Una persona real cargó el dato; esto solo lo
// transcribe (techo de autonomía respetado).
//
// Worker de backend confiable: usa SUPABASE_SERVICE_ROLE_KEY (bypassa RLS, sin
// login interactivo). Las credenciales se toman del entorno; en local se
// completan desde .env.local si existe. Nunca se imprimen secretos.
//
// Uso: node scripts/flush-saldos.mjs   (desde echegaray-os/)

import crypto from 'crypto'
import { existsSync, readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import { loadEnvLocalInto } from './lib/env-file.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SPREADSHEET_ID = '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'

// Carga .env.local (si existe) sin pisar variables ya presentes en el entorno
// real: en la VM mandan las env vars del sistema; en local, el archivo las cubre.
// El parser (scripts/lib/env-file.mjs) interpreta comillas y escapes del formato
// de Vercel: sin esto, un valor como `URL="https://..."` se guardaba con las
// comillas literales y createClient fallaba con "Invalid supabaseUrl".
loadEnvLocalInto(process.env, join(ROOT, '.env.local'))

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const faltantes = []
if (!SUPABASE_URL) faltantes.push('NEXT_PUBLIC_SUPABASE_URL')
if (!SERVICE_ROLE_KEY) faltantes.push('SUPABASE_SERVICE_ROLE_KEY')
if (faltantes.length) {
  console.error(`Faltan variables de entorno requeridas: ${faltantes.join(', ')}`)
  console.error('Definilas en el entorno de la VM o en .env.local. No se imprimen valores por seguridad.')
  process.exit(1)
}

// Validación explícita: la URL debe ser http(s). Atrapa el caso real de comillas
// o escapes mal parseados sin imprimir el valor (podría no ser sensible, pero se
// mantiene el criterio de no exponer nada del entorno).
if (!/^https?:\/\//.test(SUPABASE_URL)) {
  console.error('NEXT_PUBLIC_SUPABASE_URL inválida: debe empezar con http:// o https://.')
  console.error('Suele ser por comillas o escapes en .env.local. No se imprime el valor por seguridad.')
  process.exit(1)
}

// Credencial de Google: primero GOOGLE_SERVICE_ACCOUNT_JSON (contenido JSON o
// ruta a un archivo); si no está, el archivo local (gitignorado).
function cargarServiceAccount() {
  const desdeEnv = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim()
  if (desdeEnv) {
    const crudo = desdeEnv.startsWith('{') ? desdeEnv : readFileSync(desdeEnv, 'utf8')
    return JSON.parse(crudo)
  }
  const credPath = join(ROOT, 'scripts/google_workspace/credentials/service-account.json')
  if (!existsSync(credPath)) {
    console.error(
      'No hay credencial de Google: definí GOOGLE_SERVICE_ACCOUNT_JSON (JSON o ruta) ' +
        'o proveé scripts/google_workspace/credentials/service-account.json',
    )
    process.exit(1)
  }
  return JSON.parse(readFileSync(credPath, 'utf8'))
}

// Worker confiable: service role, sin sesión persistida ni refresh automático.
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

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

// GUARDA (25/07). Este script escribe CAJA con fetch DIRECTO —no pasa por google.mjs ni por su guarda
// central—, así que respeta el candado acá, con el mismo supabase que ya tiene. Si tomaste CAJA a mano
// (candado), no le transcribo saldos hasta que la devuelvas: quedan encolados para la próxima corrida.
// El candado explícito manda incluso sobre tu propio saldo cargado en la web: si estás trabajando la
// pestaña, espera. (La firma no se consulta acá: este script no tiene cliente de lectura del Sheet; el
// candado explícito es la señal fuerte y suficiente para un write de baja frecuencia como éste.)
const { data: candada } = await supabase
  .from('sheet_pestanas_bloqueadas')
  .select('pestana')
  .eq('file_id', SPREADSHEET_ID)
  .eq('pestana', 'CAJA')
  .maybeSingle()
if (candada) {
  console.log('🔒 CAJA está bajo tu control (candado): dejo los saldos encolados para después.')
  process.exit(0)
}

const sa = cargarServiceAccount()
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
