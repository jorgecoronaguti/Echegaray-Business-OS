import { test, expect } from '@playwright/test'

// PRP-009 — Compras y Abastecimiento de Obra.
// La UI vive dentro de /obras/[id] (sección "Compras y abastecimiento"), no en una
// ruta propia. Sin login todavía, RLS bloquea correctamente (mismo patrón que el
// resto de las capacidades).

test('el detalle de obra no crashea al consultar compras sin sesión autenticada', async ({ page }) => {
  const response = await page.goto('/obras/00000000-0000-0000-0000-000000000000')

  expect(response?.status()).toBe(200)
  await expect(page.getByTestId('page-error')).toContainText('No hay sesión autenticada')
  await expect(page.locator('body')).not.toContainText('Application error')
})
