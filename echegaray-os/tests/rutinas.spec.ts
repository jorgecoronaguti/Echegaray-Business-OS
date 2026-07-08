import { test, expect } from '@playwright/test'

// Rutinas Proactivas on-demand (Track B / B7, OLA 2). Sin login, RLS bloquea
// correctamente.

test('las Rutinas Proactivas renderizan sin sesión autenticada y muestran el aviso de RLS', async ({ page }) => {
  const response = await page.goto('/rutinas')

  expect(response?.status()).toBe(200)
  await expect(page.getByRole('heading', { name: 'Rutinas Proactivas', level: 1 })).toBeVisible()
  await expect(page.getByTestId('page-error')).toContainText('No hay sesión autenticada')
  await expect(page.locator('body')).not.toContainText('Application error')
})
