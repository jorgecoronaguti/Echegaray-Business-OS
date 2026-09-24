// LAS CUENTAS DE CAMPO Y JEFE NACEN CON LA CORRIDA Y MUEREN CON ELLA (24/09/2026).
//
// El 23/09 el dueño hizo borrar `qa.campo@` y `qa.jefe.obra@` (y la cuenta de Dirección de prueba quedó
// bloqueada): no quiere usuarios de prueba viviendo en
// la app. 24 specs las usaban. En vez de tocar los 24, `CAMPO` y `JEFE` (identidades.ts) leen el correo
// de acá: el globalSetup crea las dos con `es_prueba`, y lo que devuelve es el teardown que las borra.
// Una corrida cortada deja cuentas vivas: por eso lo primero es barrer las efímeras de más de una hora.
import { createClient } from '@supabase/supabase-js'

const PREFIJO = 'qa.efimera+'

export default async function cuentasDeLaCorrida(): Promise<() => Promise<void>> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const srv = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !srv) return async () => {}
  const admin = createClient(url, srv, { auth: { persistSession: false } })

  const borrar = async (id: string) => {
    await admin.from('usuario_obra').delete().eq('usuario_id', id)
    const { error } = await admin.auth.admin.deleteUser(id)
    if (error) console.error(`  ⚠ LA CUENTA EFÍMERA ${id} QUEDÓ VIVA: ${error.message}`)
  }

  const { data: lista } = await admin.auth.admin.listUsers({ perPage: 1000 })
  const hace1h = Date.now() - 3600_000
  for (const u of lista?.users ?? []) {
    if (u.email?.startsWith(PREFIJO) && new Date(u.created_at).getTime() < hace1h) await borrar(u.id)
  }

  const marca = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const creadas: string[] = []
  for (const [rol, clave] of [['campo', 'CAMPO'], ['jefe_obra', 'JEFE'], ['direccion', 'ADMIN']] as const) {
    const email = `${PREFIJO}${rol}-${marca}@ecsas.com.ar`
    const password = `Ef-${marca}-${Math.random().toString(36).slice(2, 10)}!`
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
    if (error || !data?.user) throw new Error(`no pude crear ${email}: ${error?.message}`)
    creadas.push(data.user.id)
    const { error: pErr } = await admin.from('perfiles')
      .upsert({ id: data.user.id, rol, nombre: `QA efímera ${rol}`, es_prueba: true }, { onConflict: 'id' })
    if (pErr) throw new Error(`perfil de ${email}: ${pErr.message}`)
    process.env[`E2E_${clave}_EMAIL`] = email
    process.env[`E2E_${clave}_PASSWORD`] = password
  }
  return async () => { for (const id of creadas) await borrar(id) }
}
