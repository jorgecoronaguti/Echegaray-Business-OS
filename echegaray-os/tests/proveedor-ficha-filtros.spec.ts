import { test, expect, type Page } from '@playwright/test'
import { entrarComo } from './util/login'

// LOS CUATRO PEDIDOS DEL DUEÑO DEL 22/09/2026 SOBRE LA FICHA DEL PROVEEDOR, EN EL NAVEGADOR.
//
//   1. «ver ficha del proveedor» no llevaba a la ficha: devolvía al listado.
//   2. hacía falta un filtro Pendiente / Pagado sobre los comprobantes.
//   3. la sección «Obras» tenía que poder abrirse y mostrar SUS comprobantes.
//   4. el buscador «por número» no buscaba nada.
//
// Los cuatro son la misma queja —desde la ficha no se llega al detalle— y por eso se prueban juntos:
// lo que hay que demostrar es que los recortes se COMBINAN y viajan en la URL, no que cada uno ande
// por separado.

const RODRIGO = { email: 'rodrigo@ecsas.com.ar', password: 'test123' }
const SHOTS = 'tests/qa-shots'

/** El proveedor con más comprobantes que la cartera ofrezca: el que hace visibles los filtros. */
async function abrirUnaFichaConCompras(page: Page): Promise<string> {
  await page.goto('/administracion/proveedores?vista=deuda')
  await expect(page.getByTestId('tabla-deuda')).toBeVisible()
  await page.getByTestId('fila-deuda').first().click()
  await expect(page.getByTestId('deuda-ver-ficha')).toBeVisible()
  await page.getByTestId('deuda-ver-ficha').click()
  await page.waitForURL(/\/administracion\/proveedores\/[0-9a-f-]{36}/, { timeout: 20_000 })
  return page.url()
}

test('1 · «Ver la ficha del proveedor» abre la ficha, no devuelve al listado', async ({ page }) => {
  await entrarComo(page, RODRIGO.email, RODRIGO.password)
  const url = await abrirUnaFichaConCompras(page)
  // La prueba del EFECTO: no alcanza con que la URL cambie, tiene que haber ficha dibujada.
  await expect(page.getByTestId('vistas-proveedor')).toBeVisible()
  await expect(page.getByTestId('compras-proveedor')).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/proveedor-ficha-desde-deuda.png`, fullPage: true })
  console.log('FICHA ABIERTA:', url)
})

test('2 · el filtro Pendiente / Pagado recorta los comprobantes y vive en la URL', async ({ page }) => {
  await entrarComo(page, RODRIGO.email, RODRIGO.password)
  await abrirUnaFichaConCompras(page)
  // Todos los años: con el año en curso un proveedor puede no tener ninguna de las dos.
  await page.getByTestId('filtro-anio-todos').click()
  // ESPERAR A QUE EL RECORTE SE COMPROMETA EN LA URL. Sin esto el chip siguiente todavía apunta al
  // año viejo y la prueba mide una pantalla que ya no existe.
  await page.waitForURL(/anio=todos/, { timeout: 20_000 })
  await expect(page.getByTestId('filtro-estado')).toBeVisible()

  for (const [clave, etiqueta] of [['pendiente', 'A pagar'], ['pagado', 'Pagado']] as const) {
    await page.getByTestId(`filtro-estado-${clave}`).click()
    await page.waitForURL(new RegExp(`estado=${clave}`), { timeout: 20_000 })
    const estados = await page.getByTestId('estado-compra').allTextContents()
    console.log(`${clave}: ${estados.length} filas · estados:`, [...new Set(estados)])
    if (estados.length === 0) {
      // Cero filas NUNCA queda en blanco: dice por qué.
      await expect(page.getByTestId('compras-vacio')).toBeVisible()
    } else {
      expect([...new Set(estados)]).toEqual([etiqueta])
    }
    await page.screenshot({ path: `${SHOTS}/proveedor-filtro-${clave}.png`, fullPage: true })
  }
})

test('3 · abrir una obra muestra SUS comprobantes y el monto cierra con la suma', async ({ page }) => {
  await entrarComo(page, RODRIGO.email, RODRIGO.password)
  const ficha = await abrirUnaFichaConCompras(page)
  await page.goto(`${ficha.split('?')[0]}?vista=obras`)
  await expect(page.getByTestId('obras-proveedor')).toBeVisible()
  const fila = page.getByTestId('fila-obra').first()
  const textoFila = (await fila.textContent()) ?? ''
  const montoObra = textoFila.match(/-?\$[\s ]?[\d.]+(,\d\d)?/)?.[0] ?? ''
  console.log('FILA DE OBRA:', textoFila.replace(/\s+/g, ' ').trim())
  await page.screenshot({ path: `${SHOTS}/proveedor-cara-obras.png`, fullPage: true })

  await fila.getByTestId('abrir-obra-proveedor').click()
  await page.waitForURL(/obra=/, { timeout: 20_000 })
  await expect(page.getByTestId('obra-abierta')).toBeVisible()
  const suma = (await page.getByTestId('suma-visible-total').textContent()) ?? ''
  console.log('MONTO DE LA OBRA:', montoObra, '· SUMA DE SUS COMPROBANTES:', suma)
  await page.screenshot({ path: `${SHOTS}/proveedor-obra-abierta.png`, fullPage: true })
  const norm = (s: string) => s.replace(/[\s ]/g, '')
  expect(norm(suma)).toBe(norm(montoObra))
})

test('4 · el buscador encuentra por número parcial, por concepto, por fecha y por importe', async ({ page }) => {
  await entrarComo(page, RODRIGO.email, RODRIGO.password)
  await abrirUnaFichaConCompras(page)
  await page.getByTestId('filtro-anio-todos').click()
  await page.waitForURL(/anio=todos/, { timeout: 20_000 })
  await expect(page.getByTestId('fila-comprobante-proveedor').first()).toBeVisible()

  const primera = page.getByTestId('fila-comprobante-proveedor').first()
  const numero = ((await primera.getByTestId('numero-compra').textContent()) ?? '').trim()
  const texto = (await primera.textContent()) ?? ''
  const fecha = texto.match(/\d{2}\/\d{2}/)?.[0] ?? ''
  const importe = (((await primera.getByTestId('importe-compra').textContent()) ?? '')
    .match(/([\d.]+)(,\d\d)?/)?.[1] ?? '')
  // DOS PALABRAS DEL CONCEPTO, no el concepto entero: es como busca una persona.
  const concepto = ((await primera.getByTestId('concepto-compra').textContent()) ?? '')
    .trim().split(/\s+/).slice(0, 2).join(' ')
  console.log('FILA DE REFERENCIA · número:', numero, '· fecha:', fecha, '· importe:', importe, '· concepto:', concepto)

  // El número SIN el punto de venta y sin los ceros: es como lo tipea una persona.
  const parcial = (numero.split('-').pop() ?? numero).replace(/^0+/, '')
  for (const [que, buscado] of [
    ['número parcial', parcial], ['fecha', fecha], ['importe', importe], ['concepto', concepto],
  ] as const) {
    if (!buscado) { console.log(`(sin ${que} en la fila de referencia: no se prueba)`); continue }
    await page.getByTestId('buscar-compra').fill(buscado)
    await page.waitForURL((u) => u.searchParams.get('q') === buscado, { timeout: 20_000 })
    const n = await page.getByTestId('fila-comprobante-proveedor').count()
    console.log(`buscar «${buscado}» (${que}) → ${n} filas`)
    expect(n, `buscar por ${que} («${buscado}») no encontró nada`).toBeGreaterThan(0)
  }
  await page.screenshot({ path: `${SHOTS}/proveedor-buscador.png`, fullPage: true })

  // Lo que no existe dice que no existe, no deja la tabla en blanco.
  await page.getByTestId('buscar-compra').fill('zzzz-no-existe')
  await expect(page.getByTestId('compras-vacio')).toContainText('Ningún comprobante con')
  await page.screenshot({ path: `${SHOTS}/proveedor-buscador-sin-resultados.png`, fullPage: true })
})

test('5 · los recortes se combinan: estado + obra + búsqueda en la misma URL', async ({ page }) => {
  await entrarComo(page, RODRIGO.email, RODRIGO.password)
  const ficha = await abrirUnaFichaConCompras(page)
  const base = ficha.split('?')[0]
  await page.goto(`${base}?vista=obras`)
  await page.getByTestId('fila-obra').first().getByTestId('abrir-obra-proveedor').click()
  await page.waitForURL(/obra=/, { timeout: 20_000 })
  await page.getByTestId('filtro-estado-pendiente').click()
  await page.waitForURL(/estado=pendiente/, { timeout: 20_000 })
  const url = new URL(page.url())
  console.log('URL COMBINADA:', url.search)
  // Elegir el estado no puede tirar la obra abierta ni el año.
  expect(url.searchParams.get('obra')).toBeTruthy()
  expect(url.searchParams.get('anio')).toBe('todos')
  await expect(page.getByTestId('obra-abierta')).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/proveedor-filtros-combinados.png`, fullPage: true })
})
