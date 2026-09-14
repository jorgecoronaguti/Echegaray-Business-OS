import { test, expect } from '@playwright/test'
import { entrar } from './util/obras-e2e'

// EL DEFECTO (QA de tercero, 14/09/2026, a 390 px): /clientes → ficha → ATRÁS del navegador dejaba
// «Cargando…» fijo pegado al header hasta recargar. El pedido de la primera navegación quedaba
// guardado y, al volver a su ruta de origen, el indicador lo tomaba como pendiente otra vez.

test.use({ viewport: { width: 390, height: 844 } })

test('volver con ATRÁS no deja el indicador de carga encendido', async ({ page }) => {
  await entrar(page)
  await page.goto('/clientes')
  const indicador = page.getByTestId('indicador-navegacion')

  // SE DEMORA LA NAVEGACIÓN A LA FICHA, NO EL PREFETCH: sin espera fabricada no hay pedido pendiente
  // que mirar, y el test pasaría igual con el arreglo revertido.
  await page.route(/\/clientes\/[^/?]+/, async (route) => {
    if (!route.request().headers()['next-router-prefetch']) await new Promise((r) => setTimeout(r, 2000))
    await route.continue()
  })

  await page.locator('a[href^="/clientes/"]:visible').first().click()
  // Precondición: el indicador SÍ se prende con el clic. Si no, el test no está recorriendo el defecto.
  await expect(indicador).toHaveCount(1, { timeout: 1500 })
  await page.waitForURL(/\/clientes\/[^/?]+/, { timeout: 60000 })
  await expect(indicador).toHaveCount(0, { timeout: 60000 })

  // ATRÁS sin recarga completa: una recarga resetea el estado de React y escondería el defecto.
  let cargasCompletas = 0
  page.on('load', () => { cargasCompletas++ })
  await page.goBack()
  await page.waitForURL(/\/clientes(\?|$)/, { timeout: 60000 })
  // Más que el medio segundo del cartel: antes del arreglo el cartel aparecía al instante y no se iba.
  await page.waitForTimeout(3000)
  expect(cargasCompletas, 'ATRÁS recargó el documento: no prueba el estado del cliente').toBe(0)
  await expect(indicador).toHaveCount(0)
  if (process.env.NAV_CAPTURA) await page.screenshot({ path: process.env.NAV_CAPTURA })
})
