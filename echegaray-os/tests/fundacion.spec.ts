import { test, expect } from '@playwright/test'

// PRP-001 / Fase 0 — Fundación (Cliente, Cuenta financiera, Proveedor).
// Obra se mudó a su propio feature (PRP-002, ver tests/obras.spec.ts) — es la unidad
// económica central, ya no un dato de referencia simple como estos tres.
// Conectado a un proyecto Supabase real (migraciones aplicadas, RLS verificado vía MCP).
// Todavía no existe login real (feature separada), así que el request del servidor no
// tiene sesión autenticada: RLS bloquea correctamente con "permission denied" — eso es
// el comportamiento esperado y correcto, no un error de configuración.

test('la página de Fundación renderiza las 3 secciones', async ({ page }) => {
  await page.goto('/fundacion')

  await expect(page.getByRole('heading', { name: 'Fundación' })).toBeVisible()
  await expect(page.getByTestId('clientes-section')).toBeVisible()
  await expect(page.getByTestId('cuentas-section')).toBeVisible()
  await expect(page.getByTestId('proveedores-section')).toBeVisible()
})

test('sin sesión autenticada, RLS bloquea el acceso con un aviso claro (no "no configurado")', async ({
  page,
}) => {
  await page.goto('/fundacion')

  const banner = page.getByTestId('config-error')
  await expect(banner).toBeVisible()
  await expect(banner).toContainText('No hay sesión autenticada')
  await expect(banner).toContainText('permission denied')
  await expect(page.locator('body')).not.toContainText('Application error')
})

test('el formulario de Cliente exige un nombre antes de enviar', async ({ page }) => {
  await page.goto('/fundacion')

  const clienteInput = page.getByTestId('clientes-section').getByPlaceholder('Nombre del cliente')
  await expect(clienteInput).toHaveAttribute('required', '')
})

test('enviar el formulario de Proveedor sin sesión autenticada muestra el error de RLS, no un crash', async ({
  page,
}) => {
  await page.goto('/fundacion')

  const section = page.getByTestId('proveedores-section')
  await section.getByPlaceholder('Nombre del proveedor').fill('Corralon de prueba Playwright')
  await section.getByRole('button', { name: 'Agregar' }).click()
  await expect(section.getByRole('button', { name: 'Agregar' })).toBeVisible()

  await expect(section.locator('.text-red-600')).toBeVisible()
  await expect(page.locator('body')).not.toContainText('Application error')
})
