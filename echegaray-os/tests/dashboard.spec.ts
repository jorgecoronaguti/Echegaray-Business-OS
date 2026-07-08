import { test, expect } from '@playwright/test'

// PRP-011 / UX-1 — Home de Dirección.
// Cruza Control Económico, Adicionales, Ejecución Financiera, HH, Compras,
// Obligaciones, Caja, Obras, Acciones y Backlog Autónomo en una sola vista accionable
// ("Decidir hoy"). Sin login todavía, RLS bloquea correctamente (mismo patrón que el
// resto de las capacidades) — no debe crashear con datos parciales o ausentes.

test('la home de Dirección renderiza sin sesión autenticada y muestra el aviso de RLS', async ({ page }) => {
  const response = await page.goto('/dashboard')

  expect(response?.status()).toBe(200)
  await expect(page.getByRole('heading', { name: 'Dirección', level: 1 })).toBeVisible()
  await expect(page.getByTestId('page-error')).toContainText('No hay sesión autenticada')
  await expect(page.locator('body')).not.toContainText('Application error')
})
