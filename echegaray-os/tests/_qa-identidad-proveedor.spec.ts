import { test, expect } from '@playwright/test'

const EMAIL = 'jorge.o.corona+direccion-test-1783513222134@gmail.com'
const PASSWORD = 'TestPassword123!'

test.setTimeout(120000)

test('QA visual identidad-proveedor en /administracion/compras', async ({ page }) => {
  await page.goto('/login')
  await page.locator('input[name="email"]').fill(EMAIL)
  await page.locator('input[name="password"]').fill(PASSWORD)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 30000 })

  // Fila 70 = DUPEC (proveedor reconocido, texto distinto del canónico)
  await page.goto('/administracion/compras?s=70')
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {})
  await page.waitForSelector('[data-testid="panel-compra-sheet"]', { timeout: 15000 })
  await page.screenshot({ path: 'QA_OUT/01-panel-dupec.png' })
  const lineaDupec = page.getByTestId('identidad-proveedor')
  console.log('DUPEC identidad visible?', await lineaDupec.isVisible().catch(() => false))
  console.log('DUPEC identidad texto:', await lineaDupec.textContent().catch(() => '(none)'))

  // Fila 9 = Movistar (no reconocido)
  await page.goto('/administracion/compras?s=9')
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {})
  await page.waitForSelector('[data-testid="panel-compra-sheet"]', { timeout: 15000 })
  await page.screenshot({ path: 'QA_OUT/02-panel-movistar.png' })
  const lineaMovistar = page.getByTestId('identidad-proveedor')
  console.log('MOVISTAR identidad visible?', await lineaMovistar.isVisible().catch(() => false))
  console.log('MOVISTAR identidad texto:', await lineaMovistar.textContent().catch(() => '(none)'))

  // Móvil angosto 390px sobre el panel de DUPEC, para ver si desborda
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/administracion/compras?s=70')
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {})
  await page.screenshot({ path: 'QA_OUT/03-panel-dupec-390px.png', fullPage: true })
})
