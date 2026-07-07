import { test, expect } from '@playwright/test'

// PRP-012 — Post Mortem de Obra.
// La UI vive dentro de /obras/[id] (sección "Post Mortem"), no en una ruta propia —
// el cierre siempre pertenece a una Obra. Sin login todavía, RLS bloquea
// correctamente (mismo patrón que el resto de las capacidades).

test('el detalle de obra no crashea al consultar el Post Mortem sin sesión autenticada', async ({ page }) => {
  const response = await page.goto('/obras/00000000-0000-0000-0000-000000000000')

  expect(response?.status()).toBe(200)
  await expect(page.getByTestId('page-error')).toContainText('No hay sesión autenticada')
  await expect(page.locator('body')).not.toContainText('Application error')
})
