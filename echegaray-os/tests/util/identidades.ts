// LAS TRES IDENTIDADES CON LAS QUE SE MIDE LA CERRADURA — UNA SOLA VEZ, PARA TODOS LOS SPECS.
//
// ═══ POR QUÉ HAY UNA CUENTA DE NIVEL CAMPO (20/08/2026) ═══
//
// Hasta el 19/08, `jefe_obra` era el rol acotado por obra y con él se medían todas las pruebas
// negativas. Ese día el dueño decidió lo contrario, textual: *"quiero que los usuarios con permisos
// de «jefe de obra» pueda acceder a administracion, solo no quiero que vean los montos de venta de
// las obras. pero necesito que puedan hacer todo lo demas"*. La migración
// `20260819T4900` lo escribió en la base: `es_administracion()` pasó a incluir a `jefe_obra`.
//
// Desde entonces **el único rol que la RLS acota por obra es `campo`** — `ve_obra()` devuelve true
// para cualquier obra si el rol es `jefe_obra`. Diez tests seguían midiendo el aislamiento con el
// token del jefe: pasaban a rojo no porque la cerradura se hubiera roto, sino porque medían un
// modelo que ya no existe. Medir el aislamiento con una identidad que dejó de estar aislada no es
// un test estricto: es un test que no mide nada y que además obliga a leerlo mal.
//
// Acá viven las tres, con lo que cada una prueba:
//
//   CAMPO   el aislamiento por obra. Es la ÚNICA identidad con la que una prueba negativa
//           de alcance por obra significa algo.
//   JEFE    que Administración es Administración —lee y escribe los maestros— y que la línea
//           COSTO/PRECIO sigue en pie: ve lo gastado, no ve lo vendido (`ve_economia()` = false).
//   ADMIN   Dirección: el techo, contra el que se comparan las otras dos.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export const URL = process.env.NEXT_PUBLIC_SUPABASE_URL as string
export const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
export const SRV = process.env.SUPABASE_SERVICE_ROLE_KEY as string

/** Nivel campo: rol `campo`, acotado a UNA obra por `usuario_obra`. Lo crea `asegurarCampo()`. */
export const CAMPO = { email: 'qa.campo@ecsas.com.ar', password: 'TestCampo123!' }
/** Nivel jefe de obra: desde el 19/08/2026 es Administración, salvo el precio. */
export const JEFE = { email: 'qa.jefe.obra@ecsas.com.ar', password: 'TestJefe123!' }
/** Dirección. */
export const ADMIN = {
  email: 'jorge.o.corona+direccion-test-1783513222134@gmail.com',
  password: 'TestPassword123!',
}

export function servicio(): SupabaseClient {
  return createClient(URL, SRV, { auth: { persistSession: false } })
}

/** El token de una persona. Es lo que viaja en el navegador y lo que puede copiar cualquiera. */
export async function entrar(email: string, password: string): Promise<string> {
  const sb = createClient(URL, ANON, { auth: { persistSession: false } })
  const { data, error } = await sb.auth.signInWithPassword({ email, password })
  if (error || !data.session) throw new Error(`no pude entrar como ${email}: ${error?.message}`)
  return data.session.access_token
}

/** Un GET a PostgREST con el token de una persona: el status y las filas que devolvió la base. */
export async function pedir(token: string, consulta: string) {
  const r = await fetch(`${URL}/rest/v1/${consulta}`, {
    headers: { apikey: ANON, Authorization: `Bearer ${token}` },
  })
  const j = await r.json()
  return { status: r.status, filas: Array.isArray(j) ? (j as unknown[]) : [], cuerpo: j }
}

/** Una escritura a PostgREST con el token de una persona. Devuelve sólo el status. */
export async function escribir(
  token: string, consulta: string, metodo: 'POST' | 'PATCH' | 'DELETE', cuerpo?: unknown,
): Promise<number> {
  const r = await fetch(`${URL}/rest/v1/${consulta}`, {
    method: metodo,
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  })
  return r.status
}

/**
 * La obra contra la que se mide el aislamiento: la que tiene datos en TODAS las tablas que se
 * prueban. Sin eso, un caso positivo pasa por vacío y el test dice lo contrario de lo que mide.
 * Se resuelve contra la base para no depender de que el catálogo siga igual dentro de seis meses.
 */
export async function obraConDatos(admin: SupabaseClient): Promise<string> {
  const { data, error } = await admin.rpc('obra_para_pruebas').select()
  if (!error && data) return data as unknown as string
  // Sin función auxiliar en la base: se resuelve leyendo, que es lo que hace un test.
  const { data: panel } = await admin.from('obra_panel')
    .select('obra_id, n_actividades, n_comprobantes')
    .order('n_actividades', { ascending: false }).limit(5)
  const fila = (panel ?? []).find((o) => {
    const f = o as { n_actividades: number; n_comprobantes: number }
    return f.n_actividades > 0 && f.n_comprobantes > 0
  })
  if (!fila) throw new Error('ninguna obra tiene actividades Y comprobantes: el escenario no mide nada')
  return (fila as { obra_id: string }).obra_id
}

/**
 * Deja la cuenta de nivel campo existiendo, con rol `campo` y UNA sola obra asignada.
 *
 * Es idempotente y se ejecuta al principio de cada spec que la usa: una asignación vieja
 * sobreviviente haría que «ve sólo la suya» diera dos, y el test culparía al RLS de un residuo
 * suyo. Si la cuenta no existe la crea — el equivalente por consola es
 * `node scripts/crear-operario-campo.mjs qa.campo@ecsas.com.ar "QA Campo" 'TestCampo123!'`.
 */
export async function asegurarCampo(admin: SupabaseClient, obra: string): Promise<string> {
  const { data: lista } = await admin.auth.admin.listUsers({ perPage: 1000 })
  let id = lista?.users?.find((u) => u.email?.toLowerCase() === CAMPO.email)?.id
  if (!id) {
    const { data: creado, error } = await admin.auth.admin.createUser({
      email: CAMPO.email, password: CAMPO.password, email_confirm: true,
    })
    if (error || !creado?.user) throw new Error(`no pude crear ${CAMPO.email}: ${error?.message}`)
    id = creado.user.id
  }
  const { error: pErr } = await admin.from('perfiles')
    .upsert({ id, rol: 'campo', nombre: 'QA Campo' }, { onConflict: 'id' })
  if (pErr) throw new Error(`perfil de ${CAMPO.email}: ${pErr.message}`)
  // IDEMPOTENTE DE VERDAD, no "casi". Playwright corre `beforeAll` UNA VEZ POR WORKER: con dos
  // workers sobre el mismo archivo, un `delete` + `insert` se pisa con el del otro y revienta con
  // `duplicate key … usuario_obra_usuario_id_obra_canonica_id_key`. Pasó la primera vez que se
  // corrió esto. Se borra sólo lo que sobra —las asignaciones a OTRAS obras, que son las que harían
  // que «ve sólo la suya» diera dos— y la que queremos se deja entrar sin pelearse consigo misma.
  await admin.from('usuario_obra').delete().eq('usuario_id', id).neq('obra_canonica_id', obra)
  const { error: aErr } = await admin.from('usuario_obra')
    .upsert({ usuario_id: id, obra_canonica_id: obra, papel: 'jefe' },
      { onConflict: 'usuario_id,obra_canonica_id' })
  if (aErr) throw new Error(`asignación de ${CAMPO.email}: ${aErr.message}`)
  return id
}
