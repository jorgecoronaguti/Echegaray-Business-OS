import { test, expect } from '@playwright/test'

// Equipos y Vehículos (0/10 -> primer dato real, OLA de continuidad). Sin login,
// RLS bloquea correctamente.

test('Equipos y Vehículos renderiza sin sesión autenticada y muestra el aviso de RLS', async ({ page }) => {
  const response = await page.goto('/equipos')

  expect(response?.status()).toBe(200)
  await expect(page.getByRole('heading', { name: 'Equipos y Vehículos', level: 1 })).toBeVisible()
  await expect(page.getByTestId('page-error')).toContainText('No hay sesión autenticada')
  await expect(page.locator('body')).not.toContainText('Application error')
})
