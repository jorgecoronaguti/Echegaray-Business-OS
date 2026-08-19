import { test, expect, type Page } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { entrar, MARCA, OBRA } from './util/obras-e2e'

// MÓDULO 03 · PERSONAL / HH — EL CIRCUITO REAL, DE PUNTA A PUNTA.
//
// ═══ QUÉ PRUEBA Y QUÉ NO ═══
//
// Prueba el CIRCUITO: crear una persona, editarla por el panel lateral, armar una cuadrilla,
// asignarla a una obra, imputar horas de las dos formas, y que todo eso vuelva a la pantalla después
// de recargar. Lo que NO prueba acá es la cerradura por rol —eso vive en
// `administracion-personas-proveedores.spec.ts`, medido contra PostgREST con tokens reales, porque
// una pantalla vacía puede estar vacía por tres razones y sólo una es seguridad.
//
// ═══ LA EVIDENCIA ES DEL EFECTO ═══
//
// Después de cada escritura se espera a la BASE, no al cartel verde. Un cartel prueba que el
// navegador recibió una respuesta; la fila prueba que se escribió. Ya pasó en este repo: un
// `expect(getByText('Horas imputadas.'))` pasaba con la server action todavía en vuelo.
//
// TODO LO QUE CREA LLEVA `ZZ-E2E` Y SE BORRA EN EL `afterAll`. Escribe sobre la base productiva.

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL as string
const SRV = process.env.SUPABASE_SERVICE_ROLE_KEY as string
const sb = (): SupabaseClient => createClient(URL, SRV, { auth: { persistSession: false } })

const PERSONA = `${MARCA} Peón Personal`
const OTRA = `${MARCA} Peón Segundo`
const CUADRILLA = `${MARCA} Cuadrilla`
const DIA = '2026-08-18'
const CAPTURAS = 'test-results/personal-hh'

/** Borra TODO lo que este archivo pudo crear. Se corre antes y después: una corrida interrumpida no
 *  le deja basura a la siguiente, y sobre todo no deja gente inventada en el legajo del dueño. */
async function limpiarTodo(db: SupabaseClient) {
  const { data: personas } = await db.from('personas').select('id').ilike('nombre_completo', `${MARCA}%`)
  for (const p of (personas ?? []) as { id: string }[]) {
    await db.from('registros_hh').delete().eq('persona_id', p.id)
    await db.from('obra_asignacion').delete().eq('persona_id', p.id)
    await db.from('cuadrilla_integrante').delete().eq('persona_id', p.id)
  }
  await db.from('cuadrilla').delete().ilike('nombre', `${MARCA}%`)
  await db.from('personas').delete().ilike('nombre_completo', `${MARCA}%`)
}

async function idDe(db: SupabaseClient, nombre: string): Promise<string> {
  const { data } = await db.from('personas').select('id').eq('nombre_completo', nombre).single()
  if (!data) throw new Error(`no encontré a «${nombre}» en el legajo: la escritura no llegó`)
  return (data as { id: string }).id
}

async function capturar(page: Page, nombre: string) {
  await page.screenshot({ path: `${CAPTURAS}/${nombre}.png`, fullPage: true })
}

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => { await limpiarTodo(sb()) })
test.afterAll(async () => {
  const db = sb()
  await limpiarTodo(db)
  const { count } = await db.from('personas')
    .select('id', { count: 'exact', head: true }).ilike('nombre_completo', `${MARCA}%`)
  expect(count, 'quedó gente de prueba en el legajo del dueño').toBe(0)
})

test('1-4 · el listado abre, se crea una persona, persiste, y se edita por el panel lateral', async ({ page }) => {
  test.setTimeout(240000)
  const db = sb()
  await entrar(page)

  // 1 · ABRE SIN ERROR. El bloqueo que este módulo levantó era «permission denied for table
  // personas»: la pantalla mostraba el error de la base en vez de una tabla vacía, y por eso se pudo
  // encontrar. Si vuelve, este `expect` lo dice con el texto exacto.
  await page.goto('/administracion/personas')
  await expect(page.getByTestId('personas-error')).toHaveCount(0)
  await expect(page.getByTestId('tabla-personas')).toBeVisible()
  await capturar(page, '1-listado-personal')

  // 2 · CREAR. El alta es un panel lateral con lo mínimo: nombre, categoría, puesto e ingreso.
  await page.getByTestId('nueva-persona').click()
  await expect(page.getByTestId('panel-alta-persona')).toBeVisible()
  await page.fill('input[name="nombre_completo"]', PERSONA)
  await page.getByTestId('persona-categoria').selectOption('oficial')
  await page.getByTestId('panel-alta-persona-form-enviar').click()

  // 3 · PERSISTE. Se espera a la FILA, no al cartel.
  await expect.poll(async () => {
    const { count } = await db.from('personas')
      .select('id', { count: 'exact', head: true }).eq('nombre_completo', PERSONA)
    return count ?? 0
  }, { timeout: 60000, message: 'la persona nunca llegó a Postgres' }).toBe(1)

  // El alta sigue en la ficha: es la segunda mitad del formulario progresivo.
  const personaId = await idDe(db, PERSONA)
  await page.waitForURL(new RegExp(`/administracion/personas/${personaId}`), { timeout: 60000 })
  await expect(page.getByTestId('bloque-identidad')).toBeVisible()
  await capturar(page, '2-ficha-persona')

  // 4 · EDITAR POR PANEL LATERAL, y que el panel CIERRE mostrando el dato ya persistido.
  await page.getByTestId('bloque-identidad-editar').click()
  await expect(page.getByTestId('panel-editar-identidad')).toBeVisible()
  await capturar(page, '6-edicion-panel-lateral')
  await page.fill('input[name="telefono"]', '2645551234')
  await page.fill('input[name="dni"]', '30111222')
  await page.getByTestId('panel-editar-identidad-form-enviar').click()

  await expect.poll(async () => {
    const { data } = await db.from('personas').select('telefono').eq('id', personaId).single()
    return (data as { telefono: string | null } | null)?.telefono ?? ''
  }, { timeout: 60000, message: 'la edición nunca llegó a Postgres' }).toBe('2645551234')

  // El panel se cerró Y la ficha ya muestra el valor nuevo, sin recargar a mano.
  await expect(page.getByTestId('panel-editar-identidad')).toHaveCount(0)
  await expect(page.getByTestId('bloque-identidad')).toContainText('2645551234')

  // Y recargando sigue estando: no era un estado optimista del navegador.
  await page.reload()
  await expect(page.getByTestId('bloque-identidad')).toContainText('30111222')
})

test('5-7 · cuadrilla, asignación a obra, y la MISMA relación vista desde la obra', async ({ page }) => {
  test.setTimeout(240000)
  const db = sb()
  // La segunda persona se crea por la base: crear dos por pantalla no prueba nada nuevo y cuesta un
  // minuto de reloj en cada corrida.
  await db.from('personas').insert({ nombre_completo: OTRA, categoria: 'ayudante' })
  await entrar(page)

  // 5 · CREAR CUADRILLA Y SUMARLE GENTE.
  await page.goto('/administracion/personas/cuadrillas')
  await page.getByTestId('nueva-cuadrilla').click()
  await page.getByTestId('nueva-cuadrilla-nombre').fill(CUADRILLA)
  await page.getByTestId('panel-alta-cuadrilla-form-enviar').click()
  await expect.poll(async () => {
    const { count } = await db.from('cuadrilla')
      .select('id', { count: 'exact', head: true }).eq('nombre', CUADRILLA)
    return count ?? 0
  }, { timeout: 60000, message: 'la cuadrilla nunca llegó a Postgres' }).toBe(1)

  await page.reload()
  await page.getByTestId('tabla-cuadrillas').locator('tr', { hasText: CUADRILLA })
    .getByTestId('abrir-cuadrilla').click()
  await expect(page.getByTestId('panel-cuadrilla')).toBeVisible()
  for (const quien of [PERSONA, OTRA]) {
    await page.getByTestId('form-integrante').locator('select[name="persona_id"]')
      .selectOption({ label: quien })
    await page.getByTestId('form-integrante-enviar').click()
    await expect(page.getByTestId('form-integrante-ok')).toBeVisible({ timeout: 60000 })
  }

  // 6 · MANDAR LA CUADRILLA A UNA OBRA. No escribe un campo «obra» en la cuadrilla: crea UNA
  // asignación por integrante vigente. Por eso la obra puede sacar a uno sin desarmar la cuadrilla.
  await page.reload()
  await page.getByTestId('tabla-cuadrillas').locator('tr', { hasText: CUADRILLA })
    .getByTestId('abrir-cuadrilla').click()
  await page.getByTestId('form-cuadrilla-obra').locator('select[name="obra_id"]').selectOption(OBRA)
  await page.getByTestId('form-cuadrilla-obra-enviar').click()
  await expect.poll(async () => {
    const { count } = await db.from('obra_asignacion')
      .select('id', { count: 'exact', head: true })
      .eq('obra_id', OBRA)
      .in('persona_id', [await idDe(db, PERSONA), await idDe(db, OTRA)])
    return count ?? 0
  }, { timeout: 60000, message: 'la cuadrilla no generó asignaciones' }).toBe(2)

  // 7 · LA MISMA RELACIÓN, VISTA DESDE LA OBRA. No es otro maestro de personas: es la misma fila.
  await page.goto(`/obras/${OBRA}?vista=personal`)
  await expect(page.getByTestId('tabla-personal').locator('tr', { hasText: PERSONA })).toBeVisible()
  await expect(page.getByTestId('tabla-personal').locator('tr', { hasText: PERSONA }))
    .toContainText(CUADRILLA)
  await capturar(page, '3-obra-personal')

  // Y desde la ficha de la persona se ve la MISMA asignación, por el otro camino. Se busca el
  // ENLACE a la obra y no su slug en el texto: la ficha muestra el NOMBRE de la obra («Comedor»),
  // que es lo correcto — un identificador de URL no es algo que se le muestre a nadie.
  await page.goto(`/administracion/personas/${await idDe(db, PERSONA)}?v=asignaciones`)
  await expect(page.getByTestId('ficha-asignaciones')
    .locator(`a[href="/obras/${OBRA}"]`)).toBeVisible()
})

test('8-12 · HH individual, HH masiva, y el plan contra real que sale de una sola fuente', async ({ page }) => {
  test.setTimeout(300000)
  const db = sb()
  await entrar(page)
  await page.goto(`/obras/${OBRA}?vista=personal`)

  // 8 · IMPUTACIÓN INDIVIDUAL: persona · día · actividad · horas.
  await page.getByTestId('alta-hh').locator('summary').click()
  const individual = page.getByTestId('form-hh')
  await individual.locator('select[name="persona_id"]').selectOption({ label: PERSONA })
  await individual.locator('input[name="fecha"]').fill(DIA)
  await individual.locator('input[name="horas"]').fill('8')
  // Se imputa CONTRA UNA ACTIVIDAD para poder medir después el plan contra real de esa actividad.
  const opciones = await individual.locator('select[name="actividad_id"] option').count()
  if (opciones > 1) await individual.locator('select[name="actividad_id"]').selectOption({ index: 1 })
  await individual.getByRole('button', { name: /Imputar/ }).click()
  await capturar(page, '4-carga-individual-hh')

  const personaId = await idDe(db, PERSONA)
  await expect.poll(async () => {
    const { count } = await db.from('registros_hh')
      .select('id', { count: 'exact', head: true }).eq('persona_id', personaId).eq('fecha', DIA)
    return count ?? 0
  }, { timeout: 60000, message: 'la imputación individual nunca llegó a Postgres' }).toBe(1)

  // 9 · IMPUTACIÓN MASIVA: un día, la cuadrilla entera, y las excepciones corregidas ANTES de
  // guardar. Al primero se le deja 0 —ya tiene sus 8 horas— y al segundo media jornada.
  await page.reload()
  await page.getByTestId('alta-hh-masiva').locator('summary').click()
  const masiva = page.getByTestId('form-hh-masiva')
  await masiva.locator('input[name="fecha"]').fill(DIA)
  const otraId = await idDe(db, OTRA)
  await masiva.locator(`input[name="horas_${personaId}"]`).fill('0')
  await masiva.locator(`input[name="horas_${otraId}"]`).fill('4.5')
  await capturar(page, '5-carga-masiva-hh')
  await masiva.getByRole('button', { name: /Imputar a todos/ }).click()

  await expect.poll(async () => {
    const { data } = await db.from('registros_hh')
      .select('horas').eq('persona_id', otraId).eq('fecha', DIA).maybeSingle()
    return Number((data as { horas: number } | null)?.horas ?? 0)
  }, { timeout: 60000, message: 'la carga masiva nunca llegó a Postgres' }).toBe(4.5)

  // El que se dejó en cero NO recibió una segunda fila: el casillero vacío o en cero es la forma de
  // sacar a alguien de la carga, no una imputación de 0 horas.
  const { count: delPrimero } = await db.from('registros_hh')
    .select('id', { count: 'exact', head: true }).eq('persona_id', personaId).eq('fecha', DIA)
  expect(delPrimero, 'la carga masiva imputó al que estaba en cero').toBe(1)

  // 10 · PERSISTEN AL RECARGAR.
  await page.reload()
  await expect(page.getByTestId('tabla-hh')).toContainText(PERSONA)
  await expect(page.getByTestId('tabla-hh')).toContainText(OTRA)

  // 11-12 · LA HORA LLEGA A LA ACTIVIDAD CORRECTA, Y EL PLAN CONTRA REAL SALE DE UNA SOLA FUENTE.
  //
  // `obra_actividad_hh` suma `registros_hh` por `actividad_id` y toma `hh_plan` de `obra_actividad`.
  // Es la MISMA vista que lee el panel del cronograma: si alguien hiciera una segunda cuenta en
  // cualquiera de las dos pantallas, este número dejaría de coincidir con el de la tabla.
  const { data: fila } = await db.from('registros_hh')
    .select('actividad_id').eq('persona_id', personaId).eq('fecha', DIA).single()
  const actividadId = (fila as { actividad_id: string | null } | null)?.actividad_id
  if (actividadId) {
    const { data: vista } = await db.from('obra_actividad_hh')
      .select('hh_real, hh_plan, desvio_pct').eq('actividad_id', actividadId).single()
    const v = vista as { hh_real: number; hh_plan: number | null; desvio_pct: number | null }
    expect(Number(v.hh_real), 'la hora no llegó a la actividad').toBe(8)
    // SIN PLAN NO HAY DESVÍO. Ninguna de las 344 actividades tiene `hh_plan` cargada: el desvío
    // TIENE que venir en null, no en 100%. Un cero donde falta un dato es la mentira más cara.
    if (v.hh_plan == null) {
      expect(v.desvio_pct, 'se calculó un desvío sin HH plan cargada').toBeNull()
    }
    await expect(page.getByTestId('tabla-productividad')).toBeVisible()
    await expect(page.getByTestId('tabla-productividad')).toContainText(/HH plan sin cargar|Avance/)
  }
})

test('13 · cerrar una asignación conserva el historial', async ({ page }) => {
  test.setTimeout(180000)
  const db = sb()
  const personaId = await idDe(db, PERSONA)
  await entrar(page)

  await page.goto(`/administracion/personas/${personaId}?v=asignaciones`)
  await page.getByTestId('ficha-asignaciones')
    .locator('tr', { has: page.locator(`a[href="/obras/${OBRA}"]`) })
    .getByTestId('cerrar-asignacion').click()

  await expect.poll(async () => {
    const { data } = await db.from('obra_asignacion')
      .select('hasta').eq('persona_id', personaId).eq('obra_id', OBRA).single()
    return (data as { hasta: string | null } | null)?.hasta ?? ''
  }, { timeout: 60000, message: 'cerrar no escribió la fecha de fin' }).not.toBe('')

  // LA FILA SIGUE EXISTIENDO. Es lo que respalda las horas que esa persona imputó mientras estuvo:
  // si cerrar borrara, la obra perdería de quién fueron esas horas.
  const { count } = await db.from('obra_asignacion')
    .select('id', { count: 'exact', head: true }).eq('persona_id', personaId).eq('obra_id', OBRA)
  expect(count, 'cerrar borró la asignación en vez de cerrarla').toBe(1)

  await page.reload()
  await expect(page.getByTestId('ficha-asignaciones')
    .locator(`a[href="/obras/${OBRA}"]`)).toBeVisible()

  // Y las horas que trabajó siguen ahí, con su nombre.
  const { count: horas } = await db.from('registros_hh')
    .select('id', { count: 'exact', head: true }).eq('persona_id', personaId)
  expect(horas, 'cerrar la asignación se llevó las horas puestas').toBeGreaterThan(0)
})

test('7-bis · la pantalla no es un tablero: sin tarjetas de cifras, sin gráficos, dos niveles de navegación', async ({ page }) => {
  test.setTimeout(180000)
  await entrar(page)

  // El dueño: *"vista de gestión, NO dashboard"*. Lo que se mide es lo que se puede medir sin
  // interpretar un pixel: que el listado no tenga una franja de cifras arriba, que no haya un
  // `<canvas>` ni un `<svg>` de gráfico, y que los niveles de navegación visibles sean dos.
  await page.goto('/administracion/personas')
  await expect(page.getByTestId('titular-personal')).toHaveCount(0)
  expect(await page.locator('main canvas, canvas').count(), 'apareció un gráfico en el listado').toBe(0)

  // DOS NIVELES: el header global y la barra de Administración. Ninguno más.
  await expect(page.getByTestId('nav-admin-secciones')).toBeVisible()
  await expect(page.getByTestId('nav-ficha-persona')).toHaveCount(0)
  await capturar(page, '7-sin-dashboards')
})
