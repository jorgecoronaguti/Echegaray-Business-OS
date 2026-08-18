import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

// AUTORIZACIÓN POR OBRA — LAS CUATRO PRUEBAS, CONTRA POSTGREST DIRECTO.
//
// ═══ POR QUÉ NO SE PRUEBA EN EL NAVEGADOR ═══
//
// El dueño (18/08), textual: *"Supabase Auth + RLS real. No seguridad cosmética"*, y las cuatro
// pruebas que exige: obra asignada OK · otra obra por URL DENEGADO · **consulta API directa
// DENEGADO** · Administración todas.
//
// Un test que abre `/obras/otra-obra` y ve una página vacía no prueba nada: la página puede estar
// vacía porque el middleware redirigió, porque el componente no pintó, o porque de verdad la base no
// devolvió filas. Sólo la tercera es seguridad. Acá se le pide a PostgREST con el token del usuario
// —que es lo que puede hacer cualquiera con las devtools abiertas— y se exige que la base devuelva
// vacío. El middleware es la puerta; esto mide la cerradura.
//
// ═══ LO QUE ESTE ARCHIVO ENCONTRÓ CUANDO SE ESCRIBIÓ ═══
//
// Las vistas `obra_panel`, `obra_avance`, `obra_plan_vs_real` y `cliente_panel` no tenían
// `security_invoker`, así que corrían con los permisos de su dueño y SALTABAN el RLS de las tablas.
// Toda la web lee por esas vistas: las policies estrictas habrían sido exactamente la seguridad
// cosmética que el pedido prohíbe. Ver `20260818T2330_usuario_obra_y_rls_por_obra.sql`.

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL as string
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
const SRV = process.env.SUPABASE_SERVICE_ROLE_KEY as string

const JEFE = { email: 'qa.jefe.obra@ecsas.com.ar', password: 'TestJefe123!' }
const ADMIN = {
  email: 'jorge.o.corona+direccion-test-1783513222134@gmail.com',
  password: 'TestPassword123!',
}

/** Un GET a PostgREST con el token de una persona. Devuelve las filas, o [] si la base dijo que no. */
async function comoUsuario(token: string, consulta: string): Promise<unknown[]> {
  const r = await fetch(`${URL}/rest/v1/${consulta}`, {
    headers: { apikey: ANON, Authorization: `Bearer ${token}` },
  })
  const j = await r.json()
  return Array.isArray(j) ? j : []
}

async function entrar(email: string, password: string): Promise<string> {
  const sb = createClient(URL, ANON)
  const { data, error } = await sb.auth.signInWithPassword({ email, password })
  if (error || !data.session) throw new Error(`no pude entrar como ${email}: ${error?.message}`)
  return data.session.access_token
}

test('el nivel OBRAS ve su obra y NADA más — medido contra la base, no contra la pantalla', async () => {
  test.setTimeout(120000)
  const admin = createClient(URL, SRV, { auth: { persistSession: false } })

  // ── EL ESCENARIO. El usuario de QA existe con rol `jefe_obra` y UNA sola obra asignada.
  const { data: usuarios } = await admin.auth.admin.listUsers({ perPage: 200 })
  const jefe = usuarios.users.find((u) => u.email === JEFE.email)
  expect(jefe, `falta el usuario de QA ${JEFE.email}: lo crea scripts/qa-usuario-obras.mjs`).toBeTruthy()

  // La obra asignada tiene que TENER actividades: si no, el caso positivo pasaría por vacío y estaría
  // probando lo contrario de lo que dice probar.
  const { data: panel } = await admin.from('obra_panel')
    .select('obra_id, n_actividades').order('n_actividades', { ascending: false }).limit(2)
  const mia = panel![0].obra_id as string
  const ajena = panel![1].obra_id as string
  expect(panel![0].n_actividades, 'la obra del caso positivo no tiene actividades').toBeGreaterThan(0)

  // Se deja UNA sola asignación: una vieja sobreviviente haría que "ve sólo la suya" diera 2 y el
  // test culparía al RLS de un residuo del propio test.
  await admin.from('usuario_obra').delete().eq('usuario_id', jefe!.id)
  await admin.from('usuario_obra').insert({ usuario_id: jefe!.id, obra_canonica_id: mia, papel: 'jefe' })

  const token = await entrar(JEFE.email, JEFE.password)

  // 1 · SU OBRA, SÍ.
  const suyas = await comoUsuario(token, 'obra_canonica?select=id')
  expect(suyas.map((o) => (o as { id: string }).id)).toEqual([mia])
  expect(await comoUsuario(token, `obra_actividad?obra_id=eq.${mia}&select=id`)).not.toHaveLength(0)

  // 2 · LA OBRA AJENA, NO — ni por la tabla ni por la VISTA, que es por donde lee la web entera.
  expect(await comoUsuario(token, `obra_canonica?id=eq.${ajena}&select=id`)).toHaveLength(0)
  expect(await comoUsuario(token, `obra_panel?obra_id=eq.${ajena}&select=obra_id,costo_real`)).toHaveLength(0)
  expect(await comoUsuario(token, `obra_actividad?obra_id=eq.${ajena}&select=id`)).toHaveLength(0)
  expect(await comoUsuario(token, `obra_plan_vs_real?obra_id=eq.${ajena}&select=obra_id`)).toHaveLength(0)

  // 3 · LO DEL ÁREA ADMINISTRACIÓN, TAMPOCO. La cartera de clientes y la economía no son suyas.
  expect(await comoUsuario(token, 'clientes?select=id')).toHaveLength(0)
  expect(await comoUsuario(token, 'cliente_panel?select=cliente_id')).toHaveLength(0)
  expect(await comoUsuario(token, 'certificados?select=id')).toHaveLength(0)
})

test('el nivel ADMINISTRACIÓN ve todas las obras y la cartera entera', async () => {
  test.setTimeout(120000)
  const admin = createClient(URL, SRV, { auth: { persistSession: false } })
  const { count } = await admin.from('obra_canonica').select('id', { count: 'exact', head: true })

  const token = await entrar(ADMIN.email, ADMIN.password)
  expect(await comoUsuario(token, 'obra_canonica?select=id')).toHaveLength(count!)
  expect(await comoUsuario(token, 'obra_panel?select=obra_id')).toHaveLength(count!)
  expect(await comoUsuario(token, 'clientes?select=id')).not.toHaveLength(0)
})

test('sin sesión la base no devuelve una sola fila del módulo', async () => {
  // El `anon` es la llave que viaja en el JavaScript de la página: la tiene cualquiera que abra las
  // devtools. Que el middleware mande al login no dice nada sobre esto.
  for (const q of ['obra_canonica?select=id', 'obra_panel?select=obra_id', 'obra_actividad?select=id',
    'clientes?select=id', 'cliente_panel?select=cliente_id', 'obra_plan_vs_real?select=obra_id']) {
    expect(await comoUsuario(ANON, q), `${q} devolvió filas a un anónimo`).toHaveLength(0)
  }
})

// ═══ LAS CUATRO TABLAS DE «OPERACIÓN» — LA FUGA QUE ENCONTRÓ ESTA SOLAPA (19/08/2026) ═══
//
// Pedidos, compras, herramientas y movimientos alimentan la solapa Operación de la obra, y las
// cuatro tenían la misma policy de lectura: `for select to authenticated using (TRUE)`. La pantalla
// filtraba por obra; la base, no. Un jefe acotado a UNA obra por `usuario_obra` podía leer las ocho
// con un GET desde las devtools.
//
// Ninguna de las cuatro tiene `obra_canonica_id`: guardan el nombre como texto y se resuelven por
// `norm_obra()` contra `obra_alias`, el mismo diccionario que usa `obra_costo_real`. Ver
// `20260819T0200_rls_por_obra_en_operacion.sql`.
//
// Este test NO comprueba "devuelve pocas filas": comprueba que devuelva MENOS que administración y
// más que cero. Un test contra un número fijo se pondría verde el día que la tabla se vacíe.
const TABLAS_OPERACION = [
  'costos_obra', 'pedidos_materiales', 'herramientas', 'movimientos_herramienta',
] as const

test('las tablas de Operación filtran por obra en la BASE, no sólo en la pantalla', async () => {
  test.setTimeout(120000)
  const jefe = await entrar(JEFE.email, JEFE.password)
  const admin = await entrar(ADMIN.email, ADMIN.password)

  for (const tabla of TABLAS_OPERACION) {
    const deJefe = await comoUsuario(jefe, `${tabla}?select=id`)
    const deAdmin = await comoUsuario(admin, `${tabla}?select=id`)

    expect(deAdmin.length, `${tabla}: administración no ve nada, el test no puede medir`).toBeGreaterThan(0)
    expect(deJefe.length,
      `${tabla}: el jefe de obra ve las ${deJefe.length} filas de TODAS las obras — la policy volvió a ser using(true)`)
      .toBeLessThan(deAdmin.length)
    // Y el caso positivo: si viera CERO, el filtro estaría de más y no se distinguiría de una tabla
    // sin permisos. Su obra tiene datos en las cuatro.
    expect(deJefe.length, `${tabla}: el jefe no ve NADA de su propia obra`).toBeGreaterThan(0)
  }
})

test('sin sesión, las tablas de Operación no devuelven una sola fila', async () => {
  test.setTimeout(60000)
  for (const tabla of TABLAS_OPERACION) {
    const r = await fetch(`${URL}/rest/v1/${tabla}?select=id`, { headers: { apikey: ANON } })
    expect(r.status, `${tabla} contesta ${r.status} sin sesión`).toBe(401)
  }
})
