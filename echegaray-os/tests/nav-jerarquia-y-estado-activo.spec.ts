import { test, expect } from '@playwright/test'

// UX-1 (2026-07-08): navegación por trabajo real en 8 grupos (Dirección, Finanzas,
// Obras, Operación, Administración, Recursos, Operador Digital, Sistema) + resaltado
// de la página activa. Motor de Decisiones/Rutinas/Backlog Autónomo dejan de ser
// links de primer nivel -- pasan a ser secciones de "Operador Digital".

test('la navegación muestra los 8 grupos de trabajo y resalta la página activa', async ({ page }) => {
  await page.goto('/scorecard')

  const nav = page.getByTestId('nav-areas')
  for (const grupo of ['Dirección', 'Finanzas', 'Obras', 'Operación', 'Administración', 'Recursos', 'Operador Digital', 'Sistema']) {
    await expect(nav).toContainText(grupo)
  }

  const linkActivo = nav.getByRole('link', { name: 'Scorecard' })
  await expect(linkActivo).toHaveClass(/bg-gray-900/)

  const linkInactivo = nav.getByRole('link', { name: 'Equipos' })
  await expect(linkInactivo).not.toHaveClass(/bg-gray-900/)
})
