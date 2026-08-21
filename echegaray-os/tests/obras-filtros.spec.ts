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

/**
 * QUÉ OBRAS SE VEN Y EN QUÉ ORDEN — que es lo que este test afirma.
 *
 * No se compara el texto completo de la fila: `innerText` depende del layout en el instante en que
 * se lee, y la MISMA tabla vuelve con separadores distintos según haya llegado por una navegación
 * completa —la que produce la redirección que restaura la vista— o por una transición de cliente.
 * Contra producción eso hacía fallar la comparación de ocho filas que eran exactamente las mismas
 * obras en el mismo orden, sólo que pegadas sin espacios. Un test que se rompe por eso no está
 * midiendo la vista: está midiendo el navegador.
 */
const contenido = async (page: Page) =>
  (await filas(page).locator('td:first-child').allInnerTexts()).map((t) => t.trim())
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

  // SIN ENTER — y no es un detalle de estilo: el `press('Enter')` que había acá era la prueba de
  // que el buscador exigía enviar un formulario. El contrato de diseño dice «filtran al teclear,
  // sin Enter ni botón Buscar», así que el test tiene que filtrar como filtra una persona.
  await page.getByTestId('buscar-obra').fill(alguno)
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
  const comoLaDeje = await contenido(page)

  // IRSE DE VERDAD: otra pantalla, y volver a la URL PELADA — que es lo que hace el enlace del menú.
  await page.goto('/administracion/personas')
  await page.goto('/obras')
  await expect(page).toHaveURL(/etapa=terminacion/)
  await expect(page).toHaveURL(/orden=avance/)
  await expect(filas(page)).toHaveCount(comoLaDeje.length)
  expect(await contenido(page)).toEqual(comoLaDeje)

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

  // El «quitar filtros» se espera visible antes de tocarlo: es el último enlace de la barra y en
  // producción la tabla llega después que el resto de la pantalla.
  await expect(page.getByTestId('limpiar-filtros')).toBeVisible()
  await page.getByTestId('limpiar-filtros').click()
  await expect(page).toHaveURL(/\/obras\/gantt$/)
  await page.goto('/obras')
  await expect(page.getByTestId('limpiar-filtros')).toBeVisible()
  await page.getByTestId('limpiar-filtros').click()
  await expect(page).toHaveURL(/\/obras$/)
})

test('la lista cambia al TECLEAR tres letras, sin Enter ni botón', async ({ page }) => {
  // ═══ EL DEFECTO QUE ATRAPA ═══
  //
  // Hasta el 21/08 el buscador de la cartera era un `form` GET: escribir no hacía nada hasta apretar
  // Enter, y nada en la pantalla decía que había que apretarlo. Quien escribía tres letras veía la
  // lista entera y concluía que el buscador estaba roto —o, peor, que la obra no estaba cargada—.
  //
  // Este test NO toca Enter y NO hace clic en nada: sólo escribe. Si alguien vuelve a poner un
  // `form` GET, la tabla no se mueve y esto se pone rojo.
  await entrar(page)
  // `?etapa=&q=` ES «ver todas, sin buscar nada», y se pide EXPLÍCITO. `/obras` a secas restaura la
  // última vista guardada en la cookie —incluida la búsqueda—, así que este test arrancaría con el
  // campo ya escrito por el test anterior y tecleando encima. No es un detalle del test: es la
  // misma memoria de vista que el buscador tiene que respetar.
  await page.goto('/obras?etapa=&q=')
  const total = await filas(page).count()
  expect(total).toBeGreaterThan(1)

  const nombres = await contenido(page)
  // Tres letras de una obra real de la cartera. El test no puede depender de que exista «Galpón»,
  // pero sí de que lo que la primera columna muestra se pueda encontrar tecleándolo.
  const tresLetras = nombres.find((n) => n.length >= 3)!.slice(0, 3)

  await page.getByTestId('buscar-obra').pressSequentially(tresLetras, { delay: 60 })
  // El debounce es de 250 ms: la URL cambia sola, sin ninguna otra acción.
  await page.waitForURL(new RegExp(`q=${encodeURIComponent(tresLetras).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i'))
  await expect(page.getByTestId('buscar-obra')).toHaveValue(tresLetras)

  // Y la LISTA se movió, que es lo que se estaba probando.
  const visibles = await contenido(page)
  expect(visibles.length).toBeGreaterThan(0)
  for (const n of visibles) expect(n.toLowerCase()).toContain(tresLetras.toLowerCase())
})

test('borrar el buscador devuelve la lista entera: la vista recordada no lo resucita', async ({ page }) => {
  // ═══ EL DEFECTO QUE ATRAPA ═══
  //
  // `/obras` recuerda la última vista en una cookie y la restaura cuando la URL no trae ninguna
  // clave de vista. Al dejar de ser un formulario, la URL la arma `urlDeBusqueda` — y si omitiera
  // la `q` vacía, borrar el texto dejaría una URL «sin elección», el middleware devolvería la
  // búsqueda anterior y el buscador se llenaría solo. La lista quedaría filtrada con el campo en
  // blanco: el peor estado posible, porque no hay nada en pantalla que explique lo que falta.
  await entrar(page)
  await page.goto('/obras?etapa=&q=')
  const total = await filas(page).count()

  const nombres = await contenido(page)
  const tresLetras = nombres.find((n) => n.length >= 3)!.slice(0, 3)
  await page.getByTestId('buscar-obra').fill(tresLetras)
  await page.waitForURL(/q=/)

  await page.getByTestId('buscar-obra').fill('')
  await page.waitForURL(/q=(&|$)/)
  await expect(filas(page)).toHaveCount(total)
  await expect(page.getByTestId('buscar-obra')).toHaveValue('')
})
