import { test } from '@playwright/test'
import { entrarComo } from './util/login'
import { ADMIN } from './util/identidades'

// LAS CAPTURAS DE PAGOS Y CIERRE, A 1440 Y CON DATOS REALES.
//
// No afirman nada: son la evidencia de que las dos solapas dibujan la quincena de verdad. La skill
// de diseño lo exige y el repo ya pagó la trampa contraria — dar una pantalla por buena sin haberla
// mirado en un navegador autenticado.

const RUTA = '/administracion/personas?vista=liquidacion'

for (const [solapa, nombre] of [['pagos', 'pagos'], ['cierre', 'cierre']] as const) {
  test(`captura · solapa ${nombre} a 1440`, async ({ page }) => {
    test.setTimeout(120_000)
    await page.setViewportSize({ width: 1440, height: 1100 })
    await entrarComo(page, ADMIN.email, ADMIN.password)
    await page.goto(`${RUTA}&solapa=${solapa}`, { waitUntil: 'load' })
    await page.waitForTimeout(2500)
    await page.screenshot({ path: `.playwright/liquidacion-${nombre}-1440.png`, fullPage: true })
  })
}

test('captura · quincena cerrada (2ª de agosto) a 1440', async ({ page }) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 1440, height: 1100 })
  await entrarComo(page, ADMIN.email, ADMIN.password)
  await page.goto(`${RUTA}&quincena=2026-08-16&solapa=cierre`, { waitUntil: 'load' })
  await page.waitForTimeout(2500)
  await page.screenshot({ path: '.playwright/liquidacion-cerrada-1440.png', fullPage: true })
})
