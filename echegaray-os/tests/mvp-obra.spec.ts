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
  // Los rótulos son los del handoff aprobado (design/screens/obras.md §1b): «Avance físico» y
  // «Costo real». Se habían acortado a «Avance» y «Costo» cuando el titular eran cuatro
  // tarjetas; en la fila de métricas del handoff entran enteros y dicen qué miden.
  for (const k of ['Avance físico', 'Plazo', 'HH', 'Costo real']) {
    await expect(titular.getByText(k, { exact: true })).toBeVisible()
  }
  // «Requiere atención» se fue del Resumen el 20/08: publicaba los mismos atrasos y los mismos
  // desvíos que «Lecturas del plan», que además dice de qué dato sale cada uno. Lo que este test
  // mide —que el Resumen publique lo que está mal y lleve al dato— lo mide sobre la que quedó.
  await expect(page.getByTestId('plan-vs-real')).toBeVisible()

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
  const nombre = `${MARCA} Peón de prueba`
  const DIA = '2026-08-12'   // un MIÉRCOLES, a propósito

  // ═══ AHORA LA IMPUTACIÓN APUNTA A UNA PERSONA Y A UN DÍA (19/08/2026) ═══
  //
  // Antes se escribía `trabajador_o_cuadrilla` en texto libre y la SEMANA. Con un apodo o una tilde,
  // las horas de esa persona no cruzaban con su asignación y desaparecían de su fila sin un error.
  // El grano canónico es `persona_id · fecha · obra · actividad`. Este test carga por la pantalla y
  // verifica la fila en la base — que es el único lugar donde el efecto es un hecho.
  const { data: creada } = await sb.from('personas')
    .insert({ nombre_completo: nombre }).select('id').single()
  const personaId = (creada as { id: string }).id
  await sb.from('registros_hh').delete().eq('obra_canonica_id', OBRA).eq('persona_id', personaId)

  try {
    await entrar(page)
    await page.goto(`/obras/${OBRA}?vista=personal`)
    await expect(page.getByTestId('titular-personal')).toBeVisible()

    await page.getByTestId('alta-hh').click()
    const form = page.getByTestId('form-hh')
    await form.locator('select[name="persona_id"]').selectOption({ label: nombre })
    await page.fill('input[name="fecha"]', DIA)
    await page.fill('input[name="horas"]', '7.5')
    await form.getByRole('button', { name: /Imputar/ }).click()

    // ── LA EVIDENCIA ES DEL EFECTO, Y SE ESPERA AL EFECTO — no a un cartel.
    //
    // La primera versión hacía `expect(getByText('Horas imputadas.'))` y enseguida consultaba la
    // base. Falló con el botón todavía en «Guardando…»: la server action seguía en vuelo. Un cartel
    // de la UI no prueba que la fila esté escrita, y esperar al cartel tampoco espera a la
    // escritura. Se hace `poll` sobre la BASE, que es el único lugar donde el efecto es un hecho.
    await expect.poll(async () => {
      const { count } = await sb.from('registros_hh').select('id', { count: 'exact', head: true })
        .eq('obra_canonica_id', OBRA).eq('persona_id', personaId)
      return count ?? 0
    }, { timeout: 30000, message: 'la fila de HH nunca llegó a Postgres' }).toBe(1)

    const { data } = await sb.from('registros_hh')
      .select('horas, fecha, fecha_inicio_semana, obra_canonica_id, obra_id, persona_id, trabajador_o_cuadrilla')
      .eq('obra_canonica_id', OBRA).eq('persona_id', personaId).single()
    const fila = laFila(data, 'el registro de HH recién imputado')
    expect(Number(fila.horas)).toBe(7.5)
    expect(fila.fecha, 'la imputación se guardó sin el día trabajado').toBe(DIA)
    // Se cargó un miércoles y la SEMANA se deriva al LUNES. La deriva el trigger
    // `registros_hh_normalizar`, no la pantalla: si la calculara TypeScript, Postgres y la web
    // podrían decir lunes distintos y la clave única dejaría entrar las horas dos veces.
    expect(fila.fecha_inicio_semana, 'la semana no se derivó al lunes').toBe('2026-08-10')
    expect(fila.obra_canonica_id, 'la hora no quedó atada al eje canónico').toBe(OBRA)
    expect(fila.obra_id, 'la fila nueva se ató al eje LEGACY').toBeNull()
    // EL NOMBRE NO SE COPIA. Si se guardara, envejecería solo el día que se corrija el legajo.
    expect(fila.trabajador_o_cuadrilla, 'se copió el nombre al lado del persona_id').toBeNull()

    // ── Y de vuelta en la pantalla, después de recargar.
    await page.reload()
    await expect(page.getByTestId('tabla-hh').getByText(nombre)).toBeVisible()
    await expect(page.getByTestId('titular-personal')).toContainText('HH real')
  } finally {
    await sb.from('registros_hh').delete().eq('obra_canonica_id', OBRA).eq('persona_id', personaId)
    await sb.from('personas').delete().eq('id', personaId)
    const { count } = await sb.from('registros_hh')
      .select('id', { count: 'exact', head: true })
      .eq('obra_canonica_id', OBRA).eq('persona_id', personaId)
    expect(count, 'quedó una fila de prueba en los jornales del dueño').toBe(0)
  }
})

// CINCO DESDE EL 20/08: el dueño puso IMPEDIMENTOS junto a los otros cuatro, porque es lo que la
// obra necesita para ejecutarse cada día. Los cuatro primeros se leen de una fuente externa; el
// quinto es el único que se escribe, y por eso además tiene su propio recorrido en
// `obras-ejecucion.spec.ts` —anotarlo, verlo en la base y liberarlo—.
test('Operación reúne las cinco vistas en una sola solapa', async ({ page }) => {
  test.setTimeout(120000)
  await entrar(page)
  for (const sub of ['pedidos', 'compras', 'herramientas', 'movimientos', 'impedimentos']) {
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

    // TODO SE ACOTA AL BLOQUE «archivo». Hay dos formularios en la pantalla —archivo y carpeta— con
    // un `input[name="enlace"]` cada uno: un selector global es ambiguo y Playwright, bien, se niega.
    const bloque = page.getByTestId('vincular-archivo')
    await bloque.locator('summary').click()

    // Lo que NO es de Drive se rechaza ANTES de tocar la base: un id mal extraído no falla al
    // guardar — entra, la pantalla dice "vinculado" y el 404 aparece semanas después.
    await bloque.locator('input[name="enlace"]').fill('https://www.dropbox.com/s/abc123/Contrato.pdf')
    await bloque.getByRole('button', { name: 'Vincular' }).click()
    await expect(bloque.getByText(/Drive/i).first()).toBeVisible({ timeout: 15000 })
    const { count: tras } = await sb.from('obra_documento')
      .select('obra_id', { count: 'exact', head: true }).eq('drive_file_id', fileId)
    expect(tras, 'una URL que no es de Drive llegó a escribir en la base').toBe(0)

    // Y ahora la buena.
    await bloque.locator('input[name="enlace"]').fill(`https://drive.google.com/file/d/${fileId}/view?usp=sharing`)
    await bloque.locator('input[name="nombre"]').fill(`${MARCA} Contrato.pdf`)
    await bloque.getByRole('button', { name: 'Vincular' }).click()

    // Mismo criterio que en HH: se espera al EFECTO en la base, no al cartel de la pantalla.
    await expect.poll(async () => {
      const { count } = await sb.from('obra_documento')
        .select('obra_id', { count: 'exact', head: true }).eq('drive_file_id', fileId)
      return count ?? 0
    }, { timeout: 30000, message: 'el vínculo nunca llegó a Postgres' }).toBe(1)

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
