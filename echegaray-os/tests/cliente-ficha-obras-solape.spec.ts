import { test, expect, type Page } from '@playwright/test'
import { entrarComo } from './util/login'
import { ADMIN } from './util/identidades'

// LA TABLA DE OBRAS DE LA FICHA DE CLIENTE NO SE PISA A SÍ MISMA — 09/09/2026.
//
// ═══ EL DEFECTO QUE ATRAPA (medido en producción, `qa-shots/verif-opacidad2-10-cliente-ficha.png`) ═══
//
// El 08/09 entraron CONTRATADO · COSTO MO · COSTO MAT. · MARGEN a la lista de obras del cliente, y
// la grilla pasó a declarar OCHO celdas. Pero estaba escrita mobile-first: la plantilla SIN prefijo
// —la que el navegador aplica cuando ninguna media query alcanza— tenía TRES pistas, y las otras
// cinco celdas caían en filas implícitas. Como el encabezado y la fila llevan alto fijo
// (`ENCABEZADO.height`, `ALTO_V2.cara`), esas filas implícitas se dibujaban ENCIMA de la fila
// siguiente: «$10.000.000» y el badge «activa» tapaban los rótulos CONTRATADO y ESTADO.
//
// No hacía falta un teléfono para verlo: los cortes por ancho no llegaban al CSS emitido
// (`cortes-por-ancho-llegan-al-css.test.ts`), así que la plantilla de tres pistas era la que corría
// a 1440px. Ése es justamente el punto: una grilla cuyo estado por defecto tiene MENOS PISTAS QUE
// CELDAS convierte cualquier falla de entrega del CSS en una tabla ilegible. Escrita al revés
// —ancho entero sin prefijo, `max-[…]` que sueltan— el peor caso es una tabla apretada, no una
// tabla superpuesta.
//
// Los tres asertos son el defecto al revés: la fila implícita se detecta por el solape vertical
// (1), por el encabezado partido en dos renglones (2) y por la fila de datos partida (3). El cuarto
// vigila que arreglar el solape no se pague con una página que se va de costado en el teléfono.
//
// Es de LECTURA: no escribe en la base ni en el Sheet.

const RUTA = '/clientes/messina'

/** Las cajas de los hijos DIRECTOS visibles de un contenedor. `display:none` no devuelve caja. */
async function cajasDeCeldas(page: Page, selector: string) {
  return page.locator(selector).evaluate((el) =>
    [...el.children]
      .map((c) => c.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.height > 0)
      .map((r) => ({ top: r.top, bottom: r.bottom, left: r.left })))
}

const ENCABEZADO = '[data-testid="obras-del-cliente"] > div:first-child'
const PRIMERA_FILA = '[data-testid="fila-obra-cliente"]:first-of-type'

async function abrirLaFicha(page: Page, width: number, height = 900) {
  await page.setViewportSize({ width, height })
  await page.goto(RUTA)
  await expect(page.getByTestId('obras-del-cliente')).toBeVisible()
  await expect(page.getByTestId('fila-obra-cliente').first()).toBeVisible()
}

test.describe('Ficha de cliente › Obras', () => {
  for (const ancho of [1440, 1024]) {
    test(`el encabezado y las filas no se superponen a ${ancho}px`, async ({ page }) => {
      test.setTimeout(120000)
      await entrarComo(page, ADMIN.email, ADMIN.password)
      await abrirLaFicha(page, ancho)

      // 1 · NINGÚN RÓTULO BAJA HASTA LA PRIMERA FILA. Se mide sobre las CELDAS, no sobre la caja
      //     del encabezado: lleva `height` fijo con `content-box`, así que su `boundingBox` mide 31
      //     px aunque los rótulos se dibujen 45 px más abajo. Medir el contenedor daba verde con el
      //     defecto a la vista.
      const rotulos = await cajasDeCeldas(page, ENCABEZADO)
      const fila = await page.getByTestId('fila-obra-cliente').first().boundingBox()
      expect(rotulos.length, 'el encabezado de Obras no dibujó ninguna celda').toBeGreaterThan(2)
      expect(fila, 'la primera obra no tiene caja').not.toBeNull()
      const masBajo = Math.max(...rotulos.map((r) => r.bottom))
      expect(
        masBajo,
        `un rótulo del encabezado llega hasta ${masBajo} y la primera fila empieza en ${fila!.y}: se superponen`,
      ).toBeLessThanOrEqual(fila!.y + 1)

      // 2 · Y EL ENCABEZADO ES UN SOLO RENGLÓN: una celda de más cae en una fila implícita, y ahí
      //     es donde el rótulo se va a buscar la fila de abajo.
      const rengloneEnc = new Set(rotulos.map((r) => Math.round(r.top)))
      expect(
        [...rengloneEnc],
        `los rótulos se dibujan en ${rengloneEnc.size} renglones: hay más celdas que pistas`,
      ).toHaveLength(1)

      // 3 · IDEM LA FILA DE DATOS. Sin esto, arreglar sólo el encabezado dejaría el importe de la
      //     obra pisando la obra siguiente.
      const celdas = await cajasDeCeldas(page, PRIMERA_FILA)
      const renglones = new Set(celdas.map((c) => Math.round(c.top + (c.bottom - c.top) / 2)))
      expect(
        renglones.size,
        `la primera fila se dibuja en ${renglones.size} renglones: sus celdas no entran en la grilla`,
      ).toBeLessThanOrEqual(1)

      if (ancho === 1440) {
        await page.screenshot({ path: 'tests/qa-shots/cliente-ficha-obras-1440.png', fullPage: false })
      }
    })
  }

  test('a 390px la página no se va de costado', async ({ page }) => {
    test.setTimeout(120000)
    await entrarComo(page, ADMIN.email, ADMIN.password)
    await abrirLaFicha(page, 390, 844)
    const pagina = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
      win: window.innerWidth,
    }))
    expect(
      pagina.doc,
      `la página se desplaza de costado (${pagina.doc}px de documento y ${pagina.body} de body en ${pagina.win}px)`,
    ).toBeLessThanOrEqual(pagina.win)
  })
})
