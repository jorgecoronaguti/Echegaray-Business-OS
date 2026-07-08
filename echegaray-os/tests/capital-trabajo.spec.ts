import { test, expect } from '@playwright/test'

// F2 — Capital de Trabajo y Exposición Financiera (primer incremento).
// Sin sesión autenticada, RLS bloquea la lectura — mismo patrón que el resto de la suite.

test('la página de Capital de Trabajo renderiza sin sesión autenticada', async ({ page }) => {
  const response = await page.goto('/capital-trabajo')

  expect(response?.status()).toBe(200)
  await expect(page.getByRole('heading', { name: 'Capital de Trabajo y Exposición Financiera' })).toBeVisible()
  const banner = page.getByTestId('page-error')
  await expect(banner).toBeVisible()
  await expect(banner).toContainText('No hay sesión autenticada')
  await expect(page.getByTestId('capital-trabajo-section')).toHaveCount(0)
  await expect(page.locator('body')).not.toContainText('Application error')
})

test('el link a Capital de Trabajo está disponible desde Administración', async ({ page }) => {
  await page.goto('/administracion')
  await expect(page.getByRole('link', { name: 'Ir a Capital de Trabajo →' })).toBeVisible()
})
