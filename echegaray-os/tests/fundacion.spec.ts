import { test, expect } from '@playwright/test'

// PRP-001 / Fase 0 — Fundación (Cliente, Obra, Cuenta financiera, Proveedor)
// Sin proyecto Supabase real conectado todavía (ver Aprendizajes del PRP), por lo que
// estos tests verifican que la página renderiza y degrada con claridad, no un CRUD real
// contra la base de datos.

test('la página de Fundación renderiza las 4 secciones', async ({ page }) => {
  await page.goto('/fundacion')

  await expect(page.getByRole('heading', { name: 'Fundación' })).toBeVisible()
  await expect(page.getByTestId('clientes-section')).toBeVisible()
  await expect(page.getByTestId('obras-section')).toBeVisible()
  await expect(page.getByTestId('cuentas-section')).toBeVisible()
  await expect(page.getByTestId('proveedores-section')).toBeVisible()
})

test('muestra el aviso de Supabase no configurado (sin credenciales reales todavía)', async ({ page }) => {
  await page.goto('/fundacion')

  await expect(page.getByTestId('config-error')).toBeVisible()
  await expect(page.getByTestId('config-error')).toContainText('Supabase no está configurado')
})

test('el formulario de Cliente exige un nombre antes de enviar', async ({ page }) => {
  await page.goto('/fundacion')

  const clienteInput = page.getByTestId('clientes-section').getByPlaceholder('Nombre del cliente')
  await expect(clienteInput).toHaveAttribute('required', '')
})

test('el formulario de Obra no permite elegir un cliente si no hay ninguno cargado', async ({ page }) => {
  await page.goto('/fundacion')

  const obraSubmit = page.getByTestId('obras-section').getByRole('button', { name: 'Agregar' })
  await expect(obraSubmit).toBeDisabled()
})

test('enviar el formulario de Proveedor sin Supabase real muestra el error de conexión, no un crash', async ({
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
