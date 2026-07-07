import { test, expect } from '@playwright/test'

// Fase II — Arquitectura Operativa por Áreas + Centro de Acción.
// Sin login todavía, RLS bloquea correctamente (mismo patrón que el resto de las
// capacidades) — cada página nueva debe responder 200, mostrar el aviso de RLS, y no
// crashear con datos ausentes.

const PAGINAS_DE_AREA = [
  { ruta: '/administracion', encabezado: 'Administración y Finanzas' },
  { ruta: '/compras', encabezado: 'Compras y Abastecimiento' },
  { ruta: '/personas', encabezado: 'Personas y Productividad' },
  { ruta: '/comercial', encabezado: 'Comercial / Presupuestación' },
]

for (const { ruta, encabezado } of PAGINAS_DE_AREA) {
  test(`el área "${encabezado}" renderiza sin sesión autenticada`, async ({ page }) => {
    const response = await page.goto(ruta)

    expect(response?.status()).toBe(200)
    await expect(page.getByRole('heading', { name: encabezado, level: 1 })).toBeVisible()
    await expect(page.getByTestId('page-error')).toContainText('No hay sesión autenticada')
    await expect(page.locator('body')).not.toContainText('Application error')
  })
}

test('el Centro de Acción renderiza sin sesión autenticada', async ({ page }) => {
  const response = await page.goto('/acciones')

  expect(response?.status()).toBe(200)
  await expect(page.getByRole('heading', { name: 'Centro de Acción', level: 1 })).toBeVisible()
  await expect(page.getByTestId('page-error')).toContainText('No hay sesión autenticada')
  await expect(page.locator('body')).not.toContainText('Application error')
})

test('la navegación por áreas está disponible desde cualquier página', async ({ page }) => {
  await page.goto('/dashboard')
  const nav = page.getByTestId('nav-areas')
  await expect(nav).toBeVisible()
  await expect(nav.getByRole('link', { name: 'Dirección' })).toBeVisible()
  await expect(nav.getByRole('link', { name: 'Centro de Acción' })).toBeVisible()
})
