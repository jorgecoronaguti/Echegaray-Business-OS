import { test, expect } from '@playwright/test'

// Catálogo de preguntas de negocio (Track B / B2). Sin login, RLS bloquea
// correctamente -- mismo patrón que el resto de las capacidades.

test('el Catálogo de Preguntas de Negocio renderiza sin sesión autenticada y muestra el aviso de RLS', async ({
  page,
}) => {
  const response = await page.goto('/preguntas-negocio')

  expect(response?.status()).toBe(200)
  await expect(page.getByRole('heading', { name: 'Catálogo de Preguntas de Negocio', level: 1 })).toBeVisible()
  await expect(page.getByTestId('page-error')).toContainText('No hay sesión autenticada')
  await expect(page.locator('body')).not.toContainText('Application error')
})
