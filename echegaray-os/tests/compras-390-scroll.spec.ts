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

    // 2 · EL CORTE POR ANCHO LLEGÓ AL NAVEGADOR: a 390px la fila dibuja DOS pistas, no nueve.
    // Este aserto reemplaza al de «la cinta desborda» del 08/09: mientras las variantes de ancho
    // estuvieron apagadas en el build, la fila traía sus nueve columnas y el desborde era la prueba
    // del defecto, no del arreglo. Lo que hay que exigir es el corte; el desborde pasó a ser una
    // consecuencia que puede o no darse.
    const pistas = await page.getByTestId('compra-proveedor').first()
      .evaluate((el) => getComputedStyle(el.parentElement!).gridTemplateColumns.split(' ').length)
    expect(
      pistas,
      `a 390px la fila dibuja ${pistas} columnas: el corte por ancho no llegó al CSS servido (ver cortes-por-ancho-llegan-al-css.test.ts)`,
    ).toBe(2)

    // 3 · Y EL DATO NO SE RECORTA: si algo sobra del ancho visible, la cinta lo desplaza.
    const cinta = page.getByTestId('cinta-compras')
    const medida = await cinta.evaluate((el) => ({
      dentro: el.scrollWidth,
      visible: el.clientWidth,
      desborde: getComputedStyle(el).overflowX,
    }))
    if (medida.dentro > medida.visible) {
      expect(
        medida.desborde,
        `sobran ${medida.dentro - medida.visible}px adentro de la cinta y no se pueden desplazar: el dato se está recortando`,
      ).toMatch(/auto|scroll/)
    }

    // 4 · AL FINAL DEL RECORRIDO LA FILA SIGUE TENIENDO DUEÑO: Proveedor queda a la vista.
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
