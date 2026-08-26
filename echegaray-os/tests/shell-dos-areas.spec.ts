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

test('la navegación tiene TRES solapas y ninguna categoría interna del OS', async ({ page }) => {
  test.setTimeout(120000)
  await entrarComo(page, EMAIL, PASSWORD)
  await page.goto('/obras')

  const header = page.getByTestId('app-header')
  await expect(header).toBeVisible()
  await expect(header.getByTestId('marca')).toContainText('ECHEGARAY')

  // Las dos áreas de usuario más Presupuestos, que subió a nivel 1 el 25/08 (00 v2) porque es
  // comercial y no administración. Y ninguna más: el header viejo tenía diecisiete.
  const nav = page.getByTestId('nav-areas')
  await expect(nav.getByTestId('nav-administracion')).toBeVisible()
  await expect(nav.getByTestId('nav-obras')).toBeVisible()
  await expect(nav.getByTestId('nav-presupuestos')).toBeVisible()
  expect(await nav.getByRole('link').count(), 'la navegación tiene solapas de más').toBe(3)

  // Ninguna categoría del header viejo sobrevive COMO DESTINO DE NAVEGACIÓN.
  //
  // Antes esto barría el texto entero del header buscando subcadenas. El 20/08, con el descriptor
  // «Business OS» del handoff de marca (`design/system/BRAND.md`), la regla empezó a dar rojo sobre
  // sí misma: la categoría vieja se llamaba «OS» y «Business OS» la contiene. El test no medía lo
  // que decía medir — no es que hubiera vuelto una categoría, es que la marca del producto tiene el
  // nombre adentro.
  //
  // Lo que la regla PROHÍBE es que la arquitectura interna del OS vuelva a ser navegación. La
  // navegación son LINKS, así que se miran los links del header salvo la marca (que no lleva a un
  // módulo: lleva al inicio). Una categoría que vuelva, vuelve como link.
  const links = await header.getByRole('link').all()
  const destinos = await Promise.all(
    links.map(async (l) => ((await l.getAttribute('data-testid')) === 'marca' ? '' : l.innerText())),
  )
  const texto = destinos.join(' · ').replace(/\s+/g, ' ')
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

test('Administración tiene sus SIETE destinos, y ni uno de otro nivel', async ({ page }) => {
  test.setTimeout(120000)
  await entrarComo(page, EMAIL, PASSWORD)
  await page.goto('/administracion')

  // EL `h1` ES «Lo que pide trabajo» (25/08, canónico 00 v2): la primera línea de contenido de la
  // pantalla es el TRABAJO, no el maestro. Antes era «Clientes», el título de la cartera.
  await expect(page.getByRole('heading', { name: 'Lo que pide trabajo', level: 1 })).toBeVisible()

  // ═══ EL CONTRATO NUEVO (00 · Home Navegación v2, zip del 25/08/2026) ═══
  //
  // Siete destinos en tres grupos: `Trabajo · | Clientes · Personal · Proveedores · | Compras ·
  // Base maestra · Documentos`. Pendientes y Asistencia se absorbieron en Trabajo; Presupuestos
  // subió a la barra de la aplicación y Usuarios bajó al menú de la cuenta.
  for (const t of ['ir-trabajo', 'ir-clientes', 'ir-personas', 'ir-proveedores', 'ir-compras',
    'ir-base-maestra', 'ir-documentos']) {
    await expect(page.getByTestId(t), `falta el destino ${t}`).toBeVisible()
  }
  for (const t of ['ir-obras', 'ir-pedidos', 'ir-herramientas', 'ir-movimientos', 'ir-pendientes',
    'ir-asistencia', 'ir-presupuestos']) {
    await expect(page.getByTestId(t), `${t} volvió a ofrecerse en la barra del área`).toHaveCount(0)
  }
  const barra = page.getByTestId('nav-admin-secciones')
  await expect(barra).toBeVisible()
  await expect(barra.getByRole('link')).toHaveCount(7)
  // Dos filos, uno por cambio de grupo. Sin ellos son siete tablas en fila otra vez.
  await expect(barra.getByTestId('filo-grupo')).toHaveCount(2)

  // USUARIOS NO DESAPARECIÓ: se entra por el menú de la cuenta, y la ruta responde igual.
  await page.getByTestId('avatar-usuario').click()
  await expect(page.getByTestId('menu-usuario').getByTestId('ir-usuarios')).toBeVisible()
  await page.keyboard.press('Escape')

  // Y llevan a donde dicen.
  await page.getByTestId('ir-clientes').click()
  await page.waitForURL(/\/clientes/)
  await expect(page.getByTestId('clientes-tabla')).toBeVisible()

  // La barra dice DÓNDE ESTOY PARADO. Sin esto, siete destinos se ven iguales desde adentro.
  await page.goto('/administracion/personas')
  await expect(page.getByTestId('nav-admin-secciones').getByRole('link', { name: 'Personal' }))
    .toHaveAttribute('aria-current', 'page')
  await expect(page.getByTestId('nav-admin-secciones').getByRole('link', { name: 'Proveedores' }))
    .not.toHaveAttribute('aria-current', 'page')

  // Y LO QUE «TRABAJO» ABSORBIÓ SIGUE ENCENDIENDO SU SOLAPA: sin esto, entrar a Pendientes apaga la
  // barra entera y la pantalla deja de decir dónde está parado el que la mira.
  {
    const res = await page.goto('/administracion/pendientes')
    expect(res?.status(), '/administracion/pendientes dejó de responder').toBeLessThan(400)
    await expect(page.getByTestId('nav-admin-secciones').getByRole('link', { name: 'Trabajo' }))
      .toHaveAttribute('aria-current', 'page')
  }

  // CORRECCIONES DE ASISTENCIA ES DE SEGUNDO NIVEL (19c v2) y por eso NO lleva la barra del área:
  // con ella habría tres niveles de navegación a la vista, que es lo que prohíbe el handoff. Dice
  // dónde está parado con la miga, y la miga vuelve a Trabajo.
  {
    const res = await page.goto('/administracion/asistencia')
    expect(res?.status(), '/administracion/asistencia dejó de responder').toBeLessThan(400)
    await expect(page.getByTestId('nav-admin-secciones')).toHaveCount(0)
    await expect(page.getByTestId('migas')).toContainText('Trabajo')
  }
})

// PRESUPUESTOS SUBIÓ A NIVEL 1 (v2). Es lo que este archivo tiene que fijar: la solapa existe, sólo
// para quien ve economía, y pinta ELLA cuando estás adentro — mientras `/documentos` y
// `/flujo-caja` siguen pintando Administración, que es la corrección del 24/08 que no se toca.
test('Presupuestos es una solapa de nivel 1 y no rompe el «dónde estoy» de las demás', async ({ page }) => {
  test.setTimeout(120000)
  await entrarComo(page, EMAIL, PASSWORD)
  const nav = page.getByTestId('nav-areas')

  await page.goto('/presupuestos')
  await expect(nav.getByTestId('nav-presupuestos')).toHaveAttribute('aria-current', 'page')
  await expect(nav.getByTestId('nav-administracion')).not.toHaveAttribute('aria-current', 'page')
  // Y adentro de Presupuestos ya no se dibuja la barra de nivel 2 de Administración: serían dos
  // «dónde estoy» contradictorios, y el de abajo sin ninguna solapa encendida.
  await expect(page.getByTestId('nav-admin-secciones')).toHaveCount(0)

  for (const ruta of ['/documentos', '/flujo-caja']) {
    await page.goto(ruta)
    await expect(nav.getByTestId('nav-administracion'), `${ruta} dejó de pintar Administración`)
      .toHaveAttribute('aria-current', 'page')
  }
})

// Las rutas que salieron del menú SIGUEN respondiendo: sacar algo de la navegación no es apagarlo.
test('las rutas de integraciones salieron del menú pero no del sistema', async ({ page }) => {
  test.setTimeout(120000)
  await entrarComo(page, EMAIL, PASSWORD)
  for (const r of ['/integraciones/pedidos-materiales', '/integraciones/herramientas',
    '/integraciones/movimientos']) {
    const res = await page.goto(r)
    expect(res?.status(), `${r} dejó de responder`).toBeLessThan(400)
  }
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
