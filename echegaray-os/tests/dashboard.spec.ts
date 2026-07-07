import { test, expect } from '@playwright/test'

// PRP-011 — Dashboard de Dirección.
// Cruza Control Económico, Adicionales, Ejecución Financiera, HH, Compras y
// Obligaciones. Sin login todavía, RLS bloquea correctamente (mismo patrón que el
// resto de las capacidades) — no debe crashear con datos parciales o ausentes.

test('el Dashboard renderiza sin sesión autenticada y muestra el aviso de RLS', async ({ page }) => {
  const response = await page.goto('/dashboard')

  expect(response?.status()).toBe(200)
  await expect(page.getByRole('heading', { name: 'Dashboard de Dirección', level: 1 })).toBeVisible()
  await expect(page.getByTestId('page-error')).toContainText('No hay sesión autenticada')
  await expect(page.locator('body')).not.toContainText('Application error')
})
