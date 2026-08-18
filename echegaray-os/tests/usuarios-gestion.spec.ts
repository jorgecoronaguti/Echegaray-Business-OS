import { test, expect, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { entrarComo } from './util/login'
import { motivoParaNoCambiarRol, motivoParaNoDesactivar } from '../src/features/usuarios/services/reglas'

// GESTIÓN DE USUARIOS — EL CIRCUITO COMPLETO, MEDIDO EN LA BASE.
//
// El dueño (19/08/2026), textual: *"Un usuario Obras jamás debe poder obtener datos restringidos
// aunque manipule URL/API"*.
//
// ═══ POR QUÉ LA PANTALLA NO ALCANZA COMO EVIDENCIA ═══
//
// Que la lista de obras aparezca vacía después de quitar una asignación no prueba nada: puede estar
// vacía porque el componente no pintó, porque el middleware redirigió, o porque de verdad la base
// dejó de devolver filas. Sólo la tercera es seguridad. Por eso cada paso de este recorrido se hace
// EN LA WEB —que es lo que va a usar Administración— y se verifica contra PostgREST con el token de
// la persona afectada, que es lo que puede hacer cualquiera con las devtools abiertas.
//
// El recorrido es el que pidió el dueño, entero:
//
//   se crea la cuenta desde la web  →  entra al sistema y NO ve ninguna obra
//   se le asigna una obra           →  la ve EN LA BASE, con el token que ya tenía
//   se le quita la obra             →  deja de verla EN LA BASE
//   se le saca el acceso            →  no puede ni entrar (`user_banned`)
//   se le devuelve el acceso        →  vuelve a entrar
//
// ═══ LA CUENTA ES PROPIA DEL TEST, Y NO LA DE QA ═══
//
// `autorizacion-por-obra.spec.ts` reescribe las asignaciones de `qa.jefe.obra@ecsas.com.ar` para
// montar su escenario, y Playwright corre los archivos EN PARALELO. Compartir esa cuenta haría que
// los dos specs se pisaran las filas y fallaran de a ratos, culpando al RLS de un choque entre
// tests. Esta cuenta la crea el propio recorrido —que además es la funcionalidad que hay que
// probar— y se borra al final.

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL as string
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
const SRV = process.env.SUPABASE_SERVICE_ROLE_KEY as string

const ADMIN = {
  email: 'jorge.o.corona+direccion-test-1783513222134@gmail.com',
  password: 'TestPassword123!',
}
/** Toda cuenta de este recorrido lleva este prefijo: hace el borrado inequívoco. */
const PREFIJO = 'zz.e2e.usuarios'
const EMAIL_NUEVO = `${PREFIJO}+${Date.now()}@ecsas.com.ar`

// ESTE ARCHIVO CORRE EN ORDEN Y EN UN SOLO WORKER.
//
// `fullyParallel: true` reparte también los tests de un mismo archivo entre workers, y acá eso
// rompe dos cosas: el test de escalada usa la cuenta que crea el recorrido, y el `afterAll` la
// borra. Repartidos, un worker borraría la cuenta mientras otro la está usando — y el rojo diría
// «no existe la cuenta» en vez de nombrar el problema real.
test.describe.configure({ mode: 'serial' })

const servicio = () => createClient(URL, SRV, { auth: { persistSession: false } })

/** Un GET a PostgREST con el token de una persona. Devuelve las filas, o [] si la base dijo que no. */
async function comoUsuario(token: string, consulta: string): Promise<unknown[]> {
  const r = await fetch(`${URL}/rest/v1/${consulta}`, {
    headers: { apikey: ANON, Authorization: `Bearer ${token}` },
  })
  const j = await r.json()
  return Array.isArray(j) ? j : []
}

/**
 * ABRIR UN PANEL — CLICK HASTA QUE LA PÁGINA ESTÉ VIVA.
 *
 * El panel lo abre estado de React, y un click sobre el botón ANTES de que hidrate no hace nada:
 * Playwright lo da por bueno —el botón existe, es visible y clickeable— y el test se queda esperando
 * un panel que nadie pidió. Es un rojo que no señala ningún defecto del producto. Se reintenta hasta
 * que el panel aparece, que es la única señal de que el componente ya está escuchando.
 */
async function abrirPanel(page: Page, boton: string, panel: string) {
  await expect(async () => {
    await page.getByTestId(boton).click()
    await expect(page.getByTestId(panel)).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 90_000 })
}

/** El login crudo contra el proveedor de auth: interesa el CÓDIGO, no una excepción del SDK. */
async function login(email: string, password: string): Promise<{ estado: number; token?: string; codigo?: string }> {
  const r = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const j = await r.json()
  return { estado: r.status, token: j.access_token, codigo: j.error_code }
}

test.afterAll(async () => {
  // Las cuentas de este recorrido no sobreviven a la corrida: `on delete cascade` en `usuario_obra`
  // y en `perfiles` se lleva todo lo que colgaba de ellas.
  const admin = servicio()
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 })
  for (const u of data?.users ?? []) {
    if (u.email?.startsWith(PREFIJO)) await admin.auth.admin.deleteUser(u.id)
  }
})

// ═══ LAS DOS PUERTAS QUE DEJARÍAN AL SISTEMA SIN ADMINISTRADORES ═══
//
// Se prueban sobre la función pura y no por la pantalla a propósito: es la MISMA función que corre
// del lado del servidor antes de escribir, y probarla acá no exige dejar al sistema real sin
// administradores para ver si se puede. Si alguien saca el chequeo de `usuariosActions.ts`, estos
// tests siguen verdes y por eso además hay dos comprobaciones en la pantalla, más abajo.

const CUENTA = { actorId: 'yo', objetivoId: 'otro', rolActual: 'administracion' as const, adminsActivos: 3 }

test('nadie se saca el acceso ni se cambia el rol a sí mismo', () => {
  const propia = { ...CUENTA, objetivoId: 'yo' }
  expect(motivoParaNoDesactivar(propia)).toContain('a vos mismo')
  expect(motivoParaNoCambiarRol(propia, 'jefe_obra')).toContain('a vos mismo')
  // Sobre otra persona, con administradores de sobra, no hay impedimento.
  expect(motivoParaNoDesactivar(CUENTA)).toBeNull()
  expect(motivoParaNoCambiarRol(CUENTA, 'jefe_obra')).toBeNull()
})

test('no se puede apagar al último administrador activo, ni sacándole el acceso ni bajándole el rol', () => {
  const ultimo = { ...CUENTA, adminsActivos: 1 }
  expect(motivoParaNoDesactivar(ultimo)).toContain('última cuenta de Administración')
  expect(motivoParaNoCambiarRol(ultimo, 'jefe_obra')).toContain('última cuenta de Administración')
  // Pero sí se le puede cambiar el rol DENTRO del nivel: sigue habiendo un administrador.
  expect(motivoParaNoCambiarRol(ultimo, 'direccion')).toBeNull()
  // Y un jefe de obra no es el último administrador de nada.
  expect(motivoParaNoDesactivar({ ...ultimo, rolActual: 'jefe_obra' })).toBeNull()
})

test('crear · asignar obra · quitarla · sacar el acceso — cada paso verificado en la base', async ({ page }) => {
  test.setTimeout(180_000)
  const admin = servicio()

  // La obra del caso positivo TIENE que tener actividades: si no, "ve su obra" pasaría por vacío y
  // estaría probando lo contrario de lo que dice probar.
  const { data: panel } = await admin.from('obra_panel')
    .select('obra_id, n_actividades').order('n_actividades', { ascending: false }).limit(2)
  const obraId = panel![0].obra_id as string
  const obraAjena = panel![1].obra_id as string
  expect(panel![0].n_actividades, 'la obra del caso positivo no tiene actividades').toBeGreaterThan(0)

  // ── 1 · SE CREA LA CUENTA DESDE LA WEB ────────────────────────────────────────────────────────
  await entrarComo(page, ADMIN.email, ADMIN.password)
  await page.goto('/administracion/usuarios')
  await abrirPanel(page, 'abrir-alta', 'panel-alta')
  await page.fill('[data-testid="form-alta"] input[name="nombre"]', 'ZZ-E2E Jefe Prestado')
  await page.fill('[data-testid="form-alta"] input[name="email"]', EMAIL_NUEVO)
  await page.selectOption('[data-testid="form-alta"] select[name="rol"]', 'jefe_obra')
  await page.getByTestId('crear-usuario').click()

  const credencial = page.getByTestId('credencial-nueva')
  await expect(credencial).toBeVisible({ timeout: 30_000 })
  const clave = /Clave:\s*(\S+)/.exec(await credencial.innerText())?.[1]
  expect(clave, 'la pantalla no mostró la clave temporal').toBeTruthy()

  // El efecto está en la base, no en la pantalla: la cuenta existe y tiene su rol.
  const { data: lista } = await admin.auth.admin.listUsers({ perPage: 1000 })
  const nuevo = lista?.users.find((u) => u.email === EMAIL_NUEVO)
  expect(nuevo, 'la cuenta no llegó a auth').toBeTruthy()
  const { data: perfil } = await admin.from('perfiles').select('rol').eq('id', nuevo!.id).maybeSingle()
  expect(perfil?.rol).toBe('jefe_obra')

  // ── 2 · ENTRA, Y TODAVÍA NO VE NINGUNA OBRA ───────────────────────────────────────────────────
  const sesion = await login(EMAIL_NUEVO, clave!)
  expect(sesion.estado, 'la cuenta recién creada no puede entrar con su clave temporal').toBe(200)
  const token = sesion.token!
  expect(await comoUsuario(token, 'obra_canonica?select=id'),
    'una cuenta sin asignaciones ya ve obras: el RLS no está filtrando').toHaveLength(0)

  // ── 3 · SE LE ASIGNA UNA OBRA DESDE LA WEB → LA VE EN LA BASE ─────────────────────────────────
  await page.getByTestId('cerrar-alta').click()
  await abrirPanel(page, `fila-${EMAIL_NUEVO}`, 'panel-usuario')
  await page.selectOption('[data-testid="form-asignar-obra"] select[name="obra_canonica_id"]', obraId)
  await page.click('[data-testid="form-asignar-obra-enviar"]')
  await expect(page.getByTestId(`quitar-obra-${obraId}`)).toBeVisible({ timeout: 30_000 })

  // MISMO TOKEN que antes: lo que cambió es la BASE, no la sesión. Si esto pasara sólo con un login
  // nuevo, la asignación estaría viviendo en el JWT y no en la tabla que consultan las policies.
  expect(await comoUsuario(token, 'obra_canonica?select=id'),
    'la obra asignada desde la web no le abrió la obra en la base').toEqual([{ id: obraId }])
  expect(await comoUsuario(token, `obra_actividad?obra_id=eq.${obraId}&select=id`)).not.toHaveLength(0)
  // Y sólo la suya: la de al lado sigue cerrada.
  expect(await comoUsuario(token, `obra_canonica?id=eq.${obraAjena}&select=id`)).toHaveLength(0)
  expect(await comoUsuario(token, `obra_panel?obra_id=eq.${obraAjena}&select=obra_id`)).toHaveLength(0)

  // ── 4 · SE LE QUITA LA OBRA DESDE LA WEB → DEJA DE VERLA EN LA BASE ───────────────────────────
  await page.getByTestId(`quitar-obra-${obraId}`).click()
  await expect(page.getByTestId(`quitar-obra-${obraId}`)).toHaveCount(0, { timeout: 30_000 })

  expect(await comoUsuario(token, 'obra_canonica?select=id'),
    'le quitaron la obra en la pantalla y la sigue viendo en la base').toHaveLength(0)
  expect(await comoUsuario(token, `obra_actividad?obra_id=eq.${obraId}&select=id`)).toHaveLength(0)
  expect(await comoUsuario(token, `obra_panel?obra_id=eq.${obraId}&select=obra_id`)).toHaveLength(0)

  // ── 5 · SE LE SACA EL ACCESO → NO PUEDE NI ENTRAR ─────────────────────────────────────────────
  await page.getByTestId('quitar-acceso').click()
  await expect(page.getByTestId('dar-acceso')).toBeVisible({ timeout: 30_000 })

  const bloqueado = await login(EMAIL_NUEVO, clave!)
  expect(bloqueado.estado, 'una cuenta sin acceso sigue pudiendo entrar').toBe(400)
  expect(bloqueado.codigo).toBe('user_banned')

  // ── 6 · Y SE LE DEVUELVE ──────────────────────────────────────────────────────────────────────
  await page.getByTestId('dar-acceso').click()
  await expect(page.getByTestId('quitar-acceso')).toBeVisible({ timeout: 30_000 })
  expect((await login(EMAIL_NUEVO, clave!)).estado,
    'le devolvieron el acceso y sigue sin poder entrar').toBe(200)
})

test('el nivel Obras no puede darse a sí mismo una obra ni un rol, ni por la API', async () => {
  test.setTimeout(120_000)
  const admin = servicio()
  const { data: lista } = await admin.auth.admin.listUsers({ perPage: 1000 })
  const yo = lista?.users.find((u) => u.email?.startsWith(PREFIJO))
  expect(yo, 'este test corre después del recorrido, que es el que crea la cuenta').toBeTruthy()

  // La clave temporal no viaja entre tests: se le pone una conocida para poder entrar.
  const clave = 'ZZ-E2E-Escalada-99!'
  await admin.auth.admin.updateUserById(yo!.id, { password: clave, ban_duration: 'none' })
  const token = (await login(yo!.email!, clave)).token!
  expect(token).toBeTruthy()

  const { data: obras } = await admin.from('obra_canonica').select('id').limit(1)
  const obraId = obras![0].id as string
  const escribir = async (tabla: string, cuerpo: unknown, metodo = 'POST') => {
    const r = await fetch(`${URL}/rest/v1/${tabla}`, {
      method: metodo,
      headers: {
        apikey: ANON, Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json', Prefer: 'return=representation',
      },
      body: JSON.stringify(cuerpo),
    })
    return r.status
  }

  // ASIGNARSE UNA OBRA: es la escalada obvia que abre esta funcionalidad. La policy
  // `usuario_obra_write` exige `es_administracion()`, así que la base tiene que rechazarlo.
  const alta = await escribir('usuario_obra', { usuario_id: yo!.id, obra_canonica_id: obraId, papel: 'jefe' })
  expect(alta, `pudo asignarse la obra ${obraId} solo (HTTP ${alta})`).toBeGreaterThanOrEqual(400)

  // PROMOVERSE A DIRECCIÓN: `perfiles` no tiene policy de escritura, y por eso el rol sólo se cambia
  // desde el servidor. Sin este rechazo, todo lo demás daría igual.
  const promocion = await escribir(`perfiles?id=eq.${yo!.id}`, { rol: 'direccion' }, 'PATCH')
  expect(promocion, `pudo cambiarse el rol solo (HTTP ${promocion})`).toBeGreaterThanOrEqual(400)

  // Y el efecto: la base quedó igual.
  const { data: uo } = await admin.from('usuario_obra').select('id').eq('usuario_id', yo!.id)
  expect(uo ?? [], 'quedó una asignación que se hizo a sí mismo').toHaveLength(0)
  const { data: p } = await admin.from('perfiles').select('rol').eq('id', yo!.id).maybeSingle()
  expect(p?.rol).toBe('jefe_obra')
  expect(await comoUsuario(token, 'obra_canonica?select=id')).toHaveLength(0)
  expect(await comoUsuario(token, 'clientes?select=id')).toHaveLength(0)
})


test('la pantalla no ofrece cambiarse el rol ni sacarse el acceso a uno mismo', async ({ page }) => {
  test.setTimeout(120_000)
  await entrarComo(page, ADMIN.email, ADMIN.password)
  await page.goto('/administracion/usuarios')
  await abrirPanel(page, `fila-${ADMIN.email}`, 'panel-usuario')
  await expect(page.getByTestId('rol-propio')).toBeVisible()
  await expect(page.getByTestId('acceso-propio')).toBeVisible()
  await expect(page.getByTestId('quitar-acceso')).toHaveCount(0)
})
