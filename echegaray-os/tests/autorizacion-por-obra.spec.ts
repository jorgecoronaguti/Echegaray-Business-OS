import { test, expect } from '@playwright/test'
import { entrarComo } from './util/login'
import {
  URL, ANON, CAMPO, JEFE, ADMIN, servicio, entrar, pedir, escribir, obraConDatos, asegurarCampo,
} from './util/identidades'

// AUTORIZACIÓN POR OBRA — LAS PRUEBAS, CONTRA POSTGREST DIRECTO.
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
// ═══ EL MODELO CAMBIÓ EL 19/08/2026, Y ESTE ARCHIVO SE REESCRIBIÓ EL 20/08 ═══
//
// El dueño: *"quiero que los usuarios con permisos de «jefe de obra» pueda acceder a administracion,
// solo no quiero que vean los montos de venta de las obras. pero necesito que puedan hacer todo lo
// demas"* → `20260819T4900`: `es_administracion()` incluye a `jefe_obra`, y `ve_obra()` le devuelve
// true para todas las obras.
//
// Diez tests de este repo seguían midiendo el aislamiento por obra con el token del jefe. Quedaron
// rojos, y la lectura fácil —"se rompió la seguridad"— era falsa: lo que se rompió fue el supuesto
// del test. **El único rol que la RLS acota por obra es `campo`**, así que las pruebas negativas de
// alcance se miden con `campo`, que es la identidad que de verdad está acotada.
//
// No se relajó ninguna aserción: cada una que cambió de identidad quedó igual de estricta, y se
// AGREGARON las que fijan lo que el modelo nuevo afirma —que el jefe llega a todo salvo el precio—,
// para que un día que alguien vuelva atrás en silencio, esto se ponga rojo.
//
// ═══ LO QUE ESTE ARCHIVO ENCONTRÓ CUANDO SE ESCRIBIÓ ═══
//
// Las vistas `obra_panel`, `obra_avance`, `obra_plan_vs_real` y `cliente_panel` no tenían
// `security_invoker`, así que corrían con los permisos de su dueño y SALTABAN el RLS de las tablas.
// Toda la web lee por esas vistas: las policies estrictas habrían sido exactamente la seguridad
// cosmética que el pedido prohíbe. Ver `20260818T2330_usuario_obra_y_rls_por_obra.sql`.

/** La obra del usuario de campo. Se resuelve una vez, contra los datos, antes de todo. */
let OBRA_CAMPO = ''

test.beforeAll(async () => {
  const admin = servicio()
  OBRA_CAMPO = await obraConDatos(admin)
  await asegurarCampo(admin, OBRA_CAMPO)
})

test('el nivel CAMPO ve su obra y NADA más — medido contra la base, no contra la pantalla', async () => {
  test.setTimeout(120000)
  const admin = servicio()

  // La obra asignada TIENE actividades y comprobantes —lo garantiza `obraConDatos`—: si no, el caso
  // positivo pasaría por vacío y estaría probando lo contrario de lo que dice probar.
  const { data: panel } = await admin.from('obra_panel').select('obra_id').neq('obra_id', OBRA_CAMPO).limit(1)
  const ajena = (panel ?? [])[0]?.obra_id as string
  expect(ajena, 'no hay una segunda obra contra la cual medir').toBeTruthy()

  const token = await entrar(CAMPO.email, CAMPO.password)

  // 1 · SU OBRA, SÍ.
  const suyas = await pedir(token, 'obra_canonica?select=id')
  expect(suyas.filas.map((o) => (o as { id: string }).id)).toEqual([OBRA_CAMPO])
  expect((await pedir(token, `obra_actividad?obra_id=eq.${OBRA_CAMPO}&select=id`)).filas).not.toHaveLength(0)

  // 2 · LA OBRA AJENA, NO — ni por la tabla ni por la VISTA, que es por donde lee la web entera.
  for (const q of [`obra_canonica?id=eq.${ajena}&select=id`,
    `obra_panel?obra_id=eq.${ajena}&select=obra_id,costo_real`,
    `obra_actividad?obra_id=eq.${ajena}&select=id`,
    `obra_plan_vs_real?obra_id=eq.${ajena}&select=obra_id`,
    `certificados?obra_canonica_id=eq.${ajena}&select=id`,
    `obra_documento?obra_id=eq.${ajena}&select=obra_id`]) {
    expect((await pedir(token, q)).filas, `${q} le llegó a un usuario de campo`).toHaveLength(0)
  }
})

// ═══ Y LA CONTRACARA, QUE ES LA DECISIÓN DEL 19/08 ESCRITA COMO TEST ═══
//
// Sin esto, alguien puede volver `es_administracion()` a su forma vieja y NADA se pondría rojo: los
// tests de aislamiento seguirían verdes —miden `campo`— y el jefe se quedaría afuera de
// Administración en silencio, que es justo lo que el dueño pidió que no pasara.
test('el jefe de obra llega a TODAS las obras: es Administración desde el 19/08', async () => {
  test.setTimeout(120000)
  const admin = servicio()
  const { count } = await admin.from('obra_canonica').select('id', { count: 'exact', head: true })

  const jefe = await entrar(JEFE.email, JEFE.password)
  expect((await pedir(jefe, 'obra_canonica?select=id')).filas,
    'el jefe de obra dejó de ver la cartera entera: se revirtió la decisión del dueño').toHaveLength(count!)
  expect((await pedir(jefe, 'obra_panel?select=obra_id')).filas).toHaveLength(count!)
  // Y las cuatro tablas operativas, por el mismo motivo.
  for (const tabla of ['costos_obra', 'pedidos_materiales', 'herramientas', 'movimientos_herramienta']) {
    const direccion = await entrar(ADMIN.email, ADMIN.password)
    expect((await pedir(jefe, `${tabla}?select=id`)).filas.length,
      `${tabla}: el jefe ve menos que Dirección, y desde el 19/08 tiene que ver lo mismo`)
      .toBe((await pedir(direccion, `${tabla}?select=id`)).filas.length)
  }
})

test('el nivel ADMINISTRACIÓN ve todas las obras y la cartera entera', async () => {
  test.setTimeout(120000)
  const admin = servicio()
  const { count } = await admin.from('obra_canonica').select('id', { count: 'exact', head: true })

  const token = await entrar(ADMIN.email, ADMIN.password)
  expect((await pedir(token, 'obra_canonica?select=id')).filas).toHaveLength(count!)
  expect((await pedir(token, 'obra_panel?select=obra_id')).filas).toHaveLength(count!)
  expect((await pedir(token, 'clientes?select=id')).filas).not.toHaveLength(0)
})

test('sin sesión la base no devuelve una sola fila del módulo', async () => {
  // El `anon` es la llave que viaja en el JavaScript de la página: la tiene cualquiera que abra las
  // devtools. Que el middleware mande al login no dice nada sobre esto.
  for (const q of ['obra_canonica?select=id', 'obra_panel?select=obra_id', 'obra_actividad?select=id',
    'clientes?select=id', 'cliente_panel?select=cliente_id', 'obra_plan_vs_real?select=obra_id']) {
    expect((await pedir(ANON, q)).filas, `${q} devolvió filas a un anónimo`).toHaveLength(0)
  }
})

// ═══ LAS CUATRO TABLAS DE «OPERACIÓN» — LA FUGA QUE ENCONTRÓ ESTA SOLAPA (19/08/2026) ═══
//
// Pedidos, compras, herramientas y movimientos alimentan la solapa Operación de la obra, y las
// cuatro tenían la misma policy de lectura: `for select to authenticated using (TRUE)`. La pantalla
// filtraba por obra; la base, no. Cualquiera acotado a UNA obra podía leer las diecisiete con un GET
// desde las devtools.
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
  const campo = await entrar(CAMPO.email, CAMPO.password)
  const admin = await entrar(ADMIN.email, ADMIN.password)

  for (const tabla of TABLAS_OPERACION) {
    const deCampo = (await pedir(campo, `${tabla}?select=id`)).filas
    const deAdmin = (await pedir(admin, `${tabla}?select=id`)).filas

    expect(deAdmin.length, `${tabla}: administración no ve nada, el test no puede medir`).toBeGreaterThan(0)
    expect(deCampo.length,
      `${tabla}: el usuario de campo ve las ${deCampo.length} filas de TODAS las obras — la policy volvió a ser using(true)`)
      .toBeLessThan(deAdmin.length)
    // Y el caso positivo: si viera CERO, el filtro estaría de más y no se distinguiría de una tabla
    // sin permisos. Su obra tiene datos en las cuatro — lo garantiza `obraConDatos`.
    expect(deCampo.length, `${tabla}: el usuario de campo no ve NADA de su propia obra`).toBeGreaterThan(0)
  }
})

test('sin sesión, las tablas de Operación no devuelven una sola fila', async () => {
  test.setTimeout(60000)
  for (const tabla of TABLAS_OPERACION) {
    const r = await fetch(`${URL}/rest/v1/${tabla}?select=id`, { headers: { apikey: ANON } })
    expect(r.status, `${tabla} contesta ${r.status} sin sesión`).toBe(401)
  }
})

// ═══ EL ESPEJO DE COMPRAS NO LO ESCRIBE NADIE CON SESIÓN (20/08/2026) ═══
//
// `costos_obra` nació con `insert … with check (true)` y `update … using (true)`. Medido con tokens
// reales el 20/08, ANTES de corregirlo:
//
//     campo (su obra)     PATCH 204 → REESCRIBIÓ el costo · POST 201 → INSERTÓ una compra inventada
//     campo (obra ajena)  PATCH 204 → no escribió        · POST 201 → INSERTÓ en una obra que NI VE
//     jefe_obra           PATCH 204 → REESCRIBIÓ         · POST 201 → INSERTÓ
//     direccion           PATCH 204 → REESCRIBIÓ         · POST 201 → INSERTÓ
//
// El UPDATE quedaba tapado a medias por la policy de SELECT —Postgres exige poder leer la fila para
// actualizarla cuando la referencia un `where`—, así que el agujero se veía más chico de lo que era.
// El INSERT no tenía nada que lo tapara. Y no es un permiso de más: `obra_costo_real` suma
// `costos_obra` sin mirar `origen`, mientras el sync sólo borra las filas de `origen='compras_sheet'`.
// Una fila inyectada con otro origen infla el costo de esa obra PARA SIEMPRE.
//
// La tabla es el ESPEJO de la pestaña «Compras» del Flujo de Caja: la fuente es el Sheet, y escribir
// el espejo desde la web se perdería en el próximo sync sin avisar. Por eso no se acota la
// escritura, se RETIRA. Ver `20260820T4000_el_espejo_de_compras_no_se_escribe_desde_la_web.sql`.
test('nadie con sesión escribe el espejo de Compras — ni Dirección', async () => {
  test.setTimeout(120000)
  const admin = servicio()
  const CENTINELA = 999999999

  const tokenCampo = await entrar(CAMPO.email, CAMPO.password)
  const identidades: Array<[string, string]> = [
    ['campo', tokenCampo],
    ['jefe de obra', await entrar(JEFE.email, JEFE.password)],
    ['dirección', await entrar(ADMIN.email, ADMIN.password)],
  ]

  // Una fila de una obra que el usuario de campo NO tiene asignada: así el caso más filoso —insertar
  // o pisar el costo de una obra que ni se ve— queda medido y no supuesto. Se resuelve por lo que el
  // token DEVUELVE, no por el nombre de la obra: el texto es libre y emparejarlo a mano miente.
  const suyas = new Set((await pedir(tokenCampo, 'costos_obra?select=id')).filas
    .map((f) => (f as { id: string }).id))
  const { data: todas } = await admin.from('costos_obra').select('id, obra_texto, total').limit(1000)
  const ajena = (todas ?? []).find((f) => !suyas.has((f as { id: string }).id)) as
    { id: string; obra_texto: string; total: number } | undefined
  expect(ajena, 'no hay una compra de otra obra contra la cual medir').toBeTruthy()

  try {
    for (const [quien, token] of identidades) {
      expect(await escribir(token, `costos_obra?id=eq.${ajena!.id}`, 'PATCH', { total: CENTINELA }),
        `${quien} pudo reescribir el costo de una compra`).toBe(403)
      expect(await escribir(token, `costos_obra?id=eq.${ajena!.id}`, 'PATCH', { obra_texto: 'OTRA' }),
        `${quien} pudo mover una compra de obra`).toBe(403)
      expect(await escribir(token, 'costos_obra', 'POST',
        { obra_texto: ajena!.obra_texto, total: 1, concepto: 'ZZ-E2E', origen: 'zz_e2e' }),
        `${quien} pudo inventar una compra`).toBe(403)
      expect(await escribir(token, `costos_obra?id=eq.${ajena!.id}`, 'DELETE'),
        `${quien} pudo borrar una compra`).toBeGreaterThanOrEqual(400)

      // EL CASO POSITIVO, sin el cual todo esto pasaría con la tabla sin grant de lectura: quien
      // administra sigue LEYENDO el costo. Cerrar la escritura no puede cerrar la lectura.
      expect((await pedir(token, 'costos_obra?select=id&limit=5')).status,
        `${quien} perdió la lectura del costo real`).toBe(200)
    }

    // Y el efecto, leído en la base y no en el status: nada cambió y nada entró.
    const { data: despues } = await admin.from('costos_obra').select('total').eq('id', ajena!.id).single()
    expect(Number(despues!.total), 'el centinela quedó escrito en una compra real').toBe(Number(ajena!.total))
    const { count } = await admin.from('costos_obra')
      .select('id', { count: 'exact', head: true }).eq('origen', 'zz_e2e')
    expect(count, 'entró una compra inventada al espejo').toBe(0)
  } finally {
    await admin.from('costos_obra').update({ total: ajena!.total, obra_texto: ajena!.obra_texto }).eq('id', ajena!.id)
    await admin.from('costos_obra').delete().eq('origen', 'zz_e2e')
  }
})

// ═══ LO COMERCIAL NO SALE DE POSTGRES PARA EL NIVEL OBRAS (19/08/2026) ═══
//
// El dueño, textual: *"«Contratado» sólo puede verlo Administración. **No alcanza con ocultar la
// columna. El dato no debe viajar al usuario Obras desde query/API/server component.**"*
//
// ESTA LÍNEA NO LA MOVIÓ EL CAMBIO DEL 19/08. El jefe de obra pasó a administrar, pero
// `ve_economia()` sigue siendo `direccion | administracion`: la línea no es «administra / no
// administra», es **COSTO / PRECIO**. Ve lo que gastó su obra; no ve lo que se vendió.
//
// Por eso este test NO abre el navegador ni mira la tabla: le pregunta a PostgREST con el token del
// jefe de obra —que es lo que puede hacer cualquiera con las devtools abiertas— y exige que la
// columna venga NULL.
//
// Y CARGA UN VALOR PARA MEDIR. Sin escribir uno, el test no distingue "enmascarado" de "no hay dato"
// y pasaría con la protección rota. Se escribe, se mide, se revierte — y se verifica que quedó
// revertido.
test('el monto contratado NO llega al jefe de obra: se enmascara en la base, no en la pantalla', async () => {
  test.setTimeout(120000)
  const admin = servicio()
  const OBRA = 'san-francisco'
  const CENTINELA = 123456789

  const { data: antes } = await admin.from('obra_canonica')
    .select('monto_contratado').eq('id', OBRA).single()
  const original = antes?.monto_contratado ?? null

  try {
    await admin.from('obra_canonica').update({ monto_contratado: CENTINELA }).eq('id', OBRA)

    const jefe = await entrar(JEFE.email, JEFE.password)
    const deJefe = (await pedir(jefe,
      `obra_panel?select=obra_id,monto_contratado,costo_real&obra_id=eq.${OBRA}`)).filas as Array<Record<string, unknown>>
    expect(deJefe.length, 'el jefe no ve la obra: el escenario no mide nada').toBe(1)
    expect(deJefe[0].monto_contratado,
      'EL MONTO CONTRATADO LLEGÓ AL JEFE DE OBRA desde la API — la máscara de obra_panel se rompió').toBeNull()
    // El caso positivo: el costo real SÍ tiene que llegar. Sin esto, un `select` que devolviera todo
    // en null —una vista rota— pasaría como si estuviera bien protegida.
    expect(deJefe[0].costo_real, 'el jefe tampoco ve el costo real: se enmascaró de más').not.toBeNull()

    // Y la contraparte: Dirección SÍ lo recibe. Si no, la máscara está apagando a todos y el test de
    // arriba no prueba nada.
    const adm = await entrar(ADMIN.email, ADMIN.password)
    const deAdmin = (await pedir(adm,
      `obra_panel?select=monto_contratado&obra_id=eq.${OBRA}`)).filas as Array<Record<string, unknown>>
    expect(Number(deAdmin[0].monto_contratado), 'Dirección no recibe el contratado').toBe(CENTINELA)

    // ── LA LÍNEA FINA (19/08/2026) ──────────────────────────────────────────────────────────────
    //
    // El dueño corrigió la política: *"La única información expresamente secreta para Obras es:
    // PRESUPUESTO TOTAL / CONTRATADO TOTAL DE LA OBRA + cualquier cálculo que permita deducirlo
    // directamente."* Certificación, facturación y cobranza pasaron a ser operativas y SE VEN.
    //
    // `pendiente_certificar` no: es `contratado − certificado`. Con el certificado a la vista,
    // publicarlo publica el contrato con una resta de primer grado. Ésa es la distinción que este
    // test fija, y es la que se rompe sola si alguien "destapa una columna más".
    const plan = (await pedir(jefe,
      `obra_plan_vs_real?select=monto_contratado,monto_presupuestado,margen_actual,margen_esperado,pendiente_certificar,certificado,hh_real&obra_id=eq.${OBRA}`)).filas as Array<Record<string, unknown>>
    for (const col of ['monto_contratado', 'monto_presupuestado', 'margen_actual', 'margen_esperado',
      'pendiente_certificar']) {
      expect(plan[0][col], `obra_plan_vs_real.${col} llegó al jefe de obra`).toBeNull()
    }

    // ── Y LA TABLA DE ABAJO, QUE ES DONDE ESTABA LA FUGA REAL ───────────────────────────────────
    //
    // Medido el 19/08 ANTES de la migración T1600: `presupuestos?select=monto_presupuestado` le
    // devolvía 200 y DOS FILAS CON VALOR a este mismo token. El enmascarado vivía en la vista y la
    // tabla estaba abierta. La RLS no puede cortar por columna: lo que corta es el GRANT por
    // columna, y por eso ahora la respuesta correcta es 403 y no una fila en null.
    for (const q of [`obra_canonica?select=monto_contratado&id=eq.${OBRA}`,
      'presupuestos?select=monto_presupuestado', 'presupuestos?select=margen_esperado',
      'obra_canonica?select=*', 'personas?select=retribucion_pactada']) {
      expect((await pedir(jefe, q)).status, `${q} NO dio 403 con el token de un jefe de obra`).toBe(403)
    }
  } finally {
    await admin.from('obra_canonica').update({ monto_contratado: original }).eq('id', OBRA)
    const { data: despues } = await admin.from('obra_canonica')
      .select('monto_contratado').eq('id', OBRA).single()
    expect(despues?.monto_contratado ?? null,
      'quedó el centinela del test escrito en el contrato de una obra real').toBe(original)
  }
})

// ═══ OBRAS OPERA: LO QUE ANTES DABA CERO Y AHORA TIENE QUE DAR FILAS (19/08/2026) ═══
//
// El dueño, textual: *"La política anterior quedó DEMASIADO restrictiva… Un usuario Obras debe poder
// consultar clientes, contactos, personas, proveedores, certificados… VER INFORMACIÓN OPERATIVA ≠
// ADMINISTRAR EL MAESTRO."*
test('el jefe de obra consulta los maestros que necesita para trabajar', async () => {
  test.setTimeout(60000)
  const token = await entrar(JEFE.email, JEFE.password)
  for (const q of ['clientes?select=id', 'cliente_panel?select=cliente_id',
    'proveedores?select=id', 'persona_plantel?select=id']) {
    expect((await pedir(token, q)).filas,
      `${q} le devolvió CERO filas a un jefe de obra: no puede operar`).not.toHaveLength(0)
  }
})

// ═══ EL LEGAJO: QUIÉN VE A QUIÉN ═══
//
// Antes del 19/08 esto se medía con el jefe y el criterio era *"ve las personas relacionadas con SUS
// obras"*. Ese criterio SIGUE VIVO y sigue siendo lo único que la RLS puede decidir —qué filas—,
// pero ahora quien está acotado es `campo`. El jefe administra: lee el legajo entero.
//
// EL TEST NO MIDE UN NÚMERO, MIDE LA RELACIÓN. Si la obra del usuario de campo no tiene a nadie
// asignado, lo correcto es CERO, y un `not.toHaveLength(0)` habría exigido abrir el legajo entero
// para ponerse verde. Lo que tiene que valer siempre es que lo que lee sea exactamente la gente
// ligada a sus obras: ni una fila más, y todas las que sí.
test('el nivel CAMPO ve del legajo a su gente, y a nadie más', async () => {
  test.setTimeout(60000)
  const token = await entrar(CAMPO.email, CAMPO.password)

  // LOS DOS CAMINOS POR LOS QUE UNA PERSONA SE LIGA A UNA OBRA, no uno. `personas_select` es
  // `es_administracion() OR existe en obra_asignacion de una obra que veo OR tiene horas cargadas en
  // una obra que veo`. Mirar sólo `obra_asignacion` hacía que el test acusara de fuga a alguien que
  // está ahí con todo derecho: la primera corrida marcó a una persona que llega por sus horas.
  const legajo = (await pedir(token, 'personas?select=id')).filas as { id: string }[]
  const ligadas = (await pedir(token, 'obra_asignacion?select=persona_id')).filas as { persona_id: string }[]
  const conHoras = (await pedir(token, 'registros_hh?select=persona_id')).filas as { persona_id: string }[]
  const esperadas = new Set([...ligadas.map((f) => f.persona_id), ...conHoras.map((f) => f.persona_id)])

  for (const p of legajo) {
    expect(esperadas.has(p.id), `leyó del legajo a alguien que no trabaja en sus obras: ${p.id}`).toBe(true)
  }
  // Y al revés: nadie de su obra le queda invisible, que sería el defecto opuesto —no poder ver a
  // quien tiene al lado— y también silencioso.
  for (const id of esperadas) {
    expect(legajo.some((p) => p.id === id), `no puede ver a alguien de su propia obra: ${id}`).toBe(true)
  }

  // El PLANTEL completo le sigue llegando por la vista acotada: sin esa lista no existe la primera
  // asignación, porque todavía no hay nadie ligado a su obra a quien elegir.
  const plantel = (await pedir(token, 'persona_plantel?select=id')).filas
  expect(plantel.length, 'sin plantel no hay a quién asignar').toBeGreaterThan(legajo.length)

  // Y LA PUERTA AL DATO PERSONAL SIGUE CERRADA PARA ÉL. `persona_legajo` es una VISTA: no tiene RLS,
  // su portero es el `where es_administracion()` de adentro. Si ese where se cayera, esto devolvería
  // el DNI y el CUIL de las 66 personas sin un solo error en el log.
  expect((await pedir(token, 'persona_legajo?select=id,dni&limit=5')).filas,
    'persona_legajo le publicó datos personales a un usuario de campo').toHaveLength(0)
})

// La contracara, que es la decisión del dueño escrita como test: el jefe administra el legajo.
test('el jefe de obra administra el legajo, porque es Administración', async () => {
  test.setTimeout(60000)
  const jefe = await entrar(JEFE.email, JEFE.password)
  expect((await pedir(jefe, 'persona_legajo?select=id,dni&limit=5')).filas.length,
    'el jefe perdió el legajo: se revirtió la decisión del 19/08').toBeGreaterThan(0)

  // Y LA LÍNEA QUE NO SE CRUZA NI SIENDO ADMINISTRACIÓN: la retribución pactada no sale por
  // PostgREST para NADIE — el grant por columna de `personas` no la incluye, y `persona_legajo`
  // tampoco la publica. Un 403 no se confunde con nada; un null se confunde con "no está cargado".
  expect((await pedir(jefe, 'personas?select=retribucion_pactada&limit=1')).status,
    'la retribución pactada salió por la API').toBe(403)
  expect((await pedir(jefe, 'persona_legajo?select=retribucion_pactada&limit=1')).status,
    'persona_legajo creció y ahora publica el sueldo').toBeGreaterThanOrEqual(400)
})

// ═══ CONSULTAR NO ES ADMINISTRAR — PARA QUIEN NO ADMINISTRA ═══
//
// Antes del 19/08 este test le prohibía escribir los maestros al jefe. Ya no: el dueño pidió que
// *"puedan hacer todo lo demás"*, y escribir un proveedor es exactamente eso. Así que el test cambia
// de identidad y de forma: **campo no escribe, jefe sí**, y las dos mitades se prueban INTENTÁNDOLO.
//
// La mitad positiva no es un lujo: sin ella, cerrar `proveedores` para todos pondría este archivo
// verde y rompería Administración en silencio.
test('los maestros los escribe quien administra, y nadie más', async () => {
  test.setTimeout(120000)
  const admin = servicio()
  const campo = await entrar(CAMPO.email, CAMPO.password)
  const jefe = await entrar(JEFE.email, JEFE.password)
  const marca = `ZZ-E2E ${Date.now()}`

  try {
    // 1 · CAMPO NO ESCRIBE NINGUNO DE LOS TRES.
    //
    // El payload tiene que ser VÁLIDO. Hasta el 20/08 este test mandaba `{nombre}` a `clientes`, y
    // esa columna se llama `nombre_comercial` desde `20260820T1000`: la base contestaba 400 por el
    // payload y el test lo leía como "denegado". Pasaba en verde sin medir un solo permiso.
    expect(await escribir(campo, 'clientes', 'POST', { nombre_comercial: marca }),
      'un usuario de campo pudo crear un cliente').toBe(403)
    expect(await escribir(campo, 'proveedores', 'POST', { nombre: marca }),
      'un usuario de campo pudo crear un proveedor').toBe(403)
    expect(await escribir(campo, 'personas', 'POST', { nombre_completo: marca }),
      'un usuario de campo pudo crear una persona').toBe(403)

    // 2 · EL JEFE SÍ, PORQUE ADMINISTRA.
    expect(await escribir(jefe, 'proveedores', 'POST', { nombre: `${marca} proveedor` }),
      'el jefe de obra no pudo crear un proveedor: se revirtió la decisión del 19/08').toBe(201)

    // 3 · Y EL LEGAJO TAMBIÉN, porque administrar el plantel es administrar. `personas_insert` es
    // `es_administracion()`.
    //
    // OJO CON EL 403 QUE NO ES UN 403: pedir `Prefer: return=representation` obliga a Postgres a
    // LEER la fila recién insertada, y si el SELECT no la deja pasar devuelve
    // *"new row violates row-level security policy"* — un 403 que parece una escritura denegada y
    // es una lectura denegada. Por eso `escribir()` no pide representación: mide lo que dice medir.
    expect(await escribir(jefe, 'personas', 'POST', { nombre_completo: `${marca} persona` }),
      'el jefe de obra no pudo dar de alta a una persona: se revirtió la decisión del 19/08').toBe(201)
  } finally {
    // Lo que el test crea, el test lo saca. Un `ZZ-E2E` olvidado termina en el maestro real del
    // dueño: ya pasó, y se encontró semanas después.
    await admin.from('proveedores').delete().like('nombre', 'ZZ-E2E%')
    await admin.from('clientes').delete().like('nombre_comercial', 'ZZ-E2E%')
    await admin.from('personas').delete().like('nombre_completo', 'ZZ-E2E%')
  }
})

// ═══ LA PANTALLA NO PUEDE EXPLICAR UNA AUSENCIA QUE NO ES UNA AUSENCIA (19/08/2026) ═══
//
// La solapa Economía dibujaba «Contratado —» con la explicación *"Nadie lo cargó todavía"* al lado.
// Para Dirección es verdad. Para un jefe de obra es MENTIRA: el contrato puede estar cargado y él no
// puede verlo. Una explicación falsa de una ausencia fabrica un hecho, que es lo único que este
// sistema no puede hacer.
//
// La protección sigue estando en Postgres —la columna ni llega—; esto mide que el cartel tampoco
// mienta. Y mide el CASO POSITIVO en la misma pasada: costo y certificación SÍ se dibujan, porque un
// test que sólo comprueba ausencias se pone verde con la pantalla rota.
test('Economía no le inventa una explicación al jefe de obra, y le deja lo suyo', async ({ page }) => {
  test.setTimeout(120000)
  await entrarComo(page, JEFE.email, JEFE.password)
  await page.goto('/obras/san-francisco?vista=economia')

  await expect(page.getByTestId('economia-costo'),
    'el jefe no ve el costo de su obra: se enmascaró de más').toBeVisible()
  // LA CERTIFICACIÓN NO: esta aserción decía lo contrario y estaba mal desde el 19/08. Medido con
  // el token del jefe: `obra_plan_vs_real` le manda certificado, facturado y cobrado en NULL, y
  // `certificados_select` es `ve_economia()`, o sea cero filas. Dibujarle el bloque sería mostrarle
  // cuatro guiones con la explicación «todavía no hay ninguno cargado» sobre una obra que sí puede
  // tenerlos — la explicación falsa de una ausencia, que es lo único que este sistema no puede
  // hacer. Si algún día tiene que verla, primero se mueve la policy; la pantalla va detrás.
  await expect(page.getByTestId('economia-certificacion'),
    'el bloque Certificación se le dibujó a un jefe de obra, que no recibe ni un dato de adentro').toHaveCount(0)
  await expect(page.getByTestId('economia-contrato'),
    'el bloque Contrato se le dibujó a un jefe de obra').toHaveCount(0)
  await expect(page.getByTestId('economia-resultado'),
    'el bloque Resultado (margen) se le dibujó a un jefe de obra').toHaveCount(0)
  // Y que no quede el rastro en el HTML servido: el payload del server component es leíble.
  expect(await page.content(), 'la palabra «Contratado» viajó en el HTML del nivel Obras')
    .not.toContain('Contratado')

  // EL RESUMEN, POR EL MISMO MOTIVO. La línea de margen decía *"No hay margen que calcular: falta el
  // monto contratado"*, que para un jefe de obra es una explicación falsa de una ausencia. Plazo,
  // avance, HH y costo se quedan: son su trabajo.
  await page.goto('/obras/san-francisco')
  const resumen = page.getByTestId('plan-vs-real')
  await expect(resumen).toBeVisible()
  await expect(resumen, 'la línea de margen se le dibujó a un jefe de obra').not.toContainText(/margen/i)
  await expect(resumen, 'el resumen se quedó sin la línea de costo, que sí es suya').toContainText(/costo/i)
})

// ═══ EL CHECKLIST DE PREPARACIÓN, CON UN USUARIO SIN ECONOMÍA (19/08/2026) ═══
//
// El checklist se dibuja en el Resumen de la obra y tiene una línea de Contrato. Para un jefe de
// obra, `obra_panel.monto_contratado` llega NULL: si el checklist lo leyera como respuesta, diría
// «Contrato · pendiente» sobre una obra con el contrato cargado. La línea no se dibuja para él, y
// eso se mide acá porque quien construyó el checklist no tenía credenciales de nivel Obras.
test('el checklist de preparación no le habla de contrato al jefe de obra', async ({ page }) => {
  test.setTimeout(120000)
  await entrarComo(page, JEFE.email, JEFE.password)
  await page.goto('/obras/san-francisco')

  const checklist = page.getByTestId('preparacion')
  // Puede estar plegado: lo que importa es que la línea de contrato no exista en el DOM.
  await expect(checklist).toBeVisible()
  await expect(page.getByTestId('preparacion-contrato'),
    'el checklist le dibujó la línea de Contrato a un jefe de obra').toHaveCount(0)

  // EL CASO POSITIVO, sin el cual esto pasaría con el checklist entero roto: las líneas que SÍ son
  // su trabajo están.
  for (const clave of ['cronograma', 'baseline', 'responsable', 'personal', 'hh_plan']) {
    await expect(page.getByTestId(`preparacion-${clave}`),
      `falta la línea ${clave}, que sí es trabajo de la obra`).toHaveCount(1)
  }
})

// ═══ LAS HORAS TAMBIÉN SE ACOTAN POR OBRA (MÓDULO PERSONAL / HH, 19/08/2026) ═══
//
// `registros_hh` tenía la policy de SELECT en `using (true)`: cualquiera leía por PostgREST las
// horas imputadas a las diecisiete obras. Y lo que se puede leer se puede escribir mal: sin cota, la
// carga masiva de una obra podía sembrar imputaciones en otra.
//
// Se mide INTENTÁNDOLO, no leyendo la policy: una policy correcta sin su `grant` devuelve
// `permission denied` y una policy floja con el grant puesto devuelve datos, y desde el código las
// dos se ven igual de bien.
test('el nivel CAMPO no lee ni escribe horas de una obra que no es suya', async () => {
  test.setTimeout(60000)
  const token = await entrar(CAMPO.email, CAMPO.password)
  const admin = servicio()

  // La obra que este usuario NO ve, y que TIENE horas cargadas: sin horas del otro lado, un cero
  // significaría "no hay nada que leer" en vez de "no puede leerlo".
  //
  // ═══ EL ESCENARIO SE CONSTRUYE, NO SE ENCUENTRA (20/08/2026) ═══
  //
  // La primera versión buscaba una obra ajena que YA tuviera horas cargadas. Medido hoy:
  // `registros_hh` tiene 19 filas y **las 19 con `obra_canonica_id` nulo** — ninguna hora está
  // imputada a ninguna obra. O sea que el test dependía de un dato que no existe, y las dos veces
  // que pareció encontrarlo estaba leyendo residuo de una corrida anterior de sí mismo.
  //
  // Un test de aislamiento no puede depender de que la producción tenga los datos que le convienen:
  // el día que la tabla se vacía se pone verde por vacío, que es la forma más silenciosa de mentir.
  // Así que la hora ajena la siembra el propio test, la mide, y la saca.
  const ajena = (await admin.from('obra_canonica').select('id').neq('id', OBRA_CAMPO).limit(1)
    .then((r) => r.data?.[0]?.id)) as string
  expect(ajena, 'no hay una segunda obra contra la cual medir').toBeTruthy()
  const { data: alguien } = await admin.from('personas').select('id').limit(1).single()
  const persona = (alguien as { id: string }).id

  try {
    const { error } = await admin.from('registros_hh').insert({
      obra_canonica_id: ajena, persona_id: persona,
      fecha: '2026-08-19', fecha_inicio_semana: '2026-08-17',
      horas: 8, fuente_legacy: 'ZZ-E2E autorizacion',
    })
    expect(error, `no pude sembrar la hora ajena: ${error?.message ?? ''}`).toBeNull()

    // 1 · NO LA LEE. Con la fila puesta, un cero significa "no puede", no "no hay".
    expect((await pedir(token, `registros_hh?select=id&obra_canonica_id=eq.${ajena}`)).filas,
      'un usuario de campo leyó las horas de una obra ajena').toHaveLength(0)

    // 2 · NI LA ESCRIBE.
    expect(await escribir(token, 'registros_hh', 'POST', {
      obra_canonica_id: ajena, persona_id: persona,
      fecha: '2026-08-19', fecha_inicio_semana: '2026-08-17',
      horas: 8, fuente_legacy: 'ZZ-E2E autorizacion',
    }), 'un usuario de campo pudo imputar horas a una obra ajena').toBeGreaterThanOrEqual(400)
  } finally {
    // Lo sembrado se saca, entre y no entre: esto son los jornales del dueño.
    await admin.from('registros_hh').delete().eq('fuente_legacy', 'ZZ-E2E autorizacion')
    const { count } = await admin.from('registros_hh')
      .select('id', { count: 'exact', head: true }).eq('fuente_legacy', 'ZZ-E2E autorizacion')
    expect(count, 'quedaron horas de prueba en los jornales').toBe(0)
  }
})

// ═══ LA ESCRITURA OPERATIVA SE ACOTA POR OBRA (20/08/2026) ═══
//
// Doce policies de escritura seguían en `true` con su grant puesto, y `CAMPO_RUTAS_PERMITIDAS` le
// abre a un operario las pantallas de pedidos, herramientas y movimientos —que tienen alta, edición
// y baja—. Medido con su token ANTES de `20260820T5000`, leyendo el efecto en la base: **14 desvíos
// sobre 30 casos**. Insertaba en las tres tablas apuntando a una obra que ni ve, borraba
// movimientos del historial y reimputaba comprobantes de ARCA.
//
// Estos tests miden lo mismo con identidades reales. Miran la FILA, no el status: un PATCH que no
// toca nada devuelve 204 igual que uno que escribe.

/** Escribe con el token de alguien y devuelve si la fila quedó en la base. */
async function entro(token: string, tabla: string, cuerpo: Record<string, unknown>, clave: string, valor: string) {
  const admin = servicio()
  const status = await escribir(token, tabla, 'POST', cuerpo)
  const { count } = await admin.from(tabla).select('*', { count: 'exact', head: true }).eq(clave, valor)
  await admin.from(tabla).delete().eq(clave, valor)
  return { entro: (count ?? 0) > 0, status }
}

test('el nivel CAMPO opera su obra y no puede escribir en la ajena', async () => {
  test.setTimeout(120000)
  const admin = servicio()
  const campo = await entrar(CAMPO.email, CAMPO.password)

  // Los nombres de obra tal como los escribe el Sheet, resueltos por el mismo diccionario que usa
  // la policy. Sin esto el test compararía contra un nombre inventado y mediría otra cosa.
  const { data: alias } = await admin.from('obra_alias').select('alias, obra_id').not('obra_id', 'is', null)
  const texto = (obra: string) => (alias ?? []).find((a) => (a as { obra_id: string }).obra_id === obra) as { alias: string } | undefined
  const MIA = texto(OBRA_CAMPO)?.alias
  const otra = (alias ?? []).find((a) => (a as { obra_id: string }).obra_id !== OBRA_CAMPO) as { alias: string } | undefined
  expect(MIA, 'la obra del usuario de campo no está en el diccionario: el test no mide nada').toBeTruthy()
  expect(otra, 'no hay una segunda obra en el diccionario').toBeTruthy()
  const AJENA = otra!.alias

  try {
    // 1 · PEDIDOS — el caso positivo primero: si no puede operar SU obra, lo de abajo no prueba
    // aislamiento, prueba que la tabla está cerrada para todos.
    const propio = await entro(campo, 'pedidos_materiales',
      { id_pedido: 'ZZ-E2E-p-mia', obra_texto: MIA, material: 'ZZ-E2E', cantidad: 1, origen: 'zz_e2e' },
      'id_pedido', 'ZZ-E2E-p-mia')
    expect(propio.entro, 'el usuario de campo no puede cargar un pedido de SU obra: se cerró de más').toBe(true)

    const ajeno = await entro(campo, 'pedidos_materiales',
      { id_pedido: 'ZZ-E2E-p-ajena', obra_texto: AJENA, material: 'ZZ-E2E', cantidad: 1, origen: 'zz_e2e' },
      'id_pedido', 'ZZ-E2E-p-ajena')
    expect(ajeno.entro, 'un usuario de campo cargó un pedido en una obra que no es suya').toBe(false)

    // 2 · MOVIMIENTOS — el destino se acota igual.
    const movMio = await entro(campo, 'movimientos_herramienta',
      { id_movimiento: 'ZZ-E2E-m-mia', id_herramienta: 'ZZ', destino: MIA, origen: 'zz_e2e' },
      'id_movimiento', 'ZZ-E2E-m-mia')
    expect(movMio.entro, 'el usuario de campo no puede registrar un movimiento hacia SU obra').toBe(true)

    const movAjeno = await entro(campo, 'movimientos_herramienta',
      { id_movimiento: 'ZZ-E2E-m-ajena', id_herramienta: 'ZZ', destino: AJENA, origen: 'zz_e2e' },
      'id_movimiento', 'ZZ-E2E-m-ajena')
    expect(movAjeno.entro, 'un usuario de campo fabricó un movimiento hacia una obra ajena').toBe(false)

    // 3 · HERRAMIENTAS — la de otra obra no se toca; la propia se devuelve al almacén.
    //
    // Esta segunda mitad no es un lujo: la policy de SELECT tiene que dejar ver la fila NUEVA
    // —PostgREST cierra el UPDATE con un RETURNING—, así que sin «o el lugar no es de ninguna obra»
    // devolver una herramienta al almacén daba 403 y el operario se quedaba sin poder soltarla.
    const { data: hAjena } = await admin.from('herramientas')
      .insert({ id_herramienta: 'ZZ-E2E-h-ajena', nombre: 'ZZ-E2E', ubicacion_actual: AJENA, origen: 'zz_e2e' })
      .select('id').single()
    await escribir(campo, `herramientas?id=eq.${hAjena!.id}`, 'PATCH', { ubicacion_actual: MIA })
    const { data: sigue } = await admin.from('herramientas').select('ubicacion_actual').eq('id', hAjena!.id).single()
    expect(sigue!.ubicacion_actual, 'un usuario de campo se llevó una herramienta de la obra de otro').toBe(AJENA)

    const { data: hMia } = await admin.from('herramientas')
      .insert({ id_herramienta: 'ZZ-E2E-h-mia', nombre: 'ZZ-E2E', ubicacion_actual: MIA, origen: 'zz_e2e' })
      .select('id').single()
    await escribir(campo, `herramientas?id=eq.${hMia!.id}`, 'PATCH', { ubicacion_actual: 'ALMACEN' })
    const { data: devuelta } = await admin.from('herramientas').select('ubicacion_actual').eq('id', hMia!.id).single()
    expect(devuelta!.ubicacion_actual,
      'el usuario de campo no pudo devolver al almacén una herramienta de su obra').toBe('ALMACEN')
  } finally {
    for (const t of ['pedidos_materiales', 'movimientos_herramienta', 'herramientas']) {
      await admin.from(t).delete().eq('origen', 'zz_e2e')
    }
  }
})

test('el maestro lo escribe Administración: el jefe sí, el nivel campo no', async () => {
  test.setTimeout(120000)
  const admin = servicio()
  const campo = await entrar(CAMPO.email, CAMPO.password)
  const jefe = await entrar(JEFE.email, JEFE.password)

  try {
    // Dar de ALTA una herramienta es el maestro global, no una operación de obra.
    expect((await entro(campo, 'herramientas',
      { id_herramienta: 'ZZ-E2E-alta-campo', nombre: 'ZZ-E2E', ubicacion_actual: 'ALMACEN', origen: 'zz_e2e' },
      'id_herramienta', 'ZZ-E2E-alta-campo')).entro,
    'un usuario de campo dio de alta una herramienta en el maestro').toBe(false)

    expect((await entro(jefe, 'herramientas',
      { id_herramienta: 'ZZ-E2E-alta-jefe', nombre: 'ZZ-E2E', ubicacion_actual: 'ALMACEN', origen: 'zz_e2e' },
      'id_herramienta', 'ZZ-E2E-alta-jefe')).entro,
    'el jefe de obra no pudo dar de alta una herramienta, y administra el maestro').toBe(true)

    // El maestro de clientes y el de obras: la contradicción que cerró `20260820T5000`. La pantalla
    // le ofrecía los formularios al jefe desde el 19/08 y la base los rechazaba.
    expect((await entro(campo, 'clientes', { nombre_comercial: 'ZZ-E2E cliente campo' },
      'nombre_comercial', 'ZZ-E2E cliente campo')).entro,
    'un usuario de campo creó un cliente').toBe(false)
    expect((await entro(jefe, 'clientes', { nombre_comercial: 'ZZ-E2E cliente jefe' },
      'nombre_comercial', 'ZZ-E2E cliente jefe')).entro,
    'el jefe de obra no pudo crear un cliente, y el modelo vigente dice que administra').toBe(true)

    // Y renombrar una obra, que es el mismo maestro.
    const { data: obra } = await admin.from('obra_canonica').select('id, nombre').limit(1).single()
    for (const [quien, token, esperado] of [['campo', campo, false], ['jefe', jefe, true]] as const) {
      await escribir(token, `obra_canonica?id=eq.${obra!.id}`, 'PATCH', { nombre: `ZZ-E2E ${quien}` })
      const { data: ahora } = await admin.from('obra_canonica').select('nombre').eq('id', obra!.id).single()
      const escribio = ahora!.nombre === `ZZ-E2E ${quien}`
      if (escribio) await admin.from('obra_canonica').update({ nombre: obra!.nombre }).eq('id', obra!.id)
      expect(escribio, `renombrar una obra siendo ${quien}: se esperaba ${esperado}`).toBe(esperado)
    }
    const { data: fin } = await admin.from('obra_canonica').select('nombre').eq('id', obra!.id).single()
    expect(fin!.nombre, 'quedó el nombre del test escrito en una obra real').toBe(obra!.nombre)
  } finally {
    await admin.from('herramientas').delete().eq('origen', 'zz_e2e')
    await admin.from('clientes').delete().like('nombre_comercial', 'ZZ-E2E%')
  }
})

test('un movimiento de herramienta es historial: no lo borra nadie', async () => {
  test.setTimeout(120000)
  const admin = servicio()
  const { data: mov } = await admin.from('movimientos_herramienta')
    .insert({ id_movimiento: 'ZZ-E2E-hist', id_herramienta: 'ZZ', destino: 'ALMACEN', origen: 'zz_e2e' })
    .select('id').single()

  try {
    // Si estuvo mal, se corrige con OTRO movimiento. Borrarlo lo tapa, y el historial de una
    // herramienta es lo único que dice dónde estuvo.
    for (const [quien, cred] of [['campo', CAMPO], ['jefe de obra', JEFE], ['dirección', ADMIN]] as const) {
      const token = await entrar(cred.email, cred.password)
      await escribir(token, `movimientos_herramienta?id=eq.${mov!.id}`, 'DELETE')
      const { count } = await admin.from('movimientos_herramienta')
        .select('id', { count: 'exact', head: true }).eq('id', mov!.id)
      expect(count, `${quien} borró un movimiento del historial`).toBe(1)
    }
  } finally {
    await admin.from('movimientos_herramienta').delete().eq('origen', 'zz_e2e')
  }
})
