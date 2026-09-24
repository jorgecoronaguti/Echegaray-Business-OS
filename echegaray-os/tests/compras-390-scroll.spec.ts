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
// Los asertos de abajo son el defecto al revés, y son varios porque hay varias formas de "arreglar"
// esto mal: tapar el desborde con `overflow: hidden` (el dato quedaría cortado sin barra que lo
// delate), o poner el scroll sin fijar la identidad de la fila.
//
// ACTUALIZADO EL 08/09 A LA TARDE: hasta ese día NINGUNA variante de ancho del repositorio llegaba
// al CSS emitido, así que a 390px la fila traía sus nueve columnas y la cinta SIEMPRE desbordaba.
// Con los cortes vivos la fila queda en dos columnas y puede entrar entera: exigir desborde sería
// exigir el defecto. Lo que se exige ahora es el corte, y que lo que sobre se pueda desplazar.
//
// Es de LECTURA: no escribe en la base ni en el Sheet.

const RUTA = '/administracion/compras'
const TELEFONO = { width: 390, height: 844 }

test.describe('Compras en el teléfono', () => {
  // ═══ DESDE EL 24/09/2026 EL TELÉFONO NO DIBUJA LA GRILLA ═══
  //
  // El dueño: «es un desastre todo lo relacionado a mobile». A 390px la grilla en dos columnas era el
  // proveedor y un desplegable de obra cortado por fila. Ahora el teléfono dibuja una LISTA
  // (`lista-compras-telefono`) y la grilla queda sólo desde 768px. Lo que se exige es lo mismo que
  // antes —la página no se corre de costado— más que la lista esté y cada fila entre en la pantalla.
  test('en el teléfono es una lista, entra entera y la página queda quieta', async ({ page }) => {
    test.setTimeout(120000)
    await entrarComo(page, ADMIN.email, ADMIN.password)
    await page.setViewportSize(TELEFONO)
    await page.goto(RUTA)
    await expect(page.getByTestId('lista-compras-telefono')).toBeVisible()
    await expect(page.getByTestId('cinta-compras')).toBeHidden()

    const pagina = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
      win: window.innerWidth,
    }))
    expect(
      pagina.doc,
      `la página se desplaza de costado (${pagina.doc}px de documento y ${pagina.body} de body en una pantalla de ${pagina.win}px)`,
    ).toBeLessThanOrEqual(pagina.win)

    const fila = page.getByTestId('compra-telefono').first()
    await expect(fila).toBeVisible()
    const caja = await fila.boundingBox()
    expect(caja, 'la fila de compra no tiene caja').not.toBeNull()
    expect(caja!.x).toBeGreaterThanOrEqual(-1)
    expect(caja!.x + caja!.width).toBeLessThanOrEqual(TELEFONO.width + 1)
    // El objetivo táctil: la fila entera, y no menos de 44px.
    expect(caja!.height).toBeGreaterThanOrEqual(44)

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
