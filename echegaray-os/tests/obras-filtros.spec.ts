import { test, expect, type Page } from '@playwright/test'
import { entrar } from './util/obras-e2e'

// El dueño (19/08/2026), dos pedidos del mismo día:
//
//   *"necesito q las vistas resumen y gantt guarden cuál fue el último «filtrado» que hice según la
//   columna para que me la muestre de esa manera y no tener que estar poniendo nuevamente cómo
//   quiero verlo"*  ·  *"dame la opción de filtros también, pero respetá mis lineamientos de diseño"*
//
// Las reglas puras ya están probadas en `filtroObras.test.ts` y `vistaRecordada.test.ts`. Esto
// prueba lo único que ellas no pueden: que el filtro LLEGA a la pantalla y que la preferencia
// SOBREVIVE a irse y volver — que es exactamente lo que el dueño pidió y lo que ningún test de
// función pura puede afirmar.

const filas = (page: Page) => page.locator('[data-testid="portafolio-tabla"] tbody tr')
const etapas = async (page: Page) =>
  page.locator('[data-testid="portafolio-tabla"] tbody tr td:nth-child(3)').allInnerTexts()

test('la etapa acota la tabla y la pantalla dice cuántas quedaron', async ({ page }) => {
  await entrar(page)
  await page.goto('/obras')
  const total = await filas(page).count()
  expect(total).toBeGreaterThan(1)

  await page.getByTestId('etapa-terminacion').click()
  await expect(page.getByTestId('etapa-terminacion')).toHaveAttribute('aria-current', 'true')
  const quedaron = await filas(page).count()
  expect(quedaron).toBeLessThan(total)
  expect(quedaron).toBeGreaterThan(0)
  // UNA TABLA ACORTADA SIN DECIR POR QUÉ se lee como una tabla a la que le faltan obras.
  await expect(page.getByTestId('filtro-resultado')).toContainText(`${quedaron} de ${total}`)
  for (const e of await etapas(page)) expect(e).toContain('Terminación')

  await page.getByTestId('etapa-todas').click()
  await expect(filas(page)).toHaveCount(total)
})

test('la búsqueda encuentra por cliente, no sólo por obra', async ({ page }) => {
  await entrar(page)
  await page.goto('/obras')
  const clientes = await page.locator('[data-testid="portafolio-tabla"] tbody tr td:nth-child(2)').allInnerTexts()
  // Se busca una PALABRA de un cliente real de la cartera, saltando el texto de ausencia: el test no
  // puede depender de que exista «Messina», pero sí de que lo que la columna muestra se encuentre.
  const alguno = clientes
    .map((c) => c.trim())
    .filter((c) => c.length > 3 && !/sin cliente/i.test(c))[0]
    .split(/[\s(]/)[0]

  await page.getByTestId('buscar-obra').fill(alguno)
  await page.getByTestId('buscar-obra').press('Enter')
  await page.waitForURL(new RegExp(`q=`, 'i'))
  const visibles = await page.locator('[data-testid="portafolio-tabla"] tbody tr td:nth-child(2)').allInnerTexts()
  expect(visibles.length).toBeGreaterThan(0)
  for (const c of visibles) expect(c.toLowerCase()).toContain(alguno.toLowerCase())
})

test('ordenar NO devuelve las obras que el filtro sacó', async ({ page }) => {
  // El defecto clásico de las tablas filtrables: tocar un encabezado pierde el filtro y la lista
  // vuelve entera sin que nadie lo haya pedido.
  await entrar(page)
  await page.goto('/obras?etapa=terminacion')
  const conFiltro = await filas(page).count()
  await page.getByTestId('orden-nombre').click()
  await page.waitForURL(/orden=nombre/)
  await expect(filas(page)).toHaveCount(conFiltro)
  await expect(page).toHaveURL(/etapa=terminacion/)
})

test('la vista se abre como la dejé, sin volver a elegir nada', async ({ page }) => {
  await entrar(page)
  await page.goto('/obras')
  // SE ESPERA LA NAVEGACIÓN, no el clic: con el router de App Router la URL y el DOM cambian después
  // del clic, y leer el enlace siguiente sin esperar devuelve el de la pantalla anterior.
  await page.getByTestId('etapa-terminacion').click()
  await page.waitForURL(/etapa=terminacion/)
  await page.getByTestId('orden-avance').click()
  await page.waitForURL(/orden=avance/)
  const comoLaDeje = await filas(page).allInnerTexts()

  // IRSE DE VERDAD: otra pantalla, y volver a la URL PELADA — que es lo que hace el enlace del menú.
  await page.goto('/administracion/personas')
  await page.goto('/obras')
  await expect(page).toHaveURL(/etapa=terminacion/)
  await expect(page).toHaveURL(/orden=avance/)
  expect(await filas(page).allInnerTexts()).toEqual(comoLaDeje)

  // Y «quitar filtros» además OLVIDA: la próxima visita pelada vuelve a la cartera entera.
  await page.getByTestId('limpiar-filtros').click()
  await page.waitForURL(/\/obras$/)
  const enteras = await filas(page).count()
  await page.goto('/obras')
  await expect(page).toHaveURL(/\/obras$/)
  await expect(filas(page)).toHaveCount(enteras)
})

test('el Gantt recuerda su propia vista, distinta de la del Resumen', async ({ page }) => {
  await entrar(page)
  await page.goto('/obras')
  await page.getByTestId('etapa-previo').click()
  await page.waitForURL(/etapa=previo/)

  await page.goto('/obras/gantt')
  // La preferencia del Resumen NO se le aplica al Gantt: son dos formas de mirar y dos memorias.
  await expect(page).not.toHaveURL(/etapa=previo/)
  await page.getByTestId('etapa-terminacion').click()
  await page.waitForURL(/etapa=terminacion/)
  await expect(page.getByTestId('filtro-resultado')).toBeVisible()

  await page.goto('/obras')
  await expect(page).toHaveURL(/etapa=previo/)
  await page.goto('/obras/gantt')
  await expect(page).toHaveURL(/etapa=terminacion/)

  await page.getByTestId('limpiar-filtros').click()
  await page.waitForURL(/\/obras\/gantt$/)
  await page.goto('/obras')
  await page.getByTestId('limpiar-filtros').click()
  await page.waitForURL(/\/obras$/)
})
