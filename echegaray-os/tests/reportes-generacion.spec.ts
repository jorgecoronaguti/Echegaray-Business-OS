import { test, expect } from '@playwright/test'

// Reportes automáticos (2026-07-10): las 3 definiciones seed existen, y generar
// on-demand el Diario de Dirección publica un reporte real con su bloque de
// confianza/fuentes visible. Nota sobre limpieza: a diferencia de otros tests,
// acá NO se borra lo creado — un reporte generado es contenido real y veraz
// (números reales del OS al momento de correr), el historial no tiene policy de
// delete por diseño (los reportes no se borran), y una generación más en el
// historial es exactamente lo que el sistema haría en producción.

const EMAIL = 'jorge.o.corona+direccion-test-1783513222134@gmail.com'
const PASSWORD = 'TestPassword123!'

test('las definiciones seed existen y el Diario de Dirección se genera y publica', async ({ page }) => {
  test.setTimeout(90000)

  await page.goto('/login')
  await page.fill('input[name="email"]', EMAIL)
  await page.fill('input[name="password"]', PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/(dashboard|flujo-caja)/, { timeout: 15000 })

  await page.goto('/reportes')
  await expect(page.getByTestId('definicion-diario-direccion')).toBeVisible()
  await expect(page.getByTestId('definicion-semanal-obras')).toBeVisible()
  await expect(page.getByTestId('definicion-financiero-semanal')).toBeVisible()

  await page.getByTestId('generar-reporte-diario-direccion').click()

  // El reporte publicado aparece con resumen y bloque de confianza/fuentes.
  const reporte = page.getByTestId('reporte-diario-direccion')
  await expect(reporte).toBeVisible({ timeout: 20000 })
  await expect(reporte.getByTestId('reporte-confianza')).toBeVisible()
  await expect(reporte.getByTestId('reporte-confianza')).toContainText('Fuentes:')
})
