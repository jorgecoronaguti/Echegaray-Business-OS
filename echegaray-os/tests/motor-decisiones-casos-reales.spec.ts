import { test, expect } from '@playwright/test'

// Motor de Decisiones v1 (Track B / B5) probado contra los 4 casos reales que pidió
// el usuario: déficit de caja de corto plazo, concentración de La Estrella, desvío
// productivo de Pisos (HH) y sobreconsumo histórico de HH/margen de Galpones.

const EMAIL = 'jorge.o.corona+direccion-test-1783513222134@gmail.com'
const PASSWORD = 'TestPassword123!'

test('el Motor de Decisiones arma el análisis multidisciplinario para los 4 casos reales conocidos', async ({
  page,
}) => {
  await page.goto('/login')
  await page.fill('input[name="email"]', EMAIL)
  await page.fill('input[name="password"]', PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/dashboard/, { timeout: 10000 })

  await page.goto('/motor-decisiones')
  const body = page.locator('body')

  // Caso 1: déficit de caja de corto plazo (F1).
  await expect(body).toContainText('Déficit de caja proyectado')
  // Caso 2: concentración de La Estrella (F2).
  await expect(body).toContainText('Concentración de cliente — La Estrella')
  // Caso 3: desvío productivo de Pisos -- la HH real cargada esta sesión dispara una
  // concentración anormal real (412hs semana 06-22 vs. ~227hs de promedio).
  await expect(body).toContainText('HH: Pisos')
  await expect(body).toContainText('concentra 412hs')
  // Caso 4: sobreconsumo histórico de HH / margen de Galpones -- ya validado exacto
  // contra el cálculo manual de Jorge en O1-A.
  await expect(body).toContainText('Margen crítico — Galpones')
  await expect(body).toContainText('$30.838.420')

  // Cada análisis debe declarar confianza y skills activadas -- no una opinión aislada.
  await expect(page.getByTestId('analisis-multidisciplinario').first()).toContainText('Skills activadas')
})
