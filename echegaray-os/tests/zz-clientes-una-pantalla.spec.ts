import { test, expect } from '@playwright/test'
import { entrar } from './util/obras-e2e'

const SALIDA = 'test-results/clientes-una-pantalla'

test('la pantalla única de Clientes: capturas a 1440 y 390', async ({ page }) => {
  test.setTimeout(5 * 60 * 1000)
  await entrar(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  const r = await page.goto('/administracion', { waitUntil: 'domcontentloaded' })
  expect(r?.status(), 'la entrada del área tiene que abrir').toBeLessThan(400)
  // EL REDIRECT SE ESPERA, NO SE SUPONE: `redirect()` en un Server Component que ya empezó a
  // transmitir se resuelve en el cliente, así que la URL cambia un instante después del `goto`.
  // 45 s Y NO 15 (medido el 10/09/2026 contra este `next dev --webpack`): el aterrizaje tardó 6,3 s
  // en compilar `/administracion` y el redirect se resuelve en el cliente, así que los 15 s medían
  // el compilador y no la pantalla. Contra producción la misma navegación tarda menos de 2 s.
  await page.waitForURL('**/clientes', { timeout: 45000 })
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.screenshot({ path: `${SALIDA}/clientes-1440.png`, fullPage: true })
  // EL PANEL DEL TRABAJO SE ABRE POR SU URL, que es la que empuja la fila: contra `next dev` la
  // página no hidrata, así que un clic mediría el servidor de desarrollo.
  const fila = page.getByTestId('fila-obra').first()
  if (await fila.count()) {
    const href = await fila.getAttribute('href')
    if (href) {
      await page.goto(href, { waitUntil: 'domcontentloaded' })
      await page.waitForLoadState('networkidle').catch(() => {})
      await page.screenshot({ path: `${SALIDA}/panel-ordenes-1440.png`, fullPage: true })
      await page.goto('/clientes', { waitUntil: 'domcontentloaded' })
    }
  }
  // «?vista=sin-datos» dejó de existir el 10/09/2026 (ver `cartera.ts`). El recorte que queda es
  // «Con trabajo en curso», que es el que contesta «qué le estoy ejecutando a cada uno».
  await page.goto('/clientes?vista=activos', { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.screenshot({ path: `${SALIDA}/clientes-con-obra-activa-1440.png`, fullPage: true })
  await page.goto('/clientes', { waitUntil: 'domcontentloaded' })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${SALIDA}/clientes-390.png`, fullPage: true })
  const desborde = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(desborde, 'a 390px la página no se corre de costado').toBeLessThanOrEqual(1)
})
