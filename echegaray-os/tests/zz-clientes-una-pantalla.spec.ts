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
  await page.waitForURL('**/clientes', { timeout: 15000 })
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.screenshot({ path: `${SALIDA}/clientes-1440.png`, fullPage: true })
  const chip = page.locator('[data-testid="abrir-ordenes-obra"]').first()
  if (await chip.count()) {
    await chip.click()
    await page.waitForTimeout(1200)
    await page.screenshot({ path: `${SALIDA}/panel-ordenes-1440.png`, fullPage: true })
    await page.goto('/clientes', { waitUntil: 'domcontentloaded' })
  }
  // «?vista=sin-datos» dejó de existir el 10/09/2026 (ver `cartera.ts`). El recorte que queda es
  // «Con obra activa», que es el que contesta «qué le estoy ejecutando a cada uno».
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
