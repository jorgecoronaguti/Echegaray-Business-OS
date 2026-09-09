import { test, expect } from '@playwright/test'
import { entrarComo } from './util/login'

// QA VISUAL PUNTUAL del arreglo de cortes por ancho (08/09/2026). No es un control permanente.
const CUENTA = { email: 'jorge.o.corona+direccion-test-1783513222134@gmail.com', password: 'TestPassword123!' }
const PANTALLAS: [string, string][] = [
  ['compras', '/administracion/compras'],
  ['plantel', '/administracion/personas'],
  ['proveedores', '/administracion/proveedores'],
  ['cartera', '/administracion'],
  ['clientes', '/clientes'],
]

for (const [nombre, ruta] of PANTALLAS) {
  test(`cortes ${nombre}`, async ({ page }) => {
    test.setTimeout(120000)
    await entrarComo(page, CUENTA.email, CUENTA.password)
    for (const [ancho, alto] of [[390, 844], [1024, 800]]) {
      await page.setViewportSize({ width: ancho, height: alto })
      await page.goto(ruta)
      await page.waitForTimeout(1200)
      const desborde = await page.evaluate(() => ({
        doc: document.documentElement.scrollWidth,
        win: window.innerWidth,
      }))
      await page.screenshot({ path: `tests/qa-shots/cortes-${ancho}-${nombre}.png`, fullPage: false })
      expect(desborde.doc, `${nombre} a ${ancho}: la página se va de costado`).toBeLessThanOrEqual(desborde.win)
    }
  })
}
