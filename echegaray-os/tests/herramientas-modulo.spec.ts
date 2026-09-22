import { test, expect } from '@playwright/test'
import { entrar } from './util/obras-e2e'

// HERRAMIENTAS · ETAPA 1 contra la base con la migración 20260921T2100 aplicada (22/09/2026).
// Lectura solamente: lo que la importación dejó tiene que verse en cada pantalla, nunca el aviso
// de «espera la migración» ni un cero. Las cifras son las que la importación verificó en la base:
// 178 herramientas, 135 en el Taller, 40 en QP Salón Comercial.

const CAPTURAS = 'test-results/herramientas'

test.describe('módulo Herramientas · escritorio', () => {
  test.use({ viewport: { width: 1440, height: 1000 } })

  test('las solapas muestran lo importado, no el aviso de migración', async ({ page }) => {
    test.setTimeout(180000)
    await entrar(page)
    for (const ruta of ['/herramientas', '/herramientas/inventario', '/herramientas/ubicaciones',
      '/herramientas/movimientos', '/herramientas/mantenimiento', '/herramientas/rodados', '/herramientas/etiquetas']) {
      await page.goto(ruta)
      await page.waitForLoadState('networkidle')
      await expect(page.getByText(/espera la migración/i)).toHaveCount(0)
      await page.screenshot({ path: `${CAPTURAS}${ruta.replace(/\//g, '_')}.png`, fullPage: true })
    }
    await page.goto('/herramientas/ubicaciones')
    await expect(page.getByText('Taller').first()).toBeVisible()
    await expect(page.getByText('135').first()).toBeVisible()
    await expect(page.getByText(/SALÓN COMERCIAL/i).first()).toBeVisible()
  })

  test('el menú tiene Herramientas al final y la ruta vieja redirige', async ({ page }) => {
    test.setTimeout(120000)
    await entrar(page)
    await page.goto('/integraciones/herramientas')
    await expect(page).toHaveURL(/\/herramientas(\?|$|\/)/)
    await page.goto('/h/HER-0001')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('HER-0001').first()).toBeVisible()
    await page.screenshot({ path: `${CAPTURAS}_h_HER-0001.png`, fullPage: true })
  })
})

test.describe('módulo Herramientas · teléfono', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('inicio de campo, buscar y la ficha de una herramienta', async ({ page }) => {
    test.setTimeout(180000)
    await entrar(page)
    for (const ruta of ['/campo/herramientas', '/campo/herramientas/buscar', '/h/HER-0001']) {
      await page.goto(ruta)
      await page.waitForLoadState('networkidle')
      await expect(page.getByText(/espera la migración/i)).toHaveCount(0)
      await page.screenshot({ path: `${CAPTURAS}_tel${ruta.replace(/\//g, '_')}.png`, fullPage: true })
    }
  })
})
