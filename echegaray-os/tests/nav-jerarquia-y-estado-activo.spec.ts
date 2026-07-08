import { test, expect } from '@playwright/test'

// UX (2026-07-08): la navegación pasó de 14 links planos a 2 grupos con etiqueta
// (Áreas / Sistema) + resaltado de la página activa (heurística "visibilidad del
// estado del sistema" -- antes ningún link indicaba dónde estabas parado).

test('la navegación muestra los grupos Áreas y Sistema, y resalta la página activa', async ({ page }) => {
  await page.goto('/scorecard')

  const nav = page.getByTestId('nav-areas')
  await expect(nav).toContainText('Áreas')
  await expect(nav).toContainText('Sistema')

  const linkActivo = nav.getByRole('link', { name: 'Scorecard' })
  await expect(linkActivo).toHaveClass(/bg-gray-900/)

  const linkInactivo = nav.getByRole('link', { name: 'Equipos' })
  await expect(linkInactivo).not.toHaveClass(/bg-gray-900/)
})
