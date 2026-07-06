import { test, expect } from '@playwright/test'

// PRP-002 — Obra como Unidad Económica.
// Conectado a Supabase real; sin login todavía, RLS bloquea correctamente (mismo
// patrón que fundacion.spec.ts / caja.spec.ts).

test('la página de Obras renderiza el formulario y el listado', async ({ page }) => {
  await page.goto('/obras')

  await expect(page.getByRole('heading', { name: 'Obras', level: 1 })).toBeVisible()
  await expect(page.getByTestId('obra-form-section')).toBeVisible()
  await expect(page.getByTestId('obras-section')).toBeVisible()
})

test('sin sesión autenticada, RLS bloquea el acceso con un aviso claro', async ({ page }) => {
  await page.goto('/obras')

  const banner = page.getByTestId('page-error')
  await expect(banner).toBeVisible()
  await expect(banner).toContainText('No hay sesión autenticada')
  await expect(page.locator('body')).not.toContainText('Application error')
})

test('el formulario de Obra pide monto contratado y fechas', async ({ page }) => {
  await page.goto('/obras')

  const form = page.getByTestId('obra-form-section')
  await expect(form.locator('input[name="monto_contratado"]')).toBeVisible()
  await expect(form.locator('input[name="fecha_inicio"]')).toBeVisible()
  await expect(form.locator('input[name="fecha_fin_objetivo"]')).toBeVisible()
})

test('el detalle de una obra inexistente no crashea', async ({ page }) => {
  const response = await page.goto('/obras/00000000-0000-0000-0000-000000000000')

  expect(response?.status()).toBe(200)
  await expect(page.locator('body')).not.toContainText('Application error')
})
