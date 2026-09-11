import { test, expect } from '@playwright/test'
import { entrarComo } from './util/login'
import { ADMIN } from './util/identidades'

// EL ADICIONAL SE VE DEBAJO DE SU OBRA MAYOR — la ficha del cliente, en el navegador.
//
// ═══ QUÉ MIDE ═══
//
//   1 · Que la ficha RENDERICE y que ninguna fila se pise con la siguiente. Es el defecto que esta
//       tabla ya pagó una vez (la grilla mobile-first del 08/09) y tocar la celda del contratado es
//       exactamente cómo volvería.
//   2 · EL SUBNIVEL: el adicional pegado debajo de su obra mayor, con MÁS sangría que ella y con su
//       rótulo, y la madre declarando el consolidado sin reemplazar su propio número.
//   3 · EL BLOQUE «PAPELES» de la cara Documentos: cada obra con sus archivos de Drive agrupados por
//       categoría, y el adicional otra vez debajo de su madre.
//
// Hasta que el dueño aplicó la migración 20260911T2000 (11/09/2026, tarde) el punto 2 no se podía
// medir —la base no tenía `obra_canonica.obra_padre_id`— y el test se SALTABA con motivo escrito en
// vez de pasar en verde sin haber mirado nada. Ahora la columna está y el test no se puede saltar:
// si el subnivel desaparece, esto se pone rojo.
//
// Es de LECTURA: no escribe en la base ni en el Sheet.

const RUTA = '/clientes/messina'
const FILA = '[data-testid="fila-obra-cliente"]'

test('la ficha del cliente renderiza sus trabajos con el código del subnivel puesto', async ({ page }) => {
  await entrarComo(page, ADMIN.email, ADMIN.password)
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto(RUTA)
  await page.waitForSelector('[data-testid="obras-del-cliente"]')
  const filas = page.locator(FILA)
  expect(await filas.count()).toBeGreaterThan(0)

  // NINGUNA FILA SE PISA CON LA SIGUIENTE. Es el defecto que ya pagó esta tabla una vez (la grilla
  // mobile-first del 08/09) y tocar la celda del contratado es exactamente cómo volvería.
  const cajas = await filas.evaluateAll((els) => els.map((e) => e.getBoundingClientRect())
    .map((r) => ({ top: r.top, bottom: r.bottom })))
  for (let i = 1; i < cajas.length; i++) {
    expect(cajas[i].top, `la fila ${i} se dibuja encima de la anterior`)
      .toBeGreaterThanOrEqual(cajas[i - 1].bottom - 1)
  }
  await page.screenshot({ path: 'tests/capturas/cliente-adicional-subnivel-1280.png', fullPage: true })
})

test('el adicional se dibuja con sangría y rótulo debajo de su obra mayor', async ({ page }) => {
  await entrarComo(page, ADMIN.email, ADMIN.password)
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto(RUTA)
  await page.waitForSelector('[data-testid="obras-del-cliente"]')

  // Las DOS relaciones que la migración escribió, medidas por el nombre que se ve en pantalla.
  const filas = await page.locator(FILA).evaluateAll((els) => els.map((e) => ({
    nombre: e.textContent?.trim().slice(0, 40) ?? '',
    padding: parseFloat(getComputedStyle(e).paddingLeft),
    adicional: !!e.querySelector('[data-testid="marca-adicional"]'),
  })))
  const hijos = filas.filter((f) => f.adicional)
  expect(hijos.length, 'no se dibujó ningún adicional: ¿se revirtió obra_padre_id?').toBeGreaterThan(0)

  for (const [i, f] of filas.entries()) {
    if (!f.adicional) continue
    expect(i, `«${f.nombre}» quedó como PRIMERA fila: no tiene su obra mayor arriba`).toBeGreaterThan(0)
    expect(f.padding, `«${f.nombre}» no está sangrado respecto de su obra mayor`)
      .toBeGreaterThan(filas[i - 1].padding)
  }
  // Y la obra mayor declara el consolidado, sin reemplazar su propio número.
  expect(await page.locator('[data-testid="consolidado-obra-cliente"]').count()).toBeGreaterThan(0)
  await page.screenshot({ path: 'tests/capturas/cliente-adicional-subnivel-aplicado-1280.png', fullPage: true })
})

test('la cara Documentos muestra los papeles de cada obra, y el adicional debajo de su madre', async ({ page }) => {
  await entrarComo(page, ADMIN.email, ADMIN.password)
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto(`${RUTA}?vista=documentos`)
  await page.waitForSelector('[data-testid="papeles-por-obra"]')

  const secciones = await page.locator('[data-testid="papeles-obra"]').evaluateAll((els) => els.map((e) => ({
    obra: e.getAttribute('data-obra'),
    padding: parseFloat(getComputedStyle(e).paddingLeft),
    adicional: !!e.querySelector('[data-testid="marca-adicional"]'),
    categorias: e.querySelectorAll('[data-testid="categoria-de-papeles"]').length,
    sinCarpeta: !!e.querySelector('[data-testid="obra-sin-carpeta"]'),
  })))
  expect(secciones.length, 'no se dibujó ninguna obra en la cara Documentos').toBeGreaterThan(0)
  // Al menos una obra tiene papeles agrupados: si el vínculo carpeta→obra se perdiera, esto se cae.
  expect(secciones.some((s) => s.categorias > 0), 'ninguna obra muestra papeles').toBe(true)
  // Y el adicional también acá va sangrado debajo de su obra mayor.
  for (const [i, s] of secciones.entries()) {
    if (!s.adicional) continue
    expect(i).toBeGreaterThan(0)
    expect(s.padding).toBeGreaterThan(secciones[i - 1].padding)
  }
  // UNA OBRA SIN CARPETA LO DICE: «vacío en silencio» es el estado que este bloque vino a borrar.
  const sinCarpeta = page.locator('[data-testid="obra-sin-carpeta"]')
  if (await sinCarpeta.count() > 0) await expect(sinCarpeta.first()).toContainText('sin carpeta vinculada')

  // CADA TRABAJO COLAPSADO: 226 papeles abiertos son un listado de Drive, que es de lo que esta
  // pantalla saca al dueño. Se abre uno y recién ahí aparecen sus categorías y sus archivos.
  expect(await page.locator('[data-testid="categoria-de-papeles"]').first().isVisible()).toBe(false)
  const conPapeles = page.locator('[data-testid="papeles-obra"]:has([data-testid="categoria-de-papeles"])').first()
  await conPapeles.locator('summary').first().click()
  const primera = conPapeles.locator('[data-testid="categoria-de-papeles"]').first()
  await expect(primera).toBeVisible()
  expect(await conPapeles.locator('[data-testid="papel-de-obra"]').first().isVisible()).toBe(false)
  await primera.locator('summary').click()
  await expect(conPapeles.locator('[data-testid="papel-de-obra"]').first()).toBeVisible()

  // ═══ NINGÚN ARCHIVO SE DIBUJA DOS VECES EN TODA LA CARA ═══
  //
  // Es la afirmación que el rediseño tiene que sostener: el mismo PDF llega por la carpeta de la
  // obra Y como OC del cliente. Se abre TODO y se cuentan las claves.
  await page.evaluate(() => {
    document.querySelectorAll('details').forEach((d) => d.setAttribute('open', ''))
  })
  const claves = await page.locator('[data-testid="papel-de-obra"]').evaluateAll(
    (els) => els.map((e) => e.getAttribute('data-clave')))
  expect(claves.length).toBeGreaterThan(0)
  expect(new Set(claves).size, 'un archivo se dibuja dos veces en la cara Documentos').toBe(claves.length)
  // EL N DE LA SOLAPA NO SE MIDE ACÁ, y es deliberado: lo cuenta la RPC (20260911T2200) y hasta que
  // el dueño la aplique el navegador muestra el contador viejo. Un aserto que da rojo por una
  // migración pendiente no distingue «está roto» de «falta aplicar». La paridad entre ese número y
  // lo que se dibuja se mide donde SÍ se puede, contra el payload real y sobre los cinco clientes:
  // `orquestador/lib/cara-documentos.pg.test.mjs`.

  // LA CAPTURA ES DEL VIEWPORT, NO DE LA PÁGINA ENTERA. Con `fullPage` la cara Documentos de
  // Messina mide 10.612px de alto —abajo siguen las OC, las OP y el índice de Drive del cliente,
  // 166 archivos— y el bloque que hay que mirar queda del tamaño de un sello. Se desplaza hasta él
  // y se fotografía lo que ve una persona.
  // La captura del ESTADO DE TRABAJO: todo desplegado muestra el árbol entero, que es lo que hay
  // que poder auditar. La de arriba ya midió que por defecto está colapsado.
  await page.locator('[data-testid="papeles-por-obra"]').scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'tests/capturas/cliente-papeles-por-obra-1280.png' })

  // Y A 400 px, que es donde una cara con cuatro niveles se rompe si se rompe.
  await page.setViewportSize({ width: 400, height: 900 })
  await page.locator('[data-testid="papeles-por-obra"]').scrollIntoViewIfNeeded()
  const desborde = await page.evaluate(() =>
    document.documentElement.scrollWidth - window.innerWidth)
  expect(desborde, 'la cara Documentos se va de costado en un teléfono').toBeLessThanOrEqual(0)
  await page.screenshot({ path: 'tests/capturas/cliente-papeles-por-obra-400.png' })
})
