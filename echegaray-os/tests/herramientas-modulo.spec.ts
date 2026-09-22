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
    // Cada obra es su propio total y su propio filtro; la ficha se abre desde la lista y se cierra
    // con la × (al lado de «Editar datos»). Sin clavar cuál: las herramientas se mueven de verdad.
    const obra = page.getByTestId('total-obra').first()
    const rotuloObra = (await obra.textContent())!.replace(/\s*\d+\s*$/, '').trim()
    await obra.click()
    await expect(page).toHaveURL(/ubicacion=[0-9a-f-]{36}/)
    await expect(page.getByRole('table', { name: 'Inventario' }).getByText(rotuloObra).first()).toBeVisible()
    await page.getByRole('table', { name: 'Inventario' }).getByText(/[A-Z]{3}-\d{3}/).first().click()
    await expect(page.getByTestId('cerrar-ficha')).toBeVisible()
    await expect(page.getByTestId('editar-ficha')).toBeVisible()
    const x = (await page.getByTestId('cerrar-ficha').boundingBox())!
    const ed = (await page.getByTestId('editar-ficha').boundingBox())!
    expect(ed.x + ed.width <= x.x || x.x + x.width <= ed.x, 'la × no se encima con «Editar datos»').toBe(true)
    await page.screenshot({ path: `${CAPTURAS}_filtro-obra.png`, fullPage: false })
    await page.getByTestId('cerrar-ficha').click()
    await expect(page.getByTestId('cerrar-ficha')).toHaveCount(0)
    await page.getByTestId('total-obra').first().click()
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
    await expect(page.getByTestId('alta-categoria').locator('option')).toHaveCount(15, { timeout: 5000 })
    await page.getByTestId('alta-categoria').selectOption('Transporte en obra')
    await expect(page.getByTestId('alta-cantidad')).toHaveValue('1')
    await expect(page.getByTestId('codigo-prefijo')).toHaveValue('CAR')
    await expect(page.getByTestId('codigo-vista')).toHaveText(/^CAR-\d{3}$/)
    await page.getByTestId('codigo-prefijo').fill('cr-t9')
    await expect(page.getByTestId('codigo-prefijo')).toHaveValue('CRT')
    await page.screenshot({ path: `${CAPTURAS}_alta-codigo.png`, fullPage: false })
  })
})

test.describe('módulo Herramientas · envío a obra y planilla (22/09)', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('armar el envío buscando por nombre y sumando con clics; la planilla del Taller', async ({ page }) => {
    test.setTimeout(180000)
    await entrar(page)
    await page.goto('/herramientas/inventario')
    await page.waitForLoadState('networkidle')
    await page.getByTestId('armar-envio').click()
    await expect(page.getByTestId('envio-vacio')).toBeVisible()
    const sumar = page.getByTestId('agregar-codigo')
    for (const q of ['casco', 'pala ancha']) {
      await sumar.pressSequentially(q, { delay: 40 })
      await page.getByTestId('sumar-opciones').getByRole('option').first().click()
    }
    await expect(page.getByTestId('envio-vacio')).toHaveCount(0)
    await page.getByTestId('destino-mover').click()
    await page.getByRole('listbox').getByRole('option').first().click()
    await expect(page.getByTestId('confirmar-mover')).toBeEnabled()
    // Arriba sigue visible el panel aunque se baje la lista de atrás.
    await page.mouse.move(300, 600)
    await page.mouse.wheel(0, 2000)
    await page.waitForTimeout(300)
    const panel = await page.getByTestId('panel-mover').boundingBox()
    expect(panel && panel.y).toBeLessThanOrEqual(90)
    await page.screenshot({ path: `${CAPTURAS}_envio.png`, fullPage: false })
    // No se confirma: la prueba no mueve herramientas reales.

    await page.goto('/herramientas/ubicaciones?tipo=taller')
    await page.getByTestId('ver-planilla').click()
    await expect(page.getByTestId('planilla')).toBeVisible()
    await expect(page.getByTestId('planilla').locator('tbody tr').first()).toBeVisible()
    await page.screenshot({ path: `${CAPTURAS}_planilla.png`, fullPage: false })
  })
})
