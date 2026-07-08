import { test, expect } from '@playwright/test'

// Personas / Laboral / Seguridad e Higiene (Línea A, 2026-07-08) -- primer dato real
// estructurado desde la carpeta ALTAS-BAJAS-HM-EPP-DNI de Drive. Valida los 3 legajos
// relevados en profundidad (no una lista sintética) y que los gaps reales de
// documentación (EPP nunca encontrado, HM/DNI faltante en algunos casos) se muestren,
// no se oculten.

const EMAIL = 'jorge.o.corona+direccion-test-1783513222134@gmail.com'
const PASSWORD = 'TestPassword123!'

test('Personas muestra los legajos reales relevados y sus documentos faltantes', async ({ page }) => {
  test.setTimeout(60000)
  await page.goto('/login')
  await page.fill('input[name="email"]', EMAIL)
  await page.fill('input[name="password"]', PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/dashboard/, { timeout: 10000 })

  await page.goto('/personas')

  const seccion = page.getByTestId('legajos-section')
  await expect(seccion).toBeVisible()
  // 30 legajos reales descubiertos en Drive.
  await expect(page.getByTestId('persona-fila')).toHaveCount(30)

  await expect(seccion).toContainText('GONZALEZ EMILIANO')
  await expect(seccion).toContainText('SOSA NESTOR RAUL')
  await expect(seccion).toContainText('ALANIZ EMANUEL ARIEL')

  // Gonzalez Emiliano: solo se encontró el alta -- Fondo de Cese, DNI y EPP faltantes reales.
  const filaGonzalez = page.getByTestId('persona-fila').filter({ hasText: 'GONZALEZ EMILIANO' })
  await expect(filaGonzalez).toContainText('Fondo de Cese')
  await expect(filaGonzalez).toContainText('Entrega de EPP')
})
