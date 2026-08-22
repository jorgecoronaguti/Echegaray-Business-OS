import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { servicio, asegurarCampo, obraConDatos } from './util/identidades'

// ADMINISTRACIÓN: PERSONAS Y PROVEEDORES — LA CERRADURA, MEDIDA CONTRA POSTGREST.
//
// ═══ ESTE ARCHIVO NACE ROJO, Y ESO ES EL PUNTO ═══
//
// Mide el estado que deja `20260819T1200_administracion_personas_y_proveedores.sql`. Esa migración
// está escrita y commiteada pero NO APLICADA: `.claude/rules/migraciones.md` prohíbe que un agente
// aplique migraciones —tocan datos productivos— y quien integre decide cuándo corre. Hasta entonces
// estos tests fallan, y fallan describiendo exactamente la fuga que hay hoy.
//
// LO QUE SE MIDIÓ ANTES DE ESCRIBIRLO (19/08/2026, contra la base real, con el token del jefe de
// obra y `fetch` a PostgREST — o sea, lo que puede hacer cualquiera con las devtools abiertas):
//
//     personas?select=nombre_completo,cuil,dni,retribucion_pactada  →  HTTP 200 · 3 filas
//         {"nombre_completo":"GONZALEZ EMILIANO","dni":"50945547", …}
//     proveedores?select=nombre,cuit                                →  HTTP 200 · 3 filas
//
// Un jefe de obra lee hoy el legajo entero: nombre, documento, CUIL y la retribución pactada. La
// policy decía `using (true)`. No es un permiso amplio de más: es una fuga de datos personales y
// salariales, y la única forma de verla es ésta, porque la pantalla nunca los mostró.
//
// ═══ POR QUÉ NO SE PRUEBA EN EL NAVEGADOR ═══
//
// Igual que `autorizacion-por-obra.spec.ts`: una página vacía puede estar vacía porque el
// middleware redirigió, porque el componente no pintó, o porque la base dijo que no. Sólo la
// tercera es seguridad. El middleware es la puerta; esto mide la cerradura.

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL as string
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
const SRV = process.env.SUPABASE_SERVICE_ROLE_KEY as string

// ═══ EL MODELO CAMBIÓ EL 19/08/2026 Y ESTOS DOS TESTS SE REESCRIBIERON EL 20/08 ═══
//
// El dueño: *"quiero que los usuarios con permisos de «jefe de obra» pueda acceder a administracion,
// solo no quiero que vean los montos de venta de las obras. pero necesito que puedan hacer todo lo
// demas"* → `20260819T4900` metió a `jefe_obra` dentro de `es_administracion()`.
//
// Dos tests de este archivo medían el aislamiento con el token del jefe. Desde ese día el jefe no
// está aislado: los rojos no eran una cerradura rota, eran un supuesto vencido. **El único rol que
// la RLS acota es `campo`**, y con ése se miden ahora las pruebas negativas. Nada se relajó: la
// mitad negativa quedó igual de estricta con la identidad correcta, y se agregó la mitad positiva
// —que el jefe SÍ llega— para que revertir el modelo en silencio se ponga rojo acá.
const JEFE = { email: 'qa.jefe.obra@ecsas.com.ar', password: 'TestJefe123!' }
const CAMPO = { email: 'qa.campo@ecsas.com.ar', password: 'TestCampo123!' }
const ADMIN = {
  email: 'jorge.o.corona+direccion-test-1783513222134@gmail.com',
  password: 'TestPassword123!',
}

async function entrar(email: string, password: string): Promise<string> {
  const sb = createClient(URL, ANON)
  const { data, error } = await sb.auth.signInWithPassword({ email, password })
  if (error || !data.session) throw new Error(`no pude entrar como ${email}: ${error?.message}`)
  return data.session.access_token
}

/** Un GET a PostgREST con el token de una persona. Devuelve el status y las filas. */
async function comoUsuario(token: string, consulta: string) {
  const r = await fetch(`${URL}/rest/v1/${consulta}`, {
    headers: { apikey: ANON, Authorization: `Bearer ${token}` },
  })
  const j = await r.json()
  return { status: r.status, filas: Array.isArray(j) ? (j as unknown[]) : [], cuerpo: j }
}

// La cuenta de campo y su obra, resueltas igual que en `autorizacion-por-obra.spec.ts`. Los dos
// archivos corren en paralelo y los dos la necesitan: `obraConDatos()` es determinística y
// `asegurarCampo()` es idempotente, así que el segundo en llegar no mueve nada. Sin esto, el otro
// spec le cambiaba la obra a este usuario a mitad de este archivo y el rojo no era de nadie.
test.beforeAll(async () => {
  const admin = servicio()
  await asegurarCampo(admin, await obraConDatos(admin))
})

test.describe('lo de Administración es de Administración', () => {
  test('el nivel CAMPO consulta lo operativo, pero no el legajo ni el sueldo', async () => {
    test.setTimeout(120000)
    const campo = await entrar(CAMPO.email, CAMPO.password)

    // ═══ ESTE TEST CAMBIÓ TRES VECES, Y LAS TRES POR EL DUEÑO ═══
    //
    // 19/08 mañana: *"La política anterior quedó DEMASIADO restrictiva… Un usuario Obras debe poder
    // consultar clientes, contactos, personas, proveedores… VER INFORMACIÓN OPERATIVA ≠ ADMINISTRAR
    // EL MAESTRO."* → se abrió `personas` con `using (true)`.
    //
    // 19/08 tarde, en el pliego de PERSONAL / HH: *"OBRAS: **ve las personas relacionadas con SUS
    // obras**."* Más específico, no contradictorio: acota QUÉ FILAS, que es lo único que la RLS
    // decide.
    //
    // 19/08 noche: el jefe de obra pasó a ser Administración. El criterio de arriba no se cayó —se
    // mide igual—, pero quien está acotado ahora es `campo`.
    //
    // `proveedores` NO cambió nunca: el maestro de proveedores no tiene eje de obra, y quien está en
    // la obra necesita saber a quién se le compra.
    const proveedores = await comoUsuario(campo, 'proveedores?select=id&limit=5')
    expect(proveedores.filas.length, 'proveedores le devolvió CERO filas a un usuario de campo')
      .toBeGreaterThan(0)

    // LA MEDIDA ES CONTRA LA RELACIÓN, NO CONTRA UN NÚMERO FIJO. Lo que puede leer de `personas`
    // tiene que ser EXACTAMENTE la gente ligada a las obras que ve. Un `toBeGreaterThan(0)` pasaría
    // igual si mañana se abriera el legajo entero.
    // LOS DOS CAMINOS, no uno: `personas_select` liga por `obra_asignacion` **o** por tener horas
    // cargadas en una obra que se ve. Mirar sólo el primero acusaba de fuga a quien está ahí con
    // todo derecho.
    const suyas = await comoUsuario(campo, 'personas?select=id')
    expect(suyas.status, 'personas falló para un usuario de campo').toBe(200)
    const ligadas = await comoUsuario(campo, 'obra_asignacion?select=persona_id')
    const conHoras = await comoUsuario(campo, 'registros_hh?select=persona_id')
    const esperadas = new Set([
      ...(ligadas.filas as { persona_id: string }[]).map((f) => f.persona_id),
      ...(conHoras.filas as { persona_id: string }[]).map((f) => f.persona_id),
    ])
    const leidas = new Set((suyas.filas as { id: string }[]).map((f) => f.id))
    for (const id of leidas) {
      expect(esperadas.has(id), `leyó del legajo a alguien que no trabaja en sus obras: ${id}`)
        .toBe(true)
    }

    // Y el plantel COMPLETO le sigue llegando por la vista acotada: sin eso no puede haber una
    // primera asignación, porque todavía no está ligado a su obra.
    const plantel = await comoUsuario(campo, 'persona_plantel?select=id')
    expect(plantel.filas.length, 'sin plantel no hay a quién asignar').toBeGreaterThan(leidas.size)

    // Y LA LÍNEA QUE NO SE CRUZA: pedir el sueldo tiene que FALLAR, no devolver null. Un null se
    // confunde con "no está cargado"; un 403 no se confunde con nada.
    for (const q of ['personas?select=retribucion_pactada&limit=1', 'personas?select=dni&limit=1',
      'personas?select=cuil&limit=1', 'personas?select=*&limit=1']) {
      const r = await comoUsuario(campo, q)
      expect(r.status, `${q} NO falló para un usuario de campo`).toBe(403)
    }

    // Y `persona_legajo` —la puerta con portero por la que Administración SÍ llega al DNI— no le
    // devuelve una sola fila. El filtro vive DENTRO de la vista: una vista no tiene RLS, así que si
    // el `where es_administracion()` no estuviera, esto pasaría con las 66 filas.
    const legajo = await comoUsuario(campo, 'persona_legajo?select=id,dni&limit=5')
    expect(legajo.filas.length, 'persona_legajo le publicó el legajo a un usuario de campo').toBe(0)

    // La COLA de canonicalización tampoco: no es información operativa, es la resolución de un
    // maestro. Las vistas filtran en su propio `where` — una vista no tiene RLS, así que si el
    // filtro no estuviera adentro esto pasaría igual y no probaría nada.
    for (const vista of ['proveedor_nombre_pendiente', 'proveedor_nombre_resuelto']) {
      const r = await comoUsuario(campo, `${vista}?select=*&limit=5`)
      expect(r.filas.length, `${vista} se le publicó a un usuario de campo`).toBe(0)
    }
  })

  test('el jefe de obra SÍ administra el legajo y la cola de proveedores', async () => {
    test.setTimeout(120000)
    const jefe = await entrar(JEFE.email, JEFE.password)

    // La mitad positiva de lo de arriba, y la decisión del 19/08 escrita como test. Sin esto, cerrar
    // el legajo para todos pondría este archivo verde y dejaría a Administración sin trabajar.
    const legajo = await comoUsuario(jefe, 'persona_legajo?select=id,dni&limit=5')
    expect(legajo.filas.length,
      'el jefe de obra perdió el legajo: se revirtió la decisión del dueño').toBeGreaterThan(0)
    const cola = await comoUsuario(jefe, 'proveedor_nombre_pendiente?select=*&limit=5')
    expect(cola.status, 'la cola de canonicalización le falló al jefe de obra').toBe(200)

    // Pero el sueldo no sale por la API para NADIE: el grant por columna de `personas` no incluye
    // `retribucion_pactada`, y `persona_legajo` tampoco la publica. Administrar el legajo no es ver
    // lo que cobra cada uno.
    expect((await comoUsuario(jefe, 'personas?select=retribucion_pactada&limit=1')).status,
      'la retribución pactada salió por la API').toBe(403)
    expect((await comoUsuario(jefe, 'persona_legajo?select=retribucion_pactada&limit=1')).status,
      'persona_legajo creció y ahora publica el sueldo').toBeGreaterThanOrEqual(400)
  })

  test('el nivel OBRAS SÍ ve el plantel para poder asignar, pero sin un solo dato sensible', async () => {
    test.setTimeout(120000)
    const jefe = await entrar(JEFE.email, JEFE.password)

    // La contracara del test anterior. Cerrar `personas` a secas rompería la pantalla de Personal de
    // la obra: sin nombres no hay a quién asignar. Por eso existe `persona_plantel`.
    const plantel = await comoUsuario(jefe, 'persona_plantel?select=id,nombre_completo,categoria&limit=5')
    expect(plantel.filas.length, 'el jefe de obra se quedó sin plantel: TabPersonal queda vacío').toBeGreaterThan(0)

    // Y ESTO ES LO QUE HACE QUE LA VISTA SEA SEGURA: pedir una columna sensible tiene que FALLAR,
    // no devolverla en null. Si la vista creciera de columnas algún día, este test se pone rojo.
    const sensible = await comoUsuario(jefe, 'persona_plantel?select=retribucion_pactada,cuil,dni&limit=1')
    expect(sensible.status, 'persona_plantel expone columnas del legajo').toBeGreaterThanOrEqual(400)
  })

  test('el maestro de proveedores lo escribe quien administra, y nadie más', async () => {
    test.setTimeout(120000)
    const admin = createClient(URL, SRV, { auth: { persistSession: false } })
    const campo = await entrar(CAMPO.email, CAMPO.password)
    const jefe = await entrar(JEFE.email, JEFE.password)
    const marca = `ZZ-E2E proveedor ${Date.now()}`

    const crear = async (token: string, nombre: string) => {
      const r = await fetch(`${URL}/rest/v1/proveedores`, {
        method: 'POST',
        headers: {
          apikey: ANON, Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json', Prefer: 'return=representation',
        },
        body: JSON.stringify({ nombre }),
      })
      return r.status
    }

    try {
      // LA MITAD NEGATIVA, con la identidad que de verdad está acotada.
      expect(await crear(campo, `${marca} campo`),
        'un usuario de campo pudo crear un proveedor').toBe(403)

      // Y LA MITAD POSITIVA, que es la decisión del dueño del 19/08 escrita como test: el jefe de
      // obra administra. Sin ella, cerrar `proveedores` para todos dejaría este archivo verde y
      // Administración sin poder trabajar — el defecto opuesto, y silencioso.
      expect(await crear(jefe, `${marca} jefe`),
        'el jefe de obra no pudo crear un proveedor: se revirtió la decisión del 19/08').toBe(201)
    } finally {
      // Lo que el test crea, el test lo saca. Un `ZZ-E2E` olvidado termina en el maestro real: ya
      // pasó, y se encontró semanas después.
      await admin.from('proveedores').delete().like('nombre', 'ZZ-E2E%')
    }
  })

  test('Administración sí lee las dos secciones', async () => {
    test.setTimeout(120000)
    const admin = await entrar(ADMIN.email, ADMIN.password)
    // Administración llega al legajo por `persona_legajo`: el grant por columna le niega `dni` y
    // `cuil` a `authenticated`, que es UN SOLO rol de Postgres para los cuatro roles de la
    // aplicación. Sin esa vista, cerrar la columna habría dejado ciega también a Administración.
    const personas = await comoUsuario(admin, 'persona_legajo?select=id,dni,cuil&limit=5')
    expect(personas.filas.length, 'Administración se quedó sin legajo').toBeGreaterThan(0)
    const proveedores = await comoUsuario(admin, 'proveedores?select=id&limit=5')
    expect(proveedores.filas.length, 'Administración se quedó sin proveedores').toBeGreaterThan(0)
  })
})

test.describe('la identidad del proveedor la impone la base, no el formulario', () => {
  // Estas pruebas escriben y BORRAN lo que escribieron. Se usa service_role a propósito: no se está
  // midiendo el permiso (eso es el bloque de arriba) sino la restricción de integridad, que tiene
  // que valer incluso para quien tiene todos los permisos. Una regla que sólo se cumple desde la
  // pantalla no es una regla: el sincronizador del Sheet y cualquier script la esquivan.

  test('dos proveedores con el mismo CUIT no pueden existir', async () => {
    test.setTimeout(120000)
    const admin = createClient(URL, SRV, { auth: { persistSession: false } })
    const cuit = '30500001234'
    const marca = `ZZ-E2E identidad ${Date.now()}`
    const creados: string[] = []

    try {
      const primero = await admin.from('proveedores').insert({ nombre: `${marca}-A`, cuit }).select('id').single()
      expect(primero.error, `no pude crear el proveedor de prueba: ${primero.error?.message}`).toBeNull()
      creados.push(primero.data!.id as string)

      const segundo = await admin.from('proveedores').insert({ nombre: `${marca}-B`, cuit }).select('id').single()
      expect(segundo.error, 'la base aceptó DOS proveedores con el mismo CUIT').not.toBeNull()
      expect(segundo.error?.code, 'el rechazo no fue por el índice único').toBe('23505')
      if (segundo.data) creados.push((segundo.data as { id: string }).id)

      // Y el CUIT mal formado tampoco entra: con guiones dejaría de cruzar contra ARCA.
      const sucio = await admin.from('proveedores').insert({ nombre: `${marca}-C`, cuit: '30-50000123-4' }).select('id').single()
      expect(sucio.error, 'la base aceptó un CUIT con guiones').not.toBeNull()
      if (sucio.data) creados.push((sucio.data as { id: string }).id)
    } finally {
      // AUTOLIMPIEZA: la prueba deja el mundo como lo encontró.
      for (const id of creados) await admin.from('proveedores').delete().eq('id', id)
      const quedan = await admin.from('proveedores').select('id').like('nombre', `${marca}%`)
      expect(quedan.data?.length ?? 0, 'la prueba dejó proveedores colgados').toBe(0)
    }
  })

  test('un nombre del Sheet se resuelve UNA vez, y "no es un proveedor" no lleva proveedor', async () => {
    test.setTimeout(120000)
    const admin = createClient(URL, SRV, { auth: { persistSession: false } })
    const nombre = `ZZ-E2E nombre ${Date.now()}`
    const creados: string[] = []
    let proveedorId: string | null = null

    try {
      const prov = await admin.from('proveedores').insert({ nombre: `${nombre}-PROV` }).select('id').single()
      expect(prov.error).toBeNull()
      proveedorId = prov.data!.id as string

      const a = await admin.from('proveedor_alias')
        .insert({ nombre_norm: nombre, nombre_origen: nombre, proveedor_id: proveedorId, estado: 'vinculado' })
        .select('id').single()
      expect(a.error, `no pude resolver el nombre: ${a.error?.message}`).toBeNull()
      creados.push(a.data!.id as string)

      // El mismo texto mandado a DOS proveedores distintos duplicaría el costo en los dos.
      const b = await admin.from('proveedor_alias')
        .insert({ nombre_norm: nombre, nombre_origen: nombre, proveedor_id: proveedorId, estado: 'vinculado' })
        .select('id').single()
      expect(b.error, 'el mismo nombre del Sheet se pudo resolver dos veces').not.toBeNull()
      if (b.data) creados.push((b.data as { id: string }).id)

      // Un "vinculado" sin destino sería un vínculo a la nada, y volvería como pendiente para siempre.
      const c = await admin.from('proveedor_alias')
        .insert({ nombre_norm: `${nombre}-X`, nombre_origen: nombre, proveedor_id: null, estado: 'vinculado' })
        .select('id').single()
      expect(c.error, 'entró un vínculo sin proveedor').not.toBeNull()
      if (c.data) creados.push((c.data as { id: string }).id)

      // Y "no es un proveedor" con un proveedor colgado es la contradicción inversa.
      const d = await admin.from('proveedor_alias')
        .insert({ nombre_norm: `${nombre}-Y`, nombre_origen: nombre, proveedor_id: proveedorId, estado: 'no_es_proveedor' })
        .select('id').single()
      expect(d.error, 'entró un "no es proveedor" apuntando a un proveedor').not.toBeNull()
      if (d.data) creados.push((d.data as { id: string }).id)
    } finally {
      for (const id of creados) await admin.from('proveedor_alias').delete().eq('id', id)
      if (proveedorId) await admin.from('proveedores').delete().eq('id', proveedorId)
      const quedan = await admin.from('proveedor_alias').select('id').like('nombre_norm', `${nombre}%`)
      expect(quedan.data?.length ?? 0, 'la prueba dejó alias colgados').toBe(0)
    }
  })

  test('resolver un nombre lo saca de la cola de pendientes — el efecto, leído en la base', async () => {
    test.setTimeout(120000)
    const admin = createClient(URL, SRV, { auth: { persistSession: false } })

    // Se toma un pendiente REAL de la cola y se lo resuelve; después tiene que desaparecer de la
    // vista. Es el circuito que le importa a Administración: resolver algo y que la lista baje.
    const antes = await admin.from('proveedor_nombre_pendiente').select('nombre_norm, nombre_origen')
    expect(antes.error, `no pude leer la cola: ${antes.error?.message}`).toBeNull()
    const cola = antes.data ?? []

    // ═══ UN `test.skip` SOBRE UNA COLA VACÍA TAPÓ UN DEFECTO REAL (19/08/2026) ═══
    //
    // Acá vivía `test.skip(cola.length === 0)`. La vista cerraba su `where` con
    // `and es_administracion()`, y ese predicado busca un perfil por `auth.uid()`: la SERVICE KEY no
    // tiene usuario, así que devolvía CERO sobre una cola de 79 nombres por $382,8M. El recorrido se
    // reportaba como SALTEADO —nunca como roto— y ocupaba el lugar de la evidencia.
    //
    // El skip se reemplaza por el cruce con la FUENTE: si en `costos_obra` hay nombres sin dueño
    // canónico y la vista devuelve cero, eso no es "nada que resolver", es la vista rota. Y si el
    // dueño resuelve los 79, los dos lados dan cero y el test se saltea con razón.
    const crudos = await admin.from('costos_obra').select('proveedor').not('proveedor', 'is', null)
    const distintos = new Set((crudos.data ?? [])
      .map((r) => ((r as { proveedor: string }).proveedor ?? '').trim().toUpperCase())
      .filter(Boolean))
    if (cola.length === 0) {
      expect(distintos.size, 'la cola devolvió CERO pero Compras tiene nombres de proveedor: la vista está filtrando de más').toBe(0)
      test.skip(true, 'no hay nombres pendientes: nada que resolver')
    }

    const elegido = cola[0] as { nombre_norm: string; nombre_origen: string }
    const prov = await admin.from('proveedores').insert({ nombre: `ZZ-E2E cola ${Date.now()}` }).select('id').single()
    expect(prov.error).toBeNull()
    const provId = prov.data!.id as string
    let aliasId: string | null = null

    try {
      const a = await admin.from('proveedor_alias').insert({
        nombre_norm: elegido.nombre_norm,
        nombre_origen: elegido.nombre_origen,
        proveedor_id: provId,
        estado: 'vinculado',
      }).select('id').single()
      expect(a.error, `no pude vincular: ${a.error?.message}`).toBeNull()
      aliasId = a.data!.id as string

      const despues = await admin.from('proveedor_nombre_pendiente').select('nombre_norm')
      const sigue = (despues.data ?? []).some((f) => (f as { nombre_norm: string }).nombre_norm === elegido.nombre_norm)
      expect(sigue, 'el nombre resuelto siguió apareciendo como pendiente').toBe(false)
      expect((despues.data ?? []).length, 'la cola no bajó').toBe(cola.length - 1)
    } finally {
      if (aliasId) await admin.from('proveedor_alias').delete().eq('id', aliasId)
      await admin.from('proveedores').delete().eq('id', provId)
      // Y el pendiente TIENE que volver: si no volviera, el "deshacer" de la pantalla no serviría.
      const final = await admin.from('proveedor_nombre_pendiente').select('nombre_norm')
      expect((final.data ?? []).length, 'la cola no volvió a su estado original').toBe(cola.length)
    }
  })
})
