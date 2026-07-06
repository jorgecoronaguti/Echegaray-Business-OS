import { test, expect } from '@playwright/test'

// PRP-006 — Gestión Integral de Adicionales.
// La UI vive dentro de /obras/[id] (sección "Adicionales"), no en una ruta propia —
// todo adicional pertenece a una Obra. Sin login todavía, RLS bloquea correctamente
// (mismo patrón que el resto de las capacidades).

test('el detalle de obra no crashea al consultar adicionales sin sesión autenticada', async ({ page }) => {
  const response = await page.goto('/obras/00000000-0000-0000-0000-000000000000')

  expect(response?.status()).toBe(200)
  await expect(page.getByTestId('page-error')).toContainText('No hay sesión autenticada')
  await expect(page.locator('body')).not.toContainText('Application error')
})
