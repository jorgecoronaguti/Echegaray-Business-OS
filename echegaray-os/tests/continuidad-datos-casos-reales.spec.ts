import { test, expect } from '@playwright/test'

// Continuidad Operacional de Datos y Conocimiento -- valida contra hallazgos reales
// del descubrimiento de Drive de esta ola: 6 vehículos reales en Equipos, y al menos
// 1 fuente crítica con problema de frescura visible en /fuentes.

const EMAIL = 'jorge.o.corona+direccion-test-1783513222134@gmail.com'
const PASSWORD = 'TestPassword123!'

test('Equipos muestra los 6 vehículos reales descubiertos en Drive', async ({ page }) => {
  await page.goto('/login')
  await page.fill('input[name="email"]', EMAIL)
  await page.fill('input[name="password"]', PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/dashboard/, { timeout: 10000 })

  await page.goto('/equipos')
  await expect(page.getByTestId('equipo-fila')).toHaveCount(6)
  await expect(page.locator('body')).toContainText('AXH205')
})

test('Fuentes de Datos marca IVA 2026 y TELEGRAMAS como atrasadas', async ({ page }) => {
  await page.goto('/login')
  await page.fill('input[name="email"]', EMAIL)
  await page.fill('input[name="password"]', PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/dashboard/, { timeout: 10000 })

  await page.goto('/fuentes')
  await expect(page.getByTestId('fuentes-criticas-alerta')).toBeVisible()
  await expect(page.locator('body')).toContainText('IVA 2026')
  await expect(page.locator('body')).toContainText('TELEGRAMAS')
})
