import { test, expect } from '@playwright/test'

// PR UX-1 (grupo de navegación "Operación"). Sin login, RLS bloquea correctamente.

test('Operación renderiza sin sesión autenticada y muestra el aviso de RLS', async ({ page }) => {
  const response = await page.goto('/operacion')

  expect(response?.status()).toBe(200)
  await expect(page.getByRole('heading', { name: 'Operación', level: 1 })).toBeVisible()
  await expect(page.getByTestId('page-error')).toContainText('No hay sesión autenticada')
  await expect(page.locator('body')).not.toContainText('Application error')
})
