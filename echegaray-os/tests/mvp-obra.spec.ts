import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { entrar, laFila, MARCA, OBRA } from './util/obras-e2e'

// EL RECORRIDO DEL MVP 1.0 — el workspace de obra, de punta a punta.
//
// ═══ QUÉ MIDE, Y QUÉ NO ═══
//
// El criterio de cierre del dueño no es "la pantalla abre": es *"gestionar una obra real"*. Por eso
// este archivo no comprueba que un componente exista — comprueba el CIRCUITO:
//
//     crear/editar en la UI → la fila en Postgres → recargar → el mismo dato en la UI
//
// La punta del medio es la que importa. Un test que llena un formulario y después lee la misma
// pantalla puede pasar con el estado en memoria y la base intacta; eso ya pasó en este repo. Acá se
// va a buscar la fila con el cliente de servicio y recién entonces se recarga.
//
// TODO LO QUE ESTE ARCHIVO CREA LLEVA LA MARCA `ZZ-E2E` Y SE BORRA AL FINAL. La obra `le-comedor` es
// real y la mira el dueño: una fila de prueba que sobrevive es basura en su cronograma.

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL as string
const SRV = process.env.SUPABASE_SERVICE_ROLE_KEY as string
const admin = () => createClient(URL, SRV, { auth: { persistSession: false } })

/** Las seis solapas definitivas. Ni una más: el dueño puso el tope en seis. */
const SOLAPAS = ['Resumen', 'Cronograma', 'Personal', 'Operación', 'Economía', 'Documentos'] as const

test('el workspace de obra tiene SEIS solapas y son las del MVP', async ({ page }) => {
  test.setTimeout(120000)
  await entrar(page)
  await page.goto(`/obras/${OBRA}`)

  const tabs = page.getByTestId('tabs-obra')
  await expect(tabs).toBeVisible()
  for (const s of SOLAPAS) {
    await expect(tabs.getByRole('link', { name: s, exact: true })).toBeVisible()
  }
  expect(await tabs.getByRole('link').count(),
    'hay más de seis solapas principales: el tope declarado son seis').toBe(6)

  // Y las que se retiraron NO pueden seguir ahí como séptima y octava.
  const texto = await tabs.innerText()
  expect(texto, '«Gantt» volvió como solapa principal: ahora es una vista DENTRO de Cronograma').not.toContain('Gantt')
  expect(texto, '«Planificación» volvió como solapa principal').not.toContain('Planificación')
})

test('las URLs viejas de las solapas siguen llevando a donde llevaban', async ({ page }) => {
  test.setTimeout(120000)
  await entrar(page)
  // Estaban en links mandados por chat y en marcadores. Un default silencioso a Resumen mandaría a
  // otro lado a alguien que pidió el cronograma, sin decirle que su link quedó viejo.
  for (const vieja of ['gantt', 'planificacion']) {
    await page.goto(`/obras/${OBRA}?vista=${vieja}`)
    await expect(page.getByTestId('tab-cronograma'), `?vista=${vieja} no llevó a Cronograma`)
      .toHaveAttribute('aria-current', 'page')
  }
})

test('el Resumen abre con CUATRO cifras y sin cadenas técnicas de base de datos', async ({ page }) => {
  test.setTimeout(120000)
  await entrar(page)
  await page.goto(`/obras/${OBRA}`)

  const titular = page.getByTestId('titular-obra')
  await expect(titular).toBeVisible()
  for (const k of ['Avance', 'Plazo', 'HH', 'Costo']) {
    await expect(titular.getByText(k, { exact: true })).toBeVisible()
  }
  await expect(page.getByTestId('requiere-atencion')).toBeVisible()

  // ═══ NADA DE EXPLICACIONES TÉCNICAS PERMANENTES (regla visual del dueño) ═══
  // El resumen publicaba `obra_actividad.fin_plan anterior a hoy…` como texto fijo. El origen no se
  // borró: viaja en el `title` del renglón. Lo que no puede es estar A LA VISTA.
  const cuerpo = await page.locator('main, body').first().innerText()
  for (const tecnico of ['obra_actividad', 'obra_plan_vs_real', 'obra_canonica', 'registros_hh', 'costos_obra']) {
    expect(cuerpo, `"${tecnico}" es un nombre de tabla y está a la vista en el Resumen`).not.toContain(tecnico)
  }
})

// ═══ EL CIRCUITO QUE NO EXISTÍA: IMPUTAR HORAS A LA OBRA ═══
//
// `registros_hh.obra_id` era `not null` contra `public.obras` —la tabla legacy, 4 filas, ninguna
// activa—, así que no había forma de imputar una hora al eje canónico y «HH real» venía `—` en las
// ocho obras. La pantalla lo decía bien; la causa no era falta de carga, era que no se podía cargar.
// Ver `20260819T0100_hh_sobre_el_eje_canonico.sql`.
test('Personal: imputar horas llega a Postgres y vuelve a la pantalla', async ({ page }) => {
  test.setTimeout(180000)
  const sb = admin()
  const trabajador = `${MARCA} Peón de prueba`
  // Piso limpio: si una corrida anterior murió a la mitad, su fila haría fallar la clave única.
  await sb.from('registros_hh').delete().eq('obra_canonica_id', OBRA).eq('trabajador_o_cuadrilla', trabajador)

  try {
    await entrar(page)
    await page.goto(`/obras/${OBRA}?vista=personal`)
    await expect(page.getByTestId('titular-personal')).toBeVisible()

    await page.getByTestId('alta-hh').click()
    await page.fill('input[name="trabajador_o_cuadrilla"]', trabajador)
    await page.fill('input[name="semana"]', '2026-08-12')   // un miércoles, a propósito
    await page.fill('input[name="horas"]', '37.5')
    await page.getByTestId('form-hh').getByRole('button', { name: /Imputar/ }).click()
    await expect(page.getByText('Horas imputadas.')).toBeVisible({ timeout: 20000 })

    // ── LA EVIDENCIA ES DEL EFECTO: la fila, leída en su destino.
    const { data } = await sb.from('registros_hh')
      .select('horas, fecha_inicio_semana, obra_canonica_id, obra_id')
      .eq('obra_canonica_id', OBRA).eq('trabajador_o_cuadrilla', trabajador).single()
    const fila = laFila(data, 'el registro de HH recién imputado')
    expect(Number(fila.horas)).toBe(37.5)
    // Se cargó un miércoles y se guarda el LUNES de esa semana: sin normalizar, la clave única no ve
    // que dos cargas son la misma semana y las horas entran dos veces.
    expect(fila.fecha_inicio_semana, 'la semana no se normalizó al lunes').toBe('2026-08-10')
    expect(fila.obra_canonica_id, 'la hora no quedó atada al eje canónico').toBe(OBRA)
    expect(fila.obra_id, 'la fila nueva se ató al eje LEGACY').toBeNull()

    // ── Y de vuelta en la pantalla, después de recargar.
    await page.reload()
    await expect(page.getByTestId('tabla-hh').getByText(trabajador)).toBeVisible()
    await expect(page.getByTestId('titular-personal')).toContainText('HH real')
  } finally {
    await sb.from('registros_hh').delete().eq('obra_canonica_id', OBRA).eq('trabajador_o_cuadrilla', trabajador)
    const { count } = await sb.from('registros_hh')
      .select('id', { count: 'exact', head: true })
      .eq('obra_canonica_id', OBRA).eq('trabajador_o_cuadrilla', trabajador)
    expect(count, 'quedó una fila de prueba en los jornales del dueño').toBe(0)
  }
})

test('Operación reúne las cuatro vistas en una sola solapa', async ({ page }) => {
  test.setTimeout(120000)
  await entrar(page)
  for (const sub of ['pedidos', 'compras', 'herramientas', 'movimientos']) {
    const r = await page.goto(`/obras/${OBRA}?vista=operacion&sub=${sub}`)
    expect(r?.status(), `Operación/${sub} contesta ${r?.status()}`).toBeLessThan(400)
    expect(await page.content(), `Operación/${sub} rompió`).not.toContain('Application error')
  }
})

test('Economía muestra los cuatro bloques y ningún nombre de tabla', async ({ page }) => {
  test.setTimeout(120000)
  await entrar(page)
  await page.goto(`/obras/${OBRA}?vista=economia`)
  for (const b of ['Contrato', 'Costo', 'Certificación', 'Resultado']) {
    await expect(page.getByRole('heading', { name: b, exact: true })).toBeVisible()
  }
  // La columna «De dónde sale» publicaba `obra_canonica · se carga en…` en cada renglón. El origen
  // ahora viaja en el `title`; lo que no puede es estar impreso.
  const cuerpo = await page.locator('body').innerText()
  for (const t of ['obra_canonica', 'tabla presupuestos', 'obra_plan_vs_real']) {
    expect(cuerpo, `"${t}" está a la vista en Economía`).not.toContain(t)
  }
})

test('en el teléfono el workspace de obra no se desplaza de costado', async ({ page }) => {
  test.setTimeout(180000)
  await entrar(page)
  await page.setViewportSize({ width: 390, height: 780 })
  for (const vista of SOLAPAS.map((s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''))) {
    await page.goto(`/obras/${OBRA}?vista=${vista}`)
    await page.waitForTimeout(400)
    const { doc, win } = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth, win: window.innerWidth,
    }))
    expect(doc, `?vista=${vista} mide ${doc}px en una pantalla de ${win}px`).toBeLessThanOrEqual(win)
  }
})

// ═══ DOCUMENTOS: EL VÍNCULO A DRIVE, DE PUNTA A PUNTA ═══
//
// La solapa decía textualmente *"Todavía no se puede vincular un documento a la obra desde acá"*.
// `obra_documento` existía con su RLS desde el módulo 01 y no tenía UN SOLO escritor. Ahora tiene
// action, parser de URL y las cuatro policies separadas por comando.
//
// NO SE COPIA EL ARCHIVO: se guarda el vínculo. Por eso el test comprueba el `drive_file_id`, no un
// contenido — y por eso pega una URL de Drive de verdad, con el formato que da el botón Compartir.
test('Documentos: vincular un archivo de Drive llega a Postgres y vuelve a la pantalla', async ({ page }) => {
  test.setTimeout(180000)
  const sb = admin()
  const fileId = 'ZZE2E' + '1cJ8hjIzHwGHfW9obhIq9eh'
  await sb.from('obra_documento').delete().eq('obra_id', OBRA).eq('drive_file_id', fileId)

  try {
    await entrar(page)
    await page.goto(`/obras/${OBRA}?vista=documentos`)

    // Lo que NO es de Drive se rechaza ANTES de tocar la base: un id mal extraído no falla al
    // guardar — entra, la pantalla dice "vinculado" y el 404 aparece semanas después.
    await page.getByTestId('vincular-archivo').click()
    await page.fill('input[name="enlace"]', 'https://www.dropbox.com/s/abc123/Contrato.pdf')
    await page.getByTestId('vincular-archivo').getByRole('button', { name: /Vincular/ }).click()
    await expect(page.getByText(/no es un enlace de Drive|Drive/i).first()).toBeVisible({ timeout: 15000 })
    const { count: tras } = await sb.from('obra_documento')
      .select('obra_id', { count: 'exact', head: true }).eq('drive_file_id', fileId)
    expect(tras, 'una URL que no es de Drive llegó a escribir en la base').toBe(0)

    // Y ahora la buena.
    await page.fill('input[name="enlace"]', `https://drive.google.com/file/d/${fileId}/view?usp=sharing`)
    await page.fill('input[name="nombre"]', `${MARCA} Contrato.pdf`)
    await page.getByTestId('vincular-archivo').getByRole('button', { name: /Vincular/ }).click()

    const { data } = await sb.from('obra_documento')
      .select('obra_id, drive_file_id, tipo, origen').eq('drive_file_id', fileId).single()
    const fila = laFila(data, 'el vínculo del documento recién creado')
    expect(fila.obra_id).toBe(OBRA)
    expect(fila.tipo).toBe('archivo')

    await page.reload()
    await expect(page.getByText(`${MARCA} Contrato.pdf`)).toBeVisible()
  } finally {
    await sb.from('obra_documento').delete().eq('drive_file_id', fileId)
    const { count } = await sb.from('obra_documento')
      .select('obra_id', { count: 'exact', head: true }).eq('drive_file_id', fileId)
    expect(count, 'quedó un vínculo de prueba en los documentos de la obra').toBe(0)
  }
})
