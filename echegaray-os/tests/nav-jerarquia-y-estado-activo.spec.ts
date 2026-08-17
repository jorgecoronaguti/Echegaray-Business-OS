import { test, expect } from '@playwright/test'

// UX-1 (2026-07-08) pedía navegación por trabajo real en 8 grupos. El 2026-07-09 Jorge decidió que
// el OS se enfoca en Flujo de Caja y sacó del nav todo lo demás (las páginas siguen accesibles por
// URL). Este test afirmaba los 8 grupos viejos y quedó rojo — pero nadie lo vio, porque el arranque
// de Playwright estaba roto (ver playwright.config.ts). Se actualiza a la navegación REAL,
// conservando lo que sigue importando: que el nav esté, y que marque dónde estoy parado.

// 17/08/2026: '01 · Obras' encabeza el nav — es el primer módulo definitivo del OS. 'Comunicación'
// salió: esa pantalla no leía un solo dato, y Mattermost vive en chat.ecsas.com.ar.
const GRUPOS = ['01 · Obras', 'OS', 'Finanzas', 'Reportes', 'Conexiones']

// OJO: el link rotulado "Scorecard" apunta a /calendario-caja. La página /scorecard existe pero no
// está en el nav, así que visitarla nunca resalta nada — por eso se navega al href real del link.
test('la navegación muestra los grupos vigentes y resalta la página activa', async ({ page }) => {
  await page.goto('/calendario-caja')

  const nav = page.getByTestId('nav-areas')
  for (const grupo of GRUPOS) await expect(nav).toContainText(grupo)

  const linkActivo = nav.getByRole('link', { name: 'Scorecard' })
  await expect(linkActivo).toHaveClass(/bg-gray-900/)

  const linkInactivo = nav.getByRole('link', { name: 'Flujo de Caja' })
  await expect(linkInactivo).not.toHaveClass(/bg-gray-900/)
})
