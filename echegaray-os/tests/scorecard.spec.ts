import { test, expect } from '@playwright/test'

// Scorecard vivo (Programa de Ejecución Continua, punto 2). Sin login, RLS bloquea
// correctamente -- mismo patrón que el resto de las capacidades.

test('el Scorecard renderiza sin sesión autenticada y muestra el aviso de RLS', async ({ page }) => {
  const response = await page.goto('/scorecard')

  expect(response?.status()).toBe(200)
  await expect(page.getByRole('heading', { name: 'Scorecard de Madurez (0–10)', level: 1 })).toBeVisible()
  await expect(page.getByTestId('page-error')).toContainText('No hay sesión autenticada')
  await expect(page.locator('body')).not.toContainText('Application error')
})
