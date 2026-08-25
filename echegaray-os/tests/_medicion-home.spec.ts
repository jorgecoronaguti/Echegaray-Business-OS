import { test, expect } from '@playwright/test'
const EMAIL = 'jorge.o.corona+direccion-test-1783513222134@gmail.com'
const PASSWORD = 'TestPassword123!'
const RUTAS = ["/administracion"]
test('medir', async ({ page }) => {
  test.setTimeout(900000)
  await page.goto('/login')
  await page.fill('input[name="email"]', EMAIL)
  await page.fill('input[name="password"]', PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/(obras|clientes|flujo-caja|hoy)/, { timeout: 180000 })
  for (const ruta of RUTAS) {
    for (let i = 0; i < 2; i++) await page.goto(ruta, { waitUntil: 'domcontentloaded', timeout: 180000 })
    const ms: number[] = []
    for (let i = 0; i < 11; i++) {
      await page.goto(ruta, { waitUntil: 'domcontentloaded', timeout: 180000 })
      const t = await page.evaluate(() => {
        const n = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming
        return { start: n.responseStart, end: n.responseEnd }
      })
      ms.push(Math.round(t.end - t.start))
    }
    const o = [...ms].sort((a, b) => a - b)
    console.log(`MEDIDA ${ruta}  mediana=${o[5]} ms  min=${o[0]}  max=${o[10]}  todas=${ms.join(' ')}`)
  }
  expect(true).toBe(true)
})
