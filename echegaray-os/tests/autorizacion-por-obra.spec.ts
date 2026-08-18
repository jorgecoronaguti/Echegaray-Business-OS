import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { entrarComo } from './util/login'

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

  // 3 · LO QUE ES DE OTRA OBRA, TAMPOCO — Y LO QUE ES DE LA SUYA, SÍ.
  //
  // Este bloque exigía cero clientes, cero cliente_panel y cero certificados. El dueño corrigió la
  // política el 19/08: *"La política anterior quedó DEMASIADO restrictiva."* Los maestros pasaron a
  // ser consultables (lo mide `el nivel Obras consulta los maestros que necesita para trabajar`) y
  // lo que queda acotado por obra son los HECHOS de cada obra. Un certificado ajeno sigue sin
  // llegar: `certificados_select` es `ve_obra(obra_canonica_id)`.
  expect(await comoUsuario(token, `certificados?obra_canonica_id=eq.${ajena}&select=id`)).toHaveLength(0)
  expect(await comoUsuario(token, `obra_documento?obra_id=eq.${ajena}&select=obra_id`)).toHaveLength(0)
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

// ═══ LO COMERCIAL NO SALE DE POSTGRES PARA EL NIVEL OBRAS (19/08/2026) ═══
//
// El dueño, textual: *"«Contratado» sólo puede verlo Administración. **No alcanza con ocultar la
// columna. El dato no debe viajar al usuario Obras desde query/API/server component.**"*
//
// Por eso este test NO abre el navegador ni mira la tabla: le pregunta a PostgREST con el token del
// jefe de obra —que es lo que puede hacer cualquiera con las devtools abiertas— y exige que la
// columna venga NULL. Un test que mirara la pantalla se pondría verde con el dato viajando en el
// payload del server component.
//
// Y CARGA UN VALOR PARA MEDIR. Hoy las ocho obras tienen `monto_contratado` nulo: sin escribir uno,
// el test no distingue "enmascarado" de "no hay dato" y pasaría con la protección rota. Se escribe,
// se mide, se revierte — y se verifica que quedó revertido.
test('el monto contratado NO llega al nivel Obras: se enmascara en la base, no en la pantalla', async () => {
  test.setTimeout(120000)
  const admin = createClient(URL, SRV, { auth: { persistSession: false } })
  const OBRA_DEL_JEFE = 'san-francisco'
  const CENTINELA = 123456789

  const { data: antes } = await admin.from('obra_canonica')
    .select('monto_contratado').eq('id', OBRA_DEL_JEFE).single()
  const original = antes?.monto_contratado ?? null

  try {
    await admin.from('obra_canonica').update({ monto_contratado: CENTINELA }).eq('id', OBRA_DEL_JEFE)

    const jefe = await entrar(JEFE.email, JEFE.password)
    const deJefe = await comoUsuario(jefe,
      `obra_panel?select=obra_id,monto_contratado,costo_real&obra_id=eq.${OBRA_DEL_JEFE}`) as Array<Record<string, unknown>>
    expect(deJefe.length, 'el jefe no ve su propia obra: el escenario no mide nada').toBe(1)
    expect(deJefe[0].monto_contratado,
      'EL MONTO CONTRATADO LLEGÓ AL NIVEL OBRAS desde la API — la máscara de obra_panel se rompió').toBeNull()
    // El caso positivo: el costo real SÍ tiene que llegar. Sin esto, un `select` que devolviera todo
    // en null —una vista rota— pasaría como si estuviera bien protegida.
    expect(deJefe[0].costo_real, 'el jefe tampoco ve el costo real de su obra: se enmascaró de más').not.toBeNull()

    // Y la contraparte: Administración SÍ lo recibe. Si no, la máscara está apagando a todos y el
    // test de arriba no prueba nada.
    const adm = await entrar(ADMIN.email, ADMIN.password)
    const deAdmin = await comoUsuario(adm,
      `obra_panel?select=monto_contratado&obra_id=eq.${OBRA_DEL_JEFE}`) as Array<Record<string, unknown>>
    expect(Number(deAdmin[0].monto_contratado), 'Administración no recibe el contratado').toBe(CENTINELA)

    // ── LA LÍNEA FINA (19/08/2026) ──────────────────────────────────────────────────────────────
    //
    // El dueño corrigió la política: *"La única información expresamente secreta para Obras es:
    // PRESUPUESTO TOTAL / CONTRATADO TOTAL DE LA OBRA + cualquier cálculo que permita deducirlo
    // directamente."* Certificación, facturación y cobranza pasaron a ser operativas y SE VEN.
    //
    // `pendiente_certificar` no: es `contratado − certificado`. Con el certificado a la vista,
    // publicarlo publica el contrato con una resta de primer grado. Ésa es la distinción que este
    // test fija, y es la que se rompe sola si alguien "destapa una columna más".
    const plan = await comoUsuario(jefe,
      `obra_plan_vs_real?select=monto_contratado,monto_presupuestado,margen_actual,margen_esperado,pendiente_certificar,certificado,hh_real&obra_id=eq.${OBRA_DEL_JEFE}`) as Array<Record<string, unknown>>
    for (const col of ['monto_contratado', 'monto_presupuestado', 'margen_actual', 'margen_esperado',
      'pendiente_certificar']) {
      expect(plan[0][col], `obra_plan_vs_real.${col} llegó al nivel Obras`).toBeNull()
    }

    // ── Y LA TABLA DE ABAJO, QUE ES DONDE ESTABA LA FUGA REAL ───────────────────────────────────
    //
    // Medido el 19/08 ANTES de la migración T1600: `presupuestos?select=monto_presupuestado` le
    // devolvía 200 y DOS FILAS CON VALOR a este mismo token. El enmascarado vivía en la vista y la
    // tabla estaba abierta. La RLS no puede cortar por columna: lo que corta es el GRANT por
    // columna, y por eso ahora la respuesta correcta es 403 y no una fila en null.
    for (const q of [`obra_canonica?select=monto_contratado&id=eq.${OBRA_DEL_JEFE}`,
      'presupuestos?select=monto_presupuestado', 'presupuestos?select=margen_esperado',
      'obra_canonica?select=*', 'personas?select=retribucion_pactada']) {
      const r = await fetch(`${URL}/rest/v1/${q}`, { headers: { apikey: ANON, Authorization: `Bearer ${jefe}` } })
      expect(r.status, `${q} NO dio 403 con el token de un jefe de obra`).toBe(403)
    }
  } finally {
    await admin.from('obra_canonica').update({ monto_contratado: original }).eq('id', OBRA_DEL_JEFE)
    const { data: despues } = await admin.from('obra_canonica')
      .select('monto_contratado').eq('id', OBRA_DEL_JEFE).single()
    expect(despues?.monto_contratado ?? null,
      'quedó el centinela del test escrito en el contrato de una obra real').toBe(original)
  }
})

// ═══ OBRAS OPERA: LO QUE ANTES DABA CERO Y AHORA TIENE QUE DAR FILAS (19/08/2026) ═══
//
// El dueño, textual: *"La política anterior quedó DEMASIADO restrictiva… Un usuario Obras debe poder
// consultar clientes, contactos, personas, proveedores, certificados… VER INFORMACIÓN OPERATIVA ≠
// ADMINISTRAR EL MAESTRO."*
//
// Este test es el reverso exacto del que vivía acá antes, que exigía CERO en las cinco. Se reemplaza
// entero en vez de borrarse: una capacidad que se abre sin quedar medida se cierra sola la próxima
// vez que alguien "endurezca la seguridad".
test('el nivel Obras consulta los maestros que necesita para trabajar', async () => {
  test.setTimeout(60000)
  const token = await entrar(JEFE.email, JEFE.password)
  for (const q of ['clientes?select=id', 'cliente_panel?select=cliente_id',
    'personas?select=id', 'proveedores?select=id', 'persona_plantel?select=id']) {
    expect(await comoUsuario(token, q),
      `${q} le devolvió CERO filas a un jefe de obra: no puede operar`).not.toHaveLength(0)
  }
})

// Y el contrapeso: consultar no es administrar. La escritura de los maestros sigue siendo de
// Administración, y eso se prueba INTENTÁNDOLO, no leyendo la policy.
test('el nivel Obras consulta los maestros pero no los administra', async () => {
  test.setTimeout(60000)
  const token = await entrar(JEFE.email, JEFE.password)
  const intentos: Array<[string, string, Record<string, unknown>]> = [
    ['clientes',    'POST',  { nombre: 'ZZ-E2E cliente que no debe existir' }],
    ['proveedores', 'POST',  { nombre: 'ZZ-E2E proveedor que no debe existir' }],
    ['personas',    'POST',  { nombre_completo: 'ZZ-E2E persona que no debe existir' }],
  ]
  for (const [tabla, metodo, cuerpo] of intentos) {
    const r = await fetch(`${URL}/rest/v1/${tabla}`, {
      method: metodo,
      headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(cuerpo),
    })
    expect(r.status, `un jefe de obra pudo escribir en ${tabla} (${r.status})`).toBeGreaterThanOrEqual(400)
  }
})


// ═══ LA PANTALLA NO PUEDE EXPLICAR UNA AUSENCIA QUE NO ES UNA AUSENCIA (19/08/2026) ═══
//
// La solapa Economía dibujaba «Contratado —» con la explicación *"Nadie lo cargó todavía"* al lado.
// Para Administración es verdad. Para un jefe de obra es MENTIRA: el contrato puede estar cargado y
// él no puede verlo. Una explicación falsa de una ausencia fabrica un hecho, que es lo único que
// este sistema no puede hacer.
//
// La protección sigue estando en Postgres —la columna ni llega—; esto mide que el cartel tampoco
// mienta. Y mide el CASO POSITIVO en la misma pasada: costo y certificación SÍ se dibujan, porque
// un test que sólo comprueba ausencias se pone verde con la pantalla rota.
test('Economía no le inventa una explicación al nivel Obras, y le deja lo suyo', async ({ page }) => {
  test.setTimeout(120000)
  await entrarComo(page, JEFE.email, JEFE.password)
  await page.goto('/obras/san-francisco?vista=economia')

  await expect(page.getByTestId('economia-costo'),
    'el jefe no ve el costo de su obra: se enmascaró de más').toBeVisible()
  await expect(page.getByTestId('economia-certificacion'),
    'el jefe no ve la certificación de su obra, que el dueño declaró operativa').toBeVisible()
  await expect(page.getByTestId('economia-contrato'),
    'el bloque Contrato se le dibujó a un jefe de obra').toHaveCount(0)
  await expect(page.getByTestId('economia-resultado'),
    'el bloque Resultado (margen) se le dibujó a un jefe de obra').toHaveCount(0)
  // Y que no quede el rastro en el HTML servido: el payload del server component es leíble.
  expect(await page.content(), 'la palabra «Contratado» viajó en el HTML del nivel Obras')
    .not.toContain('Contratado')
})
