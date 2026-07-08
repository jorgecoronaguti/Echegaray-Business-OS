import { test, expect } from '@playwright/test'

// PR UX-4. Sin login, RLS bloquea correctamente.

test('Operador Digital renderiza sin sesión autenticada y muestra el aviso de RLS', async ({ page }) => {
  const response = await page.goto('/operador-digital')

  expect(response?.status()).toBe(200)
  await expect(page.getByRole('heading', { name: 'Operador Digital', level: 1 })).toBeVisible()
  await expect(page.getByTestId('page-error')).toContainText('No hay sesión autenticada')
  await expect(page.locator('body')).not.toContainText('Application error')
})
