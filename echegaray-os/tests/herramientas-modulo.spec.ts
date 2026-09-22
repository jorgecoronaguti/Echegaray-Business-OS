import { test, expect } from '@playwright/test'
import { entrar } from './util/obras-e2e'

// HERRAMIENTAS · ETAPA 1 contra la base con la migración 20260921T2100 aplicada (22/09/2026).
// Lectura solamente: lo que la importación dejó tiene que verse en cada pantalla, nunca el aviso
// de «espera la migración» ni un cero. Las cifras son las que la importación verificó en la base:
// 178 herramientas, 135 en el Taller, 40 en QP Salón Comercial.

const CAPTURAS = 'test-results/herramientas'

test.describe('módulo Herramientas · escritorio', () => {
  test.use({ viewport: { width: 1440, height: 1000 } })

  test('las solapas muestran lo importado, no el aviso de migración', async ({ page }) => {
    test.setTimeout(180000)
    await entrar(page)
    for (const ruta of ['/herramientas', '/herramientas/inventario', '/herramientas/ubicaciones',
      '/herramientas/movimientos', '/herramientas/mantenimiento', '/herramientas/rodados', '/herramientas/etiquetas']) {
      await page.goto(ruta)
      await page.waitForLoadState('networkidle')
      await expect(page.getByText(/espera la migración/i)).toHaveCount(0)
      await page.screenshot({ path: `${CAPTURAS}${ruta.replace(/\//g, '_')}.png`, fullPage: true })
    }
    await page.goto('/herramientas/ubicaciones')
    await expect(page.getByText('Taller').first()).toBeVisible()
    // Sin clavar cuántas hay: el número cambia con cada movimiento real (el dueño mueve y da de baja).
    await expect(page.getByText(/SALÓN COMERCIAL/i).first()).toBeVisible()
  })

  test('el menú tiene Herramientas al final y la ruta vieja redirige', async ({ page }) => {
    test.setTimeout(120000)
    await entrar(page)
    await page.goto('/integraciones/herramientas')
    await expect(page).toHaveURL(/\/herramientas(\?|$|\/)/)
    // Una etiqueta del primer esquema (HER-0024) abre la ficha con el código de hoy (AMO-001).
    await page.goto('/h/HER-0024')
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveURL(/activo=AMO-001/)
    await expect(page.getByText('AMO-001').first()).toBeVisible()
    await page.screenshot({ path: `${CAPTURAS}_h_HER-0024.png`, fullPage: false })
  })
})

test.describe('módulo Herramientas · teléfono', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('inicio de campo, buscar y la ficha de una herramienta', async ({ page }) => {
    test.setTimeout(180000)
    await entrar(page)
    for (const ruta of ['/campo/herramientas', '/campo/herramientas/buscar', '/h/AMO-001']) {
      await page.goto(ruta)
      await page.waitForLoadState('networkidle')
      await expect(page.getByText(/espera la migración/i)).toHaveCount(0)
      await page.screenshot({ path: `${CAPTURAS}_tel${ruta.replace(/\//g, '_')}.png`, fullPage: true })
    }
  })
})

test.describe('módulo Herramientas · inventario (22/09)', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('buscador con sugerencias, cabecera fija al bajar y código guiado en el alta', async ({ page }) => {
    test.setTimeout(180000)
    await entrar(page)
    await page.goto('/herramientas/inventario')
    await page.waitForLoadState('networkidle')
    await expect(page.getByTestId('totales-inventario')).toContainText(/\d+ activos/)
    const buscar = page.getByTestId('buscar-inventario')
    await buscar.click()
    await buscar.pressSequentially('amol', { delay: 60 })
    const sug = page.getByTestId('sugerencias-inventario')
    await expect(sug).toBeVisible()
    await expect(sug.getByRole('option').first()).toContainText(/Amoladora/)
    await page.screenshot({ path: `${CAPTURAS}_buscador.png`, fullPage: false })
    await page.keyboard.press('Escape')
    await buscar.fill('')
    await page.waitForTimeout(600)
    await page.mouse.wheel(0, 2500)
    await page.waitForTimeout(400)
    const cab = page.getByTestId('cabecera-inventario')
    const caja = await cab.boundingBox()
    expect(caja && caja.y).toBeLessThan(120)
    await page.screenshot({ path: `${CAPTURAS}_cabecera-fija.png`, fullPage: false })
    await page.mouse.wheel(0, -5000)
    await page.getByTestId('nuevo-activo').click()
    await page.getByTestId('alta-nombre').fill('Carretilla verde')
    await expect(page.getByTestId('codigo-prefijo')).toHaveValue('CAR')
    await expect(page.getByTestId('codigo-vista')).toHaveText(/^CAR-\d{3}$/)
    await page.getByTestId('codigo-prefijo').fill('cr-t9')
    await expect(page.getByTestId('codigo-prefijo')).toHaveValue('CRT')
    await page.screenshot({ path: `${CAPTURAS}_alta-codigo.png`, fullPage: false })
  })
})
