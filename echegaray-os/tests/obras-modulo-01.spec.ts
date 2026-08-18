import { test, expect } from '@playwright/test'
import { ATERRIZAJE } from './util/login'

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
  await page.waitForURL(ATERRIZAJE, { timeout: 20000 })
}

// ── SIN SESIÓN NO SE VE NADA ────────────────────────────────────────────────
//
// `/flujo-caja` respondía 200 a cualquiera en internet, con importes y nombres de clientes: esa
// ruta no pasa por Supabase —lee el Sheet con una service account desde el servidor—, así que el
// RLS, que tapaba al resto de casualidad, no la cubría. Esto es el regreso de esa falla.

test('sin sesión, las pantallas con datos de la empresa mandan al login', async ({ page }) => {
  for (const ruta of ['/clientes', '/clientes/la-estrella', '/obras', '/obras/san-francisco', '/flujo-caja', '/control-obras', '/chat']) {
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

// ── LA JERARQUÍA: CLIENTE → OBRAS → OBRA ────────────────────────────────────
//
// El cliente es la entidad de arriba y la obra la unidad operativa. La Estrella es el caso que lo
// prueba: tiene TRES obras, y hasta que existió `cliente_id` eran tres cadenas de texto iguales por
// casualidad. Si este test se rompe, la jerarquía volvió a ser un texto repetido.

test('clientes → cliente → sus obras → la obra', async ({ page }) => {
  test.setTimeout(120000)
  await entrar(page)

  await page.goto('/clientes')
  await expect(page.getByTestId('clientes-tabla')).toBeVisible()
  const laEstrella = page.getByRole('link', { name: /La Estrella/ })
  await expect(laEstrella).toBeVisible()

  await laEstrella.click()
  await page.waitForURL(/\/clientes\/la-estrella/)
  await expect(page.getByRole('heading', { name: /La Estrella/ })).toBeVisible()

  // LA FICHA ABRE EN INFORMACIÓN, NO EN OBRAS (19/08/2026). El cliente es la RELACIÓN empresarial:
  // entrar por su portafolio lo convertía en una carpeta con obras adentro. Las obras siguen a un
  // clic y con acceso directo a cada una, pero son UNA de las cinco caras, no la relación.
  await expect(page.getByRole('term').filter({ hasText: 'Responsable interno' })).toBeVisible()

  // Sus tres obras, con el MISMO avance que publica el portafolio: sale de `obra_panel`.
  // Por testid y no por el rótulo: «Obras» también es un enlace de la barra de arriba, y el que
  // gana por texto es el de la barra — el test navegaría al portafolio creyendo abrir la solapa.
  await page.getByTestId('solapa-obras').click()
  await page.waitForURL(/vista=obras/)
  const tabla = page.getByTestId('obras-del-cliente')
  await expect(tabla).toBeVisible()
  expect(await tabla.locator('tbody tr').count()).toBe(3)

  // Las solapas de la ficha existen Y YA SE PUEDE CARGAR EN ELLAS. Hasta el 18/08 esto exigía leer
  // el cartel de "todavía no se puede cargar un contacto": esa afirmación dejó de ser verdad, y un
  // test que la siguiera exigiendo estaría defendiendo una limitación en vez de la capacidad.
  await page.getByRole('link', { name: 'Contactos', exact: true }).click()
  await page.waitForURL(/vista=contactos/)
  await expect(page.getByTestId('alta-contacto')).toBeVisible()

  await page.getByRole('link', { name: 'Documentos', exact: true }).click()
  await page.waitForURL(/vista=documentos/)
  // Los documentos son los de Drive: vínculo, nunca copia.
  await expect(page.getByText(/en Drive/i).first()).toBeVisible()
  await expect(page.getByTestId('alta-documento')).toBeVisible()

  // Y desde la obra se vuelve a SU cliente: la jerarquía se navega en los dos sentidos.
  await page.goto('/obras/le-comedor')
  const volver = page.getByRole('link', { name: /La Estrella/ })
  await expect(volver).toBeVisible()
  await volver.click()
  await page.waitForURL(/\/clientes\/la-estrella/)
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
  // «Avance físico» se acortó a «Avance» al pasar de cuatro tarjetas a una franja de cuatro cifras:
  // en una franja el rótulo compite por el ancho con los otros tres.
  await expect(page.getByTestId('titular-obra')).toContainText('Avance')

  // 4. CRONOGRAMA — el núcleo del módulo, y ahora una sola solapa con DOS vistas de las mismas
  //    actividades. «Gantt» y «Planificación» dejaron de ser solapas principales: el dueño puso el
  //    tope en seis y pidió que planificar viva adentro del cronograma.
  await page.getByRole('link', { name: 'Cronograma', exact: true }).click()
  await page.waitForURL(/vista=cronograma/)
  const gantt = page.getByTestId('gantt')
  await expect(gantt).toBeVisible()
  // Barras dibujadas de verdad: cada actividad con fecha es un <g> con su rect en el SVG.
  expect(await gantt.locator('svg g').count()).toBeGreaterThan(5)

  // 5. PRÓXIMOS TRABAJOS — la otra vista del mismo cronograma, con sus impedimentos.
  await page.getByTestId('subvista-proximos').click()
  await page.waitForURL(/sub=proximos/)
  await expect(page.getByTestId('alta-impedimento')).toBeVisible()

  // 6. DOCUMENTOS — el vínculo a Drive, nunca una copia.
  await page.getByRole('link', { name: 'Documentos', exact: true }).click()
  await page.waitForURL(/vista=documentos/)
  // Los dos formularios de vínculo nacen cerrados (`<details>`), así que la palabra «Drive» está en
  // el DOM pero oculta. Lo que tiene que verse es la ACCIÓN: poder vincular algo.
  await expect(page.getByTestId('vincular-archivo')).toBeVisible()
  await expect(page.getByTestId('vincular-carpeta')).toBeVisible()
})

// ── EN EL TELÉFONO NO SE DESPLAZA DE COSTADO ────────────────────────────────

test('ninguna pantalla del módulo empuja la página de costado en el teléfono', async ({ page }) => {
  test.setTimeout(120000)
  await entrar(page)
  await page.setViewportSize({ width: 390, height: 780 })

  // Medido el 18/08/2026: el OS entero salía 568px de ancho contra 390 de pantalla, porque el email
  // del usuario en el nav tenía `whitespace-nowrap`. La tabla ancha SÍ puede desplazarse —dentro de
  // su propio contenedor—, pero el cuerpo de la página no.
  for (const ruta of ['/clientes', '/clientes/la-estrella', '/obras', '/obras/le-comedor', '/obras/le-comedor?vista=cronograma', '/obras/le-comedor?vista=personal', '/obras/le-comedor?vista=economia']) {
    await page.goto(ruta)
    await page.waitForTimeout(400)
    const { doc, win } = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth, win: window.innerWidth,
    }))
    expect(doc, `${ruta} se desplaza de costado (${doc}px en una pantalla de ${win}px)`).toBeLessThanOrEqual(win)
  }
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
