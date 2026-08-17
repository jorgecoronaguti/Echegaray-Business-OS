import { test, expect } from '@playwright/test'

// MÓDULO 01 · OBRAS — el recorrido completo, en un navegador de verdad.
//
// ═══ POR QUÉ ESTE ARCHIVO EXISTE ═══
//
// El módulo salió a producción con TODAS sus pantallas en 404: las políticas de RLS estaban, pero
// faltaban los `grant`, y `drop view` se había llevado los privilegios de `obra_panel`. Ningún test
// lo detectó porque lo verifiqué con el driver de Postgres —que entra como dueño del esquema y no
// necesita grant—: validé el control con el mismo camino que produce el control. Lo encontró una
// persona abriendo la página.
//
// Esto entra por donde entra el dueño: navegador, sesión real, rol real. Si vuelven a faltar los
// permisos, o si el guard de sesión se rompe, acá se pone en rojo antes que en el teléfono de nadie.

const EMAIL = 'jorge.o.corona+direccion-test-1783513222134@gmail.com'
const PASSWORD = 'TestPassword123!'

async function entrar(page: import('@playwright/test').Page) {
  await page.goto('/login')
  await page.fill('input[name="email"]', EMAIL)
  await page.fill('input[name="password"]', PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/(dashboard|flujo-caja|obras)/, { timeout: 20000 })
}

// ── SIN SESIÓN NO SE VE NADA ────────────────────────────────────────────────
//
// `/flujo-caja` respondía 200 a cualquiera en internet, con importes y nombres de clientes: esa
// ruta no pasa por Supabase —lee el Sheet con una service account desde el servidor—, así que el
// RLS, que tapaba al resto de casualidad, no la cubría. Esto es el regreso de esa falla.

test('sin sesión, las pantallas con datos de la empresa mandan al login', async ({ page }) => {
  for (const ruta of ['/obras', '/obras/san-francisco', '/flujo-caja', '/control-obras', '/chat']) {
    const respuesta = await page.goto(ruta)
    await page.waitForURL(/\/login/, { timeout: 15000 })
    // Y no alcanza con terminar en /login: lo que no puede haber es el dato en el camino.
    expect(await page.content()).not.toMatch(/Saldo|Disponibilidad|Costo real/i)
    expect(respuesta?.status(), `${ruta} sin sesión`).toBeLessThan(400)
  }
})

test('sin sesión, la descarga pública de la extensión sigue abierta', async ({ page }) => {
  // El guard es una lista BLANCA, y al cerrarla se llevó puesto el .zip que la landing ofrece:
  // /descargar quedaba en 200 con su único botón mandando al login.
  // Se pide por HTTP y no con `goto`: el navegador lo descarga en vez de navegarlo, y una descarga
  // no es una navegación. Lo que importa es el 200 y que sea un zip de verdad.
  const r = await page.request.get('/echegaray-os-extension.zip')
  expect(r.status()).toBe(200)
  expect((await r.body()).subarray(0, 2).toString()).toBe('PK')
})

// ── EL RECORRIDO DEL MÓDULO, AUTENTICADO ────────────────────────────────────

test('portafolio → obra → resumen · gantt · planificación · documentos', async ({ page }) => {
  test.setTimeout(120000)
  await entrar(page)

  // 1. PORTAFOLIO. Que la tabla exista no alcanza: si faltan los grants, la vista devuelve vacío
  //    y la página renderiza igual. Lo que se exige es una obra con nombre.
  await page.goto('/obras')
  await expect(page.getByTestId('portafolio-tabla')).toBeVisible()
  const filaSanFrancisco = page.getByRole('link', { name: /San Francisco/ })
  await expect(filaSanFrancisco).toBeVisible()

  // 2. EL AVANCE VIENE CON SU COBERTURA. Un porcentaje sin decir sobre cuántas actividades se tomó
  //    es la mitad de un dato — y fue exactamente el defecto que hizo convivir un 85% con un 44%.
  const filaTabla = page.locator('tr', { has: filaSanFrancisco })
  await expect(filaTabla).toContainText(/%/)
  await expect(filaTabla).toContainText(/\d+\/\d+/)

  // 3. LA OBRA ABRE. El 404 de producción se veía justo acá.
  await filaSanFrancisco.click()
  await page.waitForURL(/\/obras\/san-francisco/)
  await expect(page.getByRole('heading', { name: /San Francisco/ })).toBeVisible()
  await expect(page.getByText('Avance físico')).toBeVisible()

  // 4. GANTT — el núcleo del módulo. Sin barras dibujadas no hay Gantt, hay una tabla vacía.
  await page.getByRole('link', { name: 'Gantt', exact: true }).click()
  await page.waitForURL(/vista=gantt/)
  const gantt = page.getByTestId('gantt')
  await expect(gantt).toBeVisible()
  // Barras dibujadas de verdad: cada actividad con fecha es un <g> con su rect en el SVG.
  expect(await gantt.locator('svg g').count()).toBeGreaterThan(5)

  // 5. PLANIFICACIÓN — lookahead y restricciones.
  await page.getByRole('link', { name: 'Planificación', exact: true }).click()
  await page.waitForURL(/vista=planificacion/)
  await expect(page.getByRole('heading', { name: /Lookahead/ })).toBeVisible()
  // Sólo lectura DECLARADA: mientras no exista el alta, la pantalla tiene que decirlo. Un vacío sin
  // esta aclaración se lee como "esta obra no tiene restricciones", que es una afirmación falsa.
  await expect(page.getByText(/no se puede cargar una restricción/i)).toBeVisible()

  // 6. DOCUMENTOS — el vínculo a Drive, nunca una copia.
  await page.getByRole('link', { name: 'Documentos', exact: true }).click()
  await page.waitForURL(/vista=documentos/)
  await expect(page.getByText(/Drive/).first()).toBeVisible()
})

// ── UN SOLO AVANCE PARA TODO EL OS ──────────────────────────────────────────

test('el avance que publica /obras es el mismo que responde el chat', async ({ page }) => {
  test.setTimeout(120000)
  await entrar(page)

  await page.goto('/obras')
  const fila = page.locator('tr', { has: page.getByRole('link', { name: /San Francisco/ }) })
  const enPortafolio = (await fila.innerText()).match(/(\d+)%/)?.[1]
  expect(enPortafolio, 'el portafolio tiene que publicar un avance').toBeTruthy()

  await page.goto('/chat')
  await page.getByTestId('chat-input').fill('avance de la obra San Francisco')
  await page.getByTestId('chat-enviar').click()
  const respuesta = page.getByTestId('chat-respuesta').first()
  await expect(respuesta).toBeVisible({ timeout: 30000 })
  await expect(respuesta).toContainText(/San Francisco/, { timeout: 30000 })
  const enChat = (await respuesta.innerText()).match(/avance (\d+)%/)?.[1]

  // Los dos leen `obra_avance`. Si esto se rompe, volvieron a existir dos cálculos del mismo número.
  expect(enChat, 'el chat y la web tienen que decir el MISMO avance').toBe(enPortafolio)

  // Y el tercer consumidor, el control de obras, que hasta ahora publicaba el otro número.
  await page.goto('/control-obras/' + encodeURIComponent('San Francisco'))
  await expect(page.getByText(/% físico/).first()).toBeVisible({ timeout: 30000 })
  const enControl = (await page.getByText(/% físico/).first().innerText()).match(/(\d+)%/)?.[1]
  expect(enControl, 'control de obras tiene que decir el MISMO avance').toBe(enPortafolio)
})
