import { test, expect } from '@playwright/test'
import { entrarComo } from './util/login'

const EMAIL = 'jorge.o.corona+direccion-test-1783513222134@gmail.com'
const PASSWORD = 'TestPassword123!'

// UX-1 (2026-07-08) pedía navegación por trabajo real en 8 grupos. El 2026-07-09 Jorge decidió que
// el OS se enfoca en Flujo de Caja y sacó del nav todo lo demás (las páginas siguen accesibles por
// URL). Este test afirmaba los 8 grupos viejos y quedó rojo — pero nadie lo vio, porque el arranque
// de Playwright estaba roto (ver playwright.config.ts). Se actualiza a la navegación REAL,
// conservando lo que sigue importando: que el nav esté, y que marque dónde estoy parado.

// 17/08/2026: '01 · Obras' encabeza el nav — es el primer módulo definitivo del OS. 'Comunicación'
// salió: esa pantalla no leía un solo dato, y Mattermost vive en chat.ecsas.com.ar.
// 18/08/2026: el grupo '01 · Obras' arranca por CLIENTES, que es la entidad de arriba del módulo —
// un cliente tiene varias obras. El portafolio plano quedó segundo.
const GRUPOS = ['01 · Obras', 'OS', 'Finanzas', 'Reportes', 'Conexiones']
const LINKS_OBRAS = ['Clientes', 'Todas las obras', 'Pedidos y herramientas']

// OJO: el link rotulado "Scorecard" apunta a /calendario-caja. La página /scorecard existe pero no
// está en el nav, así que visitarla nunca resalta nada — por eso se navega al href real del link.
test('la navegación muestra los grupos vigentes y resalta la página activa', async ({ page }) => {
  // Sin sesión ya no hay nav que mirar: el middleware manda al login antes de renderizar nada.
  await entrarComo(page, EMAIL, PASSWORD)
  await page.goto('/calendario-caja')

  const nav = page.getByTestId('nav-areas')
  for (const grupo of GRUPOS) await expect(nav).toContainText(grupo)
  for (const l of LINKS_OBRAS) await expect(nav.getByRole('link', { name: l, exact: true })).toBeVisible()

  // `exact: true`: el nav tiene DOS links que contienen "Scorecard" —"Scorecard" y "Scorecard
  // Admin/Finanzas"— y sin esto el localizador resolvía al otro y el test fallaba diciendo que la
  // página activa no se resaltaba, cuando lo que pasaba es que miraba el link equivocado.
  const linkActivo = nav.getByRole('link', { name: 'Scorecard', exact: true })
  await expect(linkActivo).toHaveClass(/bg-gray-900/)

  const linkInactivo = nav.getByRole('link', { name: 'Flujo de Caja', exact: true })
  await expect(linkInactivo).not.toHaveClass(/bg-gray-900/)
})
