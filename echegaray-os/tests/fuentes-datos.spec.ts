import { test, expect } from '@playwright/test'

// Continuidad Operacional de Datos y Conocimiento (Track B / B8). Sin login, RLS
// bloquea correctamente.

test('Fuentes de Datos renderiza sin sesión autenticada y muestra el aviso de RLS', async ({ page }) => {
  const response = await page.goto('/fuentes')

  expect(response?.status()).toBe(200)
  await expect(page.getByRole('heading', { name: 'Fuentes de Datos', level: 1 })).toBeVisible()
  await expect(page.getByTestId('page-error')).toContainText('No hay sesión autenticada')
  await expect(page.locator('body')).not.toContainText('Application error')
})
