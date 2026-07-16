#!/usr/bin/env node
// CUTOVER — Alta de un operario de CAMPO en el OS: crea la cuenta de auth (Supabase) y su
// perfil con rol 'campo' (solo ve los módulos operativos en la web). Usa la service_role key.
//
//   node scripts/crear-operario-campo.mjs email@ejemplo.com "Nombre Apellido" [password]
//
// Si no se pasa password, genera una temporal y la imprime (pasásela al operario; que la
// cambie después). Idempotente: si el email ya existe, actualiza nombre/rol del perfil.
import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

function loadEnv() {
  try {
    for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
      const m = /^([A-Z_]+)=(.*)$/.exec(line.trim())
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  } catch { /* env ya presente */ }
}

async function main() {
  const [email, nombre, passwordArg] = process.argv.slice(2)
  if (!email || !nombre) {
    console.error('uso: node scripts/crear-operario-campo.mjs email "Nombre" [password]')
    process.exit(1)
  }
  loadEnv()
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const password = passwordArg || ('Campo-' + Math.random().toString(36).slice(2, 8) + '!' + Math.floor(Math.random() * 90 + 10))

  // Crear (o encontrar) el usuario de auth.
  let userId
  const { data: created, error: cErr } = await sb.auth.admin.createUser({ email, password, email_confirm: true })
  if (created?.user) { userId = created.user.id }
  else if (cErr && /already been registered|already exists/i.test(cErr.message)) {
    // ya existe: buscar su id
    const { data: list } = await sb.auth.admin.listUsers({ perPage: 1000 })
    userId = list?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase())?.id
    console.log('(el usuario ya existía; actualizo su perfil)')
  } else if (cErr) { throw new Error(cErr.message) }
  if (!userId) throw new Error('no pude resolver el id del usuario')

  // Perfil con rol campo (upsert por id).
  const { error: pErr } = await sb.from('perfiles').upsert({ id: userId, rol: 'campo', nombre }, { onConflict: 'id' })
  if (pErr) throw new Error('perfil: ' + pErr.message)

  console.log(`✓ Operario de campo listo:`)
  console.log(`  email:    ${email}`)
  console.log(`  nombre:   ${nombre}`)
  console.log(`  rol:      campo`)
  if (!passwordArg) console.log(`  password: ${password}   ← pasásela al operario (que la cambie luego)`)
  console.log(`\n  Entra en https://echegaray-business-os.vercel.app/login → lo lleva a /campo`)
}
main().catch((e) => { console.error('falló:', e.message); process.exit(1) })
