// TEMPORAL — captura del Resumen de Analíticas para comparar antes/después. No es parte de la suite.
import { test } from '@playwright/test'
import { entrarComo } from './util/login'
import { ADMIN } from './util/identidades'

const ETIQUETA = process.env.SHOT_TAG ?? 'antes'
const DIR = process.env.SHOT_DIR ?? 'tests/qa-shots'

test('captura del Resumen de Analíticas', async ({ page }) => {
  test.setTimeout(120_000)
  await entrarComo(page, ADMIN.email, ADMIN.password)
  for (const ancho of [1280, 390]) {
    await page.setViewportSize({ width: ancho, height: ancho === 390 ? 900 : 1100 })
    await page.goto('/analiticas')
    await page.waitForSelector('[data-testid="resumen-por-cliente"]', { timeout: 60_000 })
    await page.waitForTimeout(1200)
    await page.screenshot({ path: `${DIR}/resumen-${ETIQUETA}-${ancho}.png`, fullPage: true })
  }
})
