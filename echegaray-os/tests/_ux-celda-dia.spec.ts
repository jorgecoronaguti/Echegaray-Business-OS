import { test, expect } from '@playwright/test'
import { entrarComo } from './util/login'
import { ADMIN } from './util/identidades'

// CAPTURAS Y MEDIDAS DE LA CELDA DE DOS CAPAS (docs/engineering/UX_ASISTENCIA_VS_HORAS.md).
// Sólo LECTURA: no escribe una celda ni toca la base. El guión bajo del nombre lo deja fuera de la
// suite de regresión; se corre a mano cuando cambia la celda.

test('la grilla de quincena en 1440 dibuja la celda de dos capas y ningún marco rojo de «sin cargar»', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await entrarComo(page, ADMIN.email, ADMIN.password)
  await page.goto('/administracion/personas?vista=asistencia&quincena=2026-09-08')
  await expect(page.getByTestId('grilla-asistencia')).toBeVisible({ timeout: 30000 })
  const celdas = page.locator('[data-testid="celda-dia"], [data-testid="celda-fija"]')
  expect(await celdas.count()).toBeGreaterThan(0)
  // Cada celda tiene su capa de presencia, haya símbolo o no: la de horas queda a la misma altura.
  expect(await page.locator('[data-capa="presencia"]').count()).toBe(await celdas.count())
  // Ningún «sin cargar» va en rojo: el marco es neutro.
  for (const c of await page.locator('[data-sin-cargar="si"]').all()) {
    const borde = await c.evaluate((el) => getComputedStyle(el).borderTopColor)
    expect(borde, 'el marco de «sin cargar» no puede ser rojo').not.toMatch(/rgb\(180, 35, 24\)/)
  }
  // Nunca «N de M fichados» ni «no fichó» en la pantalla.
  await expect(page.getByText(/de \d+ fichados/)).toHaveCount(0)
  await expect(page.getByText('No fichó', { exact: false })).toHaveCount(0)
  await page.screenshot({ path: 'qa-shots/ux-celda-dia-1440.png', fullPage: true })
})

test('la franja de la ficha en 1440 y en 390: dos capas, ≥44 px de toque y sin desplazamiento lateral', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await entrarComo(page, ADMIN.email, ADMIN.password)
  await page.goto('/administracion/personas?vista=asistencia&quincena=2026-09-08')
  await expect(page.getByTestId('grilla-asistencia')).toBeVisible({ timeout: 30000 })
  const href = await page.getByTestId('link-ficha-persona').first().getAttribute('href')
  expect(href).toBeTruthy()
  const ficha = (href as string).split('?')[0]

  await page.goto(ficha)
  await expect(page.getByTestId('franja-quincena')).toBeVisible({ timeout: 30000 })
  await page.screenshot({ path: 'qa-shots/ux-ficha-dia-1440.png', fullPage: true })

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(ficha)
  const franja = page.getByTestId('franja-quincena')
  await expect(franja).toBeVisible({ timeout: 30000 })
  const celda = franja.getByTestId('celda-dia').first()
  const caja = await celda.boundingBox()
  expect(caja, 'la celda existe').toBeTruthy()
  expect(caja!.width, 'objetivo táctil ≥44 px de ancho').toBeGreaterThanOrEqual(44)
  expect(caja!.height, 'objetivo táctil ≥44 px de alto').toBeGreaterThanOrEqual(44)
  const desborde = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(desborde, 'la página no se desplaza de costado en 390px').toBeLessThanOrEqual(1)
  await franja.scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'qa-shots/ux-celda-dia-390.png', fullPage: false })
})
