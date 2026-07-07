import { test, expect } from '@playwright/test'

// PRP-010 — Obligaciones y Medios de Pago.
// La UI vive en dos lugares: /obligaciones (general, incluye obligaciones sin obra)
// y dentro de /obras/[id] (obligaciones de esa obra). Sin login todavía, RLS bloquea
// correctamente (mismo patrón que el resto de las capacidades).

test('la página de Obligaciones renderiza sin sesión autenticada y muestra el aviso de RLS', async ({ page }) => {
  const response = await page.goto('/obligaciones')

  expect(response?.status()).toBe(200)
  await expect(page.getByRole('heading', { name: 'Obligaciones y Medios de Pago', level: 1 })).toBeVisible()
  await expect(page.getByTestId('page-error')).toContainText('No hay sesión autenticada')
  await expect(page.locator('body')).not.toContainText('Application error')
})

test('el detalle de obra no crashea al consultar obligaciones sin sesión autenticada', async ({ page }) => {
  const response = await page.goto('/obras/00000000-0000-0000-0000-000000000000')

  expect(response?.status()).toBe(200)
  await expect(page.getByTestId('page-error')).toContainText('No hay sesión autenticada')
  await expect(page.locator('body')).not.toContainText('Application error')
})
