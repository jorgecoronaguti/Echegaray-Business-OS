import { test, expect } from '@playwright/test'

// UX-1 (2026-07-08): la home de Dirección debe responder en <30s "qué pasa, qué
// decidir, cómo está la caja, qué obra mirar, qué acción está vencida y qué está
// haciendo el OS solo" -- sin navegar 8 secciones técnicas separadas.

const EMAIL = 'jorge.o.corona+direccion-test-1783513222134@gmail.com'
const PASSWORD = 'TestPassword123!'

test('la home de Dirección muestra Decidir hoy, Caja, Obras, Acciones y OS trabajando con datos reales', async ({
  page,
}) => {
  await page.goto('/login')
  await page.fill('input[name="email"]', EMAIL)
  await page.fill('input[name="password"]', PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/dashboard/, { timeout: 10000 })

  await expect(page.getByTestId('direccion-decidir-hoy')).toBeVisible()
  await expect(page.getByTestId('direccion-riesgos-abiertos')).toBeVisible()

  const cajaSection = page.getByTestId('direccion-caja')
  await expect(cajaSection).toContainText('Caja actual')

  const obrasSection = page.getByTestId('direccion-obras')
  await expect(obrasSection).toContainText('Pisos')

  await expect(page.getByTestId('direccion-acciones')).toContainText('Vencidas')
  await expect(page.getByTestId('direccion-os-trabajando')).toContainText('Fuentes críticas atrasadas')
})
