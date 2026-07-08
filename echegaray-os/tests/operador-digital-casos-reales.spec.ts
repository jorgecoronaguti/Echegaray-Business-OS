import { test, expect } from '@playwright/test'

// PR UX-4, con datos reales: al menos una recomendación real (los 4 casos ya
// verificados en motor-decisiones-casos-reales.spec.ts) y el backlog real generado
// automáticamente por detectar_senales_criticas_transversales() (IVA 2026/TELEGRAMAS).

const EMAIL = 'jorge.o.corona+direccion-test-1783513222134@gmail.com'
const PASSWORD = 'TestPassword123!'

test('Operador Digital muestra recomendaciones y backlog real, no una pantalla vacía', async ({ page }) => {
  await page.goto('/login')
  await page.fill('input[name="email"]', EMAIL)
  await page.fill('input[name="password"]', PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/dashboard/, { timeout: 10000 })

  await page.goto('/operador-digital')

  await expect(page.getByTestId('operador-digital-recomendacion').first()).toBeVisible()
  const backlogSection = page.getByTestId('operador-digital-backlog')
  await expect(backlogSection).toContainText('IVA 2026')
})
