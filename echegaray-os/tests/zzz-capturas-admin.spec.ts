import { test } from '@playwright/test'
import { entrar } from './util/obras-e2e'

// CAPTURAS DE ADMINISTRACIÓN PARA MIRARLAS. No afirma nada: existe para ver el layout, que es el
// único control que detecta una pantalla rota — un test de tipos no la ve.
const DIR = process.env.CAPTURAS ?? 'test-results/capturas-admin'

const RUTAS: [string, string][] = [
  ['/administracion', 'entrada'],
  ['/administracion/personas', 'personas'],
  ['/administracion/personas?nueva=1', 'personas-alta'],
  ['/administracion/personas?f=inactivos', 'personas-inactivos'],
  ['/administracion/personas/cuadrillas', 'cuadrillas'],
  ['/administracion/proveedores', 'proveedores'],
  ['/administracion/proveedores?vista=resolver', 'proveedores-resolver'],
  ['/administracion/pendientes', 'pendientes'],
  ['/administracion/usuarios', 'usuarios'],
]

test('capturas de Administración', async ({ page }) => {
  test.setTimeout(400000)
  await entrar(page)
  for (const [w, sufijo] of [[1536, '1536'], [390, '390']] as [number, string][]) {
    await page.setViewportSize({ width: w, height: w === 390 ? 844 : 1024 })
    for (const [ruta, nombre] of RUTAS) {
      await page.goto(ruta)
      await page.waitForTimeout(1500)
      // La sesión se cae sola después de varias navegaciones seguidas (el middleware rota el
      // refresh token). Si aterrizó en el login, se vuelve a entrar y se repite la navegación: si no,
      // la captura sería del login y no diría nada de la pantalla.
      if (page.url().includes('/login')) {
        await entrar(page)
        await page.goto(ruta)
        await page.waitForTimeout(1800)
      }
      await page.screenshot({ path: `${DIR}/${sufijo}-${nombre}.png`, fullPage: true })
    }
  }
  // Una ficha real, si hay alguien en el plantel.
  await page.setViewportSize({ width: 1536, height: 1024 })
  await page.goto('/administracion/personas')
  await page.waitForTimeout(1500)
  const fila = page.getByTestId('abrir-persona').first()
  if (await fila.count()) {
    await fila.click()
    await page.waitForURL(/\/administracion\/personas\/[^/?]+$/, { timeout: 30000 })
    await page.getByTestId('entity-header').waitFor({ timeout: 30000 })
    await page.waitForTimeout(1200)
    await page.screenshot({ path: `${DIR}/1536-legajo.png`, fullPage: true })
    for (const v of ['asignaciones', 'horas', 'documentos']) {
      await page.getByTestId(`nav-ficha-${v}`).click()
      await page.waitForTimeout(1500)
      await page.screenshot({ path: `${DIR}/1536-legajo-${v}.png`, fullPage: true })
    }
  }
  // Y una cuadrilla abierta, si hay alguna.
  await page.goto('/administracion/personas/cuadrillas')
  await page.waitForTimeout(1500)
  const cuad = page.getByTestId('abrir-cuadrilla').first()
  if (await cuad.count()) {
    await cuad.click()
    await page.getByTestId('panel-cuadrilla').waitFor({ timeout: 30000 })
    await page.waitForTimeout(1200)
    await page.screenshot({ path: `${DIR}/1536-cuadrilla-panel.png`, fullPage: true })
  }
  // Un proveedor abierto: es donde vive la ficha con los nombres de Compras vinculados.
  await page.goto('/administracion/proveedores')
  await page.waitForTimeout(1500)
  const prov = page.getByTestId('abrir-proveedor').first()
  if (await prov.count()) {
    await prov.click()
    await page.getByTestId('panel-proveedor').waitFor({ timeout: 30000 })
    await page.waitForTimeout(1200)
    await page.screenshot({ path: `${DIR}/1536-proveedor-ficha.png`, fullPage: true })
  }
  // Y un texto pendiente abierto.
  await page.goto('/administracion/pendientes')
  await page.waitForTimeout(2500)
  const pend = page.getByTestId('abrir-pendiente').first()
  if (await pend.count()) {
    await pend.click()
    await page.getByTestId('panel-pendiente').waitFor({ timeout: 30000 })
    await page.waitForTimeout(1200)
    await page.screenshot({ path: `${DIR}/1536-pendiente-panel.png`, fullPage: true })
  }
})
