import { test, expect } from '@playwright/test'
import { entrarComo } from './util/login'
import { ADMIN } from './util/identidades'

// LA LISTA DE COMPRAS SE DESPLAZA ADENTRO SUYO, NO ARRASTRA LA PÁGINA — 08/09/2026.
//
// ═══ EL DEFECTO QUE ATRAPA ═══
//
// Verificado en producción a 390px antes del arreglo: `document.body.scrollWidth` = 1046 contra 390
// de pantalla, porque los nueve tracks de la fila (914 + 112 de `gap` = 1026) empujaban la PÁGIA
// entera. Al deslizar para ver Estado, Forma de pago o Importe se iban de pantalla el header, la
// navegación y los chips: la fila que se estaba leyendo quedaba sin dueño y sin salida.
//
// Los tres asertos de abajo son el defecto al revés, y son tres porque hay tres formas de "arreglar"
// esto mal: tapar el desborde con `overflow: hidden` (pasaría el primero y no el segundo — el dato
// quedaría cortado sin barra que lo delate), dejar la cinta sin contenido ancho (idem), o poner el
// scroll sin fijar la identidad de la fila (pasaría los dos primeros y no el tercero).
//
// Es de LECTURA: no escribe en la base ni en el Sheet.

const RUTA = '/administracion/compras'
const TELEFONO = { width: 390, height: 844 }

test.describe('Compras en el teléfono', () => {
  test('la tabla scrollea adentro de su cinta y la página queda quieta', async ({ page }) => {
    test.setTimeout(120000)
    await entrarComo(page, ADMIN.email, ADMIN.password)
    await page.setViewportSize(TELEFONO)
    await page.goto(RUTA)
    await expect(page.getByTestId('tabla-compras-sheet')).toBeVisible()

    // 1 · LA PÁGINA NO SE VA DE COSTADO. Misma regla que `shell-dos-areas.spec.ts`.
    const pagina = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
      win: window.innerWidth,
    }))
    expect(
      pagina.doc,
      `la página se desplaza de costado (${pagina.doc}px de documento y ${pagina.body} de body en una pantalla de ${pagina.win}px)`,
    ).toBeLessThanOrEqual(pagina.win)

    // 2 · Y NO ES QUE EL DATO SE PERDIÓ: la cinta tiene más ancho adentro del que muestra.
    const cinta = page.getByTestId('cinta-compras')
    const medida = await cinta.evaluate((el) => ({ dentro: el.scrollWidth, visible: el.clientWidth }))
    expect(
      medida.dentro,
      `la cinta no tiene contenido que desplazar (${medida.dentro} adentro, ${medida.visible} a la vista): el dato se está recortando, no desplazando`,
    ).toBeGreaterThan(medida.visible)

    // 3 · AL FINAL DEL RECORRIDO LA FILA SIGUE TENIENDO DUEÑO: Proveedor queda a la vista.
    await cinta.evaluate((el) => { el.scrollLeft = el.scrollWidth })
    await page.waitForTimeout(200)
    const proveedor = page.getByTestId('compra-proveedor').first()
    await expect(proveedor).toBeVisible()
    const caja = await proveedor.boundingBox()
    expect(caja, 'la celda de proveedor no tiene caja').not.toBeNull()
    expect(caja!.x, 'el proveedor se fue por la izquierda al llegar al final del scroll').toBeGreaterThanOrEqual(-1)
    expect(caja!.x + caja!.width).toBeLessThanOrEqual(TELEFONO.width + 1)

    await page.screenshot({ path: 'tests/qa-shots/compras-390-scroll.png', fullPage: false })
  })

  test('en escritorio la lista entra sin desplazarse', async ({ page }) => {
    test.setTimeout(120000)
    await entrarComo(page, ADMIN.email, ADMIN.password)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(RUTA)
    await expect(page.getByTestId('tabla-compras-sheet')).toBeVisible()
    const medida = await page.getByTestId('cinta-compras')
      .evaluate((el) => ({ dentro: el.scrollWidth, visible: el.clientWidth }))
    // La cinta no cambia nada donde ya entraba: sin desplazamiento no hay sombra ni barra.
    expect(medida.dentro).toBeLessThanOrEqual(medida.visible + 1)
    await expect(page.getByTestId('cinta-compras-hay-mas')).toHaveCount(0)
  })
})
