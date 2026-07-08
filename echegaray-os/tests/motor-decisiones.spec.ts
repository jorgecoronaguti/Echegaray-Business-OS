import { test, expect } from '@playwright/test'

// Motor de Decisiones v1 (Track B / B5, OLA 2). Sin login, RLS bloquea correctamente.

test('el Motor de Decisiones renderiza sin sesión autenticada y muestra el aviso de RLS', async ({ page }) => {
  const response = await page.goto('/motor-decisiones')

  expect(response?.status()).toBe(200)
  await expect(page.getByRole('heading', { name: 'Motor de Decisiones', level: 1 })).toBeVisible()
  await expect(page.getByTestId('page-error')).toContainText('No hay sesión autenticada')
  await expect(page.locator('body')).not.toContainText('Application error')
})
