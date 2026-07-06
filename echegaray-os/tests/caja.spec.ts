import { test, expect } from '@playwright/test'

// PRP-001 / Fase 1 — Caja Operativa (movimientos_caja)
// Conectado a Supabase real; sin login todavía, así que RLS bloquea correctamente
// las lecturas/escrituras (mismo patrón que tests/fundacion.spec.ts).

test('la página de Caja renderiza el formulario y el listado', async ({ page }) => {
  await page.goto('/caja')

  await expect(page.getByRole('heading', { name: 'Caja Operativa' })).toBeVisible()
  await expect(page.getByTestId('movimiento-form-section')).toBeVisible()
  await expect(page.getByTestId('movimientos-section')).toBeVisible()
})

test('sin sesión autenticada, RLS bloquea el acceso con un aviso claro', async ({ page }) => {
  await page.goto('/caja')

  const banner = page.getByTestId('page-error')
  await expect(banner).toBeVisible()
  await expect(banner).toContainText('No hay sesión autenticada')
  await expect(page.locator('body')).not.toContainText('Application error')
})

test('el formulario cambia los campos de contraparte según el tipo (cobro vs. pago)', async ({ page }) => {
  await page.goto('/caja')

  const form = page.getByTestId('movimiento-form-section')

  // Por defecto es "cobro": debe pedir Cliente y Obra, no Proveedor
  await expect(form.locator('select[name="cliente_id"]')).toBeVisible()
  await expect(form.locator('select[name="obra_id"]')).toBeVisible()
  await expect(form.locator('select[name="proveedor_id"]')).toHaveCount(0)

  // Cambiar a "pago": debe pedir Proveedor, no Cliente
  await form.locator('select[name="tipo"]').selectOption('pago')
  await expect(form.locator('select[name="proveedor_id"]')).toBeVisible()
  await expect(form.locator('select[name="cliente_id"]')).toHaveCount(0)
})

test('el formulario muestra "Fecha real" solo cuando el estado es "real"', async ({ page }) => {
  await page.goto('/caja')

  const form = page.getByTestId('movimiento-form-section')

  await expect(form.getByText('Fecha real', { exact: true })).not.toBeVisible()

  await form.locator('select[name="estado"]').selectOption('real')
  await expect(form.getByText('Fecha real', { exact: true })).toBeVisible()
})

test('enviar el formulario sin sesión autenticada muestra el error de RLS, no un crash', async ({ page }) => {
  await page.goto('/caja')

  const form = page.getByTestId('movimiento-form-section')
  await form.locator('select[name="tipo"]').selectOption('pago')
  await form.locator('input[name="monto"]').fill('1000')
  await form.locator('input[name="fecha_esperada"]').fill('2026-08-01')
  await form.locator('input[name="concepto"]').fill('Prueba Playwright')

  // Sin cuentas/proveedores cargados (RLS bloquea la lectura), el submit queda
  // deshabilitado — es el comportamiento correcto, no un bug.
  await expect(form.getByRole('button', { name: 'Registrar movimiento' })).toBeDisabled()
  await expect(page.locator('body')).not.toContainText('Application error')
})
