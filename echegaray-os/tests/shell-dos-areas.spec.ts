import { test, expect } from '@playwright/test'
import { entrarComo } from './util/login'

// EL SHELL DEL ERP — UNA LÍNEA, DOS ÁREAS, Y NADA DE ARQUITECTURA INTERNA.
//
// El dueño (18/08), textual: *"El header/navegación global actual NO me gusta: está saturado, sin
// jerarquía y debe rehacerse"* · *"Debe desaparecer el header de las capturas actuales con `01 ·
// OBRAS / OS / FINANZAS / REPORTES / CONEXIONES / ADMINISTRACIÓN`"* · *"No borrar rutas ni
// funcionalidades. Sólo retirarlas de la navegación principal"*.
//
// Las dos mitades de ese pedido se prueban por separado y las dos hacen falta: que los links no estén
// EN LA NAVEGACIÓN, y que las rutas SIGAN RESPONDIENDO. Un test que sólo mirara lo primero se pondría
// verde el día que alguien borre las páginas.

const EMAIL = 'jorge.o.corona+direccion-test-1783513222134@gmail.com'
const PASSWORD = 'TestPassword123!'

/** Los seis grupos del header viejo. Ninguno puede volver a la navegación. */
const CATEGORIAS_VIEJAS = ['01 · Obras', 'OS', 'Finanzas', 'Reportes', 'Conexiones']

test('la navegación tiene DOS áreas y ninguna categoría interna del OS', async ({ page }) => {
  test.setTimeout(120000)
  await entrarComo(page, EMAIL, PASSWORD)
  await page.goto('/obras')

  const header = page.getByTestId('app-header')
  await expect(header).toBeVisible()
  await expect(header.getByTestId('marca')).toHaveText('ECHEGARAY')

  // Las dos áreas, y sólo esas dos.
  const nav = page.getByTestId('nav-areas')
  await expect(nav.getByTestId('nav-administracion')).toBeVisible()
  await expect(nav.getByTestId('nav-obras')).toBeVisible()
  expect(await nav.getByRole('link').count(), 'la navegación tiene más de dos áreas').toBe(2)

  // Ninguna categoría del header viejo sobrevive EN EL HEADER.
  const texto = (await header.innerText()).replace(/\s+/g, ' ')
  for (const c of CATEGORIAS_VIEJAS) {
    expect(texto, `la categoría interna "${c}" volvió a la navegación`).not.toContain(c)
  }
  // Y tampoco los links que el dueño mandó retirar.
  for (const l of ['Centro de Operación', 'Chat del OS', 'Aprobaciones', 'Ingeniería Financiera',
    'Calendario Financiero', 'Scorecard', 'Flujo de Caja', 'Integraciones', 'Descargar extensión', 'Operarios']) {
    expect(texto, `"${l}" sigue en la navegación principal`).not.toContain(l)
  }

  // UNA SOLA LÍNEA. Se mide el alto real: el header viejo medía ~90px con sus dos filas.
  const alto = await header.evaluate((el) => el.getBoundingClientRect().height)
  expect(alto, `el header mide ${alto}px: volvió a ser de dos filas`).toBeLessThanOrEqual(56)
})

// ═══ EL LOGO TIENE QUE CARGAR SIN SESIÓN (18/08/2026) ═══
//
// La pantalla de login pide su propio logo y por definición no tiene sesión. El guard de sesión
// —lista blanca— no tenía a `/marca`, así que devolvía un 307 al login: la primera pantalla del
// sistema mostraba el ícono de imagen rota. Typecheck y build daban VERDE los dos, porque un 307 en
// una imagen no es un error de tipos ni de compilación. Se vio mirando la captura.
test('la marca carga sin sesión: es lo primero que se ve', async ({ page }) => {
  test.setTimeout(120000)
  for (const archivo of ['/marca/logo.png', '/marca/isotipo.png']) {
    const r = await page.request.get(archivo)
    expect(r.status(), `${archivo} no se sirve sin sesión`).toBe(200)
    expect(r.headers()['content-type'], `${archivo} no es una imagen`).toContain('image')
    expect((await r.body()).length, `${archivo} llegó vacío`).toBeGreaterThan(2000)
  }
  // Y en la pantalla: una imagen rota tiene naturalWidth 0 aunque el <img> exista.
  await page.goto('/login')
  const logo = page.getByAltText('Echegaray Construcciones')
  await expect(logo).toBeVisible()
  expect(await logo.evaluate((el: HTMLImageElement) => el.naturalWidth),
    'el logo está en el DOM pero no cargó').toBeGreaterThan(0)
})

test('las rutas retiradas de la navegación SIGUEN respondiendo', async ({ page }) => {
  test.setTimeout(180000)
  await entrarComo(page, EMAIL, PASSWORD)
  // Retirar un link no es borrar una ruta. Si alguna de éstas empieza a dar 404, se rompió algo que
  // el dueño pidió expresamente conservar.
  for (const ruta of ['/os', '/chat', '/aprobaciones', '/ingenieria-financiera', '/calendario-financiero',
    '/scorecard-finanzas', '/calendario-caja', '/flujo-caja', '/reportes', '/integraciones', '/descargas']) {
    const r = await page.goto(ruta)
    expect(r?.status(), `${ruta} dejó de responder`).toBeLessThan(400)
    expect(await page.content(), `${ruta} rompió`).not.toContain('Application error')
  }
})

test('Administración es navegación hacia objetos reales, sin dashboard de KPIs', async ({ page }) => {
  test.setTimeout(120000)
  await entrarComo(page, EMAIL, PASSWORD)
  await page.goto('/administracion')

  await expect(page.getByRole('heading', { name: 'Administración' })).toBeVisible()
  // Las dos entidades arriba…
  await expect(page.getByTestId('ir-clientes')).toBeVisible()
  await expect(page.getByTestId('ir-obras')).toBeVisible()
  // …y los tres procesos operativos abajo, que hasta hoy vivían arriba de TODAS las pantallas.
  await expect(page.getByTestId('ir-pedidos')).toBeVisible()
  await expect(page.getByTestId('ir-herramientas')).toBeVisible()
  await expect(page.getByTestId('ir-movimientos')).toBeVisible()

  // Y llevan a donde dicen.
  await page.getByTestId('ir-clientes').click()
  await page.waitForURL(/\/clientes/)
  await expect(page.getByTestId('clientes-tabla')).toBeVisible()
})

// ═══ DE `nav-jerarquia-y-estado-activo.spec.ts`, QUE MURIÓ CON EL HEADER VIEJO ═══
//
// Ese archivo exigía los cinco grupos (`01 · Obras`, `OS`, `Finanzas`, `Reportes`, `Conexiones`) y
// que el link activo se pintara con `bg-gray-900`. Los grupos ya no existen y la clase tampoco. Lo
// que SÍ sigue importando de él —y por eso el test no se borra, se muda— es que la navegación diga
// dónde estoy parado: sin eso, dos áreas se ven igual desde cualquier pantalla.
test('la navegación marca en qué área estoy parado', async ({ page }) => {
  test.setTimeout(120000)
  await entrarComo(page, EMAIL, PASSWORD)
  const nav = page.getByTestId('nav-areas')

  await page.goto('/obras')
  await expect(nav.getByTestId('nav-obras')).toHaveAttribute('aria-current', 'page')
  await expect(nav.getByTestId('nav-administracion')).not.toHaveAttribute('aria-current', 'page')

  // La ficha de un cliente es área Administración aunque su URL no empiece con /administracion.
  await page.goto('/clientes')
  await expect(nav.getByTestId('nav-administracion')).toHaveAttribute('aria-current', 'page')
  await expect(nav.getByTestId('nav-obras')).not.toHaveAttribute('aria-current', 'page')
})

test('en el teléfono el shell no empuja la página de costado', async ({ page }) => {
  test.setTimeout(120000)
  await entrarComo(page, EMAIL, PASSWORD)
  await page.setViewportSize({ width: 390, height: 780 })
  for (const ruta of ['/administracion', '/obras', '/clientes']) {
    await page.goto(ruta)
    await page.waitForTimeout(400)
    const { doc, win } = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth, win: window.innerWidth,
    }))
    expect(doc, `${ruta} se desplaza de costado (${doc}px en una pantalla de ${win}px)`).toBeLessThanOrEqual(win)
  }
})
