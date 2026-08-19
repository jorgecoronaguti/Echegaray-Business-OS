import { test, expect, type Page } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { MARCA } from './util/obras-e2e'

// PERMISOS DE CONTROL DE OBRA — MEDIDOS CONTRA POSTGREST CON TOKENS REALES.
//
// ═══ POR QUÉ NO SE MIDE EN LA PANTALLA ═══
//
// Una pantalla vacía puede estar vacía por tres razones y sólo una es seguridad. Acá se pide el dato
// directo a la API con el token de cada rol: lo que devuelve la base es lo que hay, sin React en el
// medio. Es la misma forma que usa `administracion-personas-proveedores.spec.ts`.
//
// ═══ EL CORTE ES ECONÓMICO, NO POR OBRA ═══
//
// El dueño (19/08/2026): *"si dice jefe de obra en el permiso de usuario, pueda ver todas las obras"*
// · *"y editar"* · *"administración tiene acceso a todo lo relacionado a económico… jefes de obra
// puede acceder a todo lo demás"*. Estos tests miden las dos mitades de esa frase: que lo operativo
// esté abierto de par en par, y que lo económico siga cerrado.
//
// NO ESCRIBE SOBRE DATOS REALES. Ya pasó en esta sesión: una prueba de escritura pisó el comentario
// de una actividad de San Francisco. Todo lo que escribe lleva `ZZ-E2E` y se borra.

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL as string
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
const SRV = process.env.SUPABASE_SERVICE_ROLE_KEY as string
const admin = (): SupabaseClient => createClient(URL, SRV, { auth: { persistSession: false } })

async function comoJefe(): Promise<SupabaseClient> {
  const c = createClient(URL, ANON, { auth: { persistSession: false } })
  const { error } = await c.auth.signInWithPassword({
    email: 'qa.jefe.obra@ecsas.com.ar', password: 'TestJefe123!',
  })
  expect(error, error?.message).toBeNull()
  return c
}

const OBRA = 'messina'
const NOMBRE = `${MARCA} permisos`

async function limpiar() {
  const c = admin()
  const { data } = await c.from('obra_actividad').select('id').ilike('nombre', `%${MARCA} permisos%`)
  const ids = (data ?? []).map((a) => (a as { id: string }).id)
  if (ids.length) {
    await c.from('obra_ejecucion').delete().in('actividad_id', ids)
    await c.from('obra_actividad').delete().in('id', ids)
  }
}

test.beforeAll(limpiar)
test.afterAll(limpiar)

test('el jefe de obra ve TODAS las obras, no sólo las que alguien le vinculó', async () => {
  const jefe = await comoJefe()
  const { count: suyas } = await jefe.from('obra_canonica').select('id', { count: 'exact', head: true })
  const { count: todas } = await admin().from('obra_canonica').select('id', { count: 'exact', head: true })
  expect(suyas).toBe(todas)

  const { count: acts } = await jefe.from('obra_actividad_control').select('actividad_id', { count: 'exact', head: true })
  const { count: actsTodas } = await admin().from('obra_actividad_control').select('actividad_id', { count: 'exact', head: true })
  expect(acts).toBe(actsTodas)
})

test('y puede planificar y ejecutar: crea la actividad, la mide y carga el parte', async () => {
  const jefe = await comoJefe()
  const { data: creada, error: eAlta } = await jefe.from('obra_actividad').insert({
    obra_id: OBRA, nombre: NOMBRE, tipo: 'tarea', orden: 9500,
    clave: `zz-e2e/${MARCA.toLowerCase()}-permisos`, fuente: 'web', creada_en_web: true,
    unidad: 'm³', cantidad_objetivo: 100, metodo_avance: 'cantidad', estado: 'en_curso',
  }).select('id').single()
  expect(eAlta, eAlta?.message).toBeNull()
  const id = (creada as { id: string }).id

  const { error: eParte } = await jefe.from('obra_ejecucion')
    .insert({ obra_id: OBRA, actividad_id: id, fecha: new Date().toISOString().slice(0, 10), cantidad: 25 })
  expect(eParte, eParte?.message).toBeNull()

  const { data } = await jefe.from('obra_actividad_control')
    .select('avance_pct, origen_avance').eq('actividad_id', id).single()
  expect(Number((data as { avance_pct: number }).avance_pct)).toBe(25)
})

test('el monto de venta y la retribución no salen de la base ni con una llamada directa', async () => {
  const jefe = await comoJefe()

  // 42501 es «permission denied»: el grant de columna no existe, así que el dato ni siquiera sale de
  // la base. No es un filtro de React que alguien pueda saltear con una llamada directa.
  const monto = await jefe.from('obra_canonica').select('id, monto_contratado')
  expect(monto.error?.code, 'el jefe llegó al monto contratado').toBe('42501')

  // LA RETRIBUCIÓN NO SE ABRIÓ. Un sueldo no es un «monto de venta de obra», pero es el dato más
  // sensible del legajo y el dueño lo cerró con todas las letras el 19/08. Abrirlo es una línea;
  // hacerlo sin que lo pida, no.
  const sueldo = await jefe.from('personas').select('id, retribucion_pactada')
  expect(sueldo.error?.code, 'el jefe llegó a la retribución pactada').toBe('42501')
})

test('lo operativo del personal sí lo ve: el plantel para poder asignar, sin un dato sensible', async () => {
  const jefe = await comoJefe()
  const { data, error } = await jefe.from('persona_plantel').select('*').limit(1)
  expect(error).toBeNull()
  expect(data!.length).toBeGreaterThan(0)
  // Cinco columnas y ninguna más: el contrato lo fija `vistas-security-invoker.test.mjs`.
  expect(Object.keys(data![0]).sort()).toEqual(
    ['categoria', 'especialidad', 'fecha_egreso', 'id', 'nombre_completo'])
})

test('el jefe de obra entra a Administración y administra los maestros', async () => {
  const jefe = await comoJefe()
  // Lo que ADMINISTRA: personas con su legajo, cuadrillas, clientes, proveedores.
  for (const t of ['personas', 'clientes', 'proveedores', 'cuadrilla', 'documentacion_legajo']) {
    const { error } = await jefe.from(t).select('id').limit(1)
    expect(error, `${t}: ${error?.message}`).toBeNull()
  }
  // Y el legajo completo, que hasta hoy le devolvía cero filas.
  const legajo = await jefe.from('persona_legajo').select('id, dni, cuil').limit(1)
  expect(legajo.error).toBeNull()
  expect(legajo.data!.length).toBeGreaterThan(0)
})

test('EL COSTO SÍ, EL PRECIO NO — la línea exacta que pidió el dueño', async () => {
  const jefe = await comoJefe()

  // ═══ VE EL COSTO ═══ el presupuestado en la cotización y lo que se lleva gastado. Sin eso no
  // puede saber si su obra se está yendo de precio, que es su trabajo.
  const costo = await jefe.from('presupuestos')
    .select('id, costo_directo_presupuestado, costo_indirecto_presupuestado, hh_estimada').limit(1)
  expect(costo.error, 'el jefe no llegó al costo presupuestado').toBeNull()
  expect(costo.data!.length).toBeGreaterThan(0)

  const gastado = await jefe.from('obra_panel').select('obra_id, costo_real, n_comprobantes').limit(1)
  expect(gastado.error, 'el jefe no llegó a lo gastado').toBeNull()

  // ═══ NO VE EL PRECIO ═══ ni por la tabla ni por las vistas que lo derivan.
  expect((await jefe.from('presupuestos').select('id, monto_presupuestado')).error?.code).toBe('42501')
  expect((await jefe.from('presupuestos').select('id, margen_esperado')).error?.code).toBe('42501')

  // `contratado_de_obra()` es SECURITY DEFINER y es el ÚNICO camino al monto: devuelve null, no error.
  const { data: panel } = await jefe.from('obra_panel')
    .select('obra_id, monto_contratado, margen_sobre_contratado_pct')
    .not('monto_contratado', 'is', null).limit(1)
  expect(panel, 'una sola obra con monto visible ya es la filtración entera').toHaveLength(0)

  const { data: pvr } = await jefe.from('obra_plan_vs_real')
    .select('obra_id, monto_contratado, monto_presupuestado, margen_actual, certificado').limit(5)
  for (const f of pvr ?? []) {
    const row = f as Record<string, unknown>
    for (const c of ['monto_contratado', 'monto_presupuestado', 'margen_actual', 'certificado']) {
      expect(row[c], `${c} llegó al jefe de obra`).toBeNull()
    }
  }
})


/** Entrar con el usuario de prueba de Jefe de Obra. `entrar()` de `util` usa el de Dirección. */
async function entrarComoJefe(page: Page) {
  await page.goto('/login')
  await page.getByLabel(/correo|email/i).fill('qa.jefe.obra@ecsas.com.ar')
  await page.getByLabel(/contraseñ|password/i).fill('TestJefe123!')
  await page.getByRole('button', { name: /ingresar|entrar|iniciar/i }).click()
  await page.waitForURL(/obras|administracion/, { timeout: 20_000 })
}

test('la pantalla tampoco le ofrece lo que la base le va a negar', async ({ page }) => {
  // UN CONTROL QUE NO PUEDE FUNCIONAR ES PEOR QUE UN CONTROL QUE NO ESTÁ: el que aprieta «Cargar
  // certificado» y recibe un error cree que el sistema falló, no que no le corresponde.
  await entrarComoJefe(page)
  await page.goto('/obras/san-francisco?vista=economia')

  // Lo suyo: el costo presupuestado, lo gastado y el desvío entre los dos.
  await expect(page.getByTestId('economia-costo')).toBeVisible({ timeout: 20_000 })

  // Lo que no: contrato, certificación y el formulario de certificado.
  await expect(page.getByTestId('economia-contrato')).toHaveCount(0)
  await expect(page.getByTestId('economia-certificacion')).toHaveCount(0)
  await expect(page.getByTestId('economia-resultado')).toHaveCount(0)
  await expect(page.getByTestId('alta-certificado')).toHaveCount(0)
})

test('y sí le ofrece Administración en la navegación global', async ({ page }) => {
  await entrarComoJefe(page)
  await page.goto('/administracion/personas')
  await expect(page.getByTestId('tabla-personas')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('link', { name: 'Administración' })).toBeVisible()
})
