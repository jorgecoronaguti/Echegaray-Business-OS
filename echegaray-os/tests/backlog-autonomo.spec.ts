import { test, expect } from '@playwright/test'

// Backlog Autónomo (Track B / punto 6, OLA 2). Sin login, RLS bloquea correctamente.

test('el Backlog Autónomo renderiza sin sesión autenticada y muestra el aviso de RLS', async ({ page }) => {
  const response = await page.goto('/backlog-autonomo')

  expect(response?.status()).toBe(200)
  await expect(page.getByRole('heading', { name: 'Backlog Autónomo', level: 1 })).toBeVisible()
  await expect(page.getByTestId('page-error')).toContainText('No hay sesión autenticada')
  await expect(page.locator('body')).not.toContainText('Application error')
})
