import { test } from '@playwright/test'
import { entrar } from './util/obras-e2e'

// La franja de seis cifras vive al pie del workspace: para mirarla hace falta la página entera.
test('la franja de la obra, de cuerpo entero', async ({ page }) => {
  test.setTimeout(120000)
  await entrar(page)
  await page.setViewportSize({ width: 1536, height: 1024 })
  await page.goto('/obras/le-comedor?vista=cronograma&sub=gantt')
  await page.waitForTimeout(2500)
  await page.getByTestId('franja-obra').scrollIntoViewIfNeeded().catch(() => {})
  await page.mouse.wheel(0, 4000)
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${process.env.CAPTURAS ?? 'test-results/capturas'}/franja.png` })
})
