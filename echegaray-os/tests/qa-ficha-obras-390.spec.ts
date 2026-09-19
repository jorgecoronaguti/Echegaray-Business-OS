import { test, expect } from '@playwright/test'
import { ADMIN } from './util/identidades'

const CLIENTES = ['messina', 'san-francisco']

async function login(page: import('@playwright/test').Page) {
  await page.goto('/login')
  await page.fill('input[name="email"]', ADMIN.email)
  await page.fill('input[name="password"]', ADMIN.password)
  await page.click('button[type="submit"]')
  await page.waitForURL((u) => new URL(u).pathname === '/administracion', { timeout: 60000 })
}

for (const cliente of CLIENTES) {
  test(`390px — /clientes/${cliente} obras, gastos sin obra, sin desborde`, async ({ page }) => {
    test.setTimeout(90000)
    const errores: string[] = []
    page.on('console', (msg) => { if (msg.type() === 'error') errores.push(msg.text()) })
    page.on('pageerror', (err) => errores.push(String(err)))
    const status5xx: number[] = []
    page.on('response', (r) => { if (r.status() >= 500) status5xx.push(r.status()) })

    await page.setViewportSize({ width: 390, height: 844 })
    await login(page)
    await page.goto(`/clientes/${cliente}`)
    await page.waitForLoadState('networkidle')

    // solapa obras (ya default o hay que clickear)
    const tabObras = page.getByRole('tab', { name: /obras/i }).or(page.getByRole('link', { name: /^obras$/i }))
    if (await tabObras.count()) {
      await tabObras.first().click()
      await page.waitForTimeout(500)
    }

    await page.screenshot({ path: `qa-shots/390-${cliente}-obras.png`, fullPage: true })

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
    console.log(`[${cliente}] 390px scrollWidth=${scrollWidth}`)

    const filaTestId = page.getByTestId('sin-obra-scroll')
    const filaExiste = await filaTestId.count()
    if (filaExiste) {
      const box = await filaTestId.first().boundingBox()
      console.log(`[${cliente}] caja sin-obra-scroll: ${JSON.stringify(box)}`)
      const scrollWidthCaja = await filaTestId.first().evaluate((el) => el.scrollWidth)
      const clientWidthCaja = await filaTestId.first().evaluate((el) => el.clientWidth)
      console.log(`[${cliente}] sin-obra-scroll scrollWidth=${scrollWidthCaja} clientWidth=${clientWidthCaja}`)
    } else {
      console.log(`[${cliente}] sin fila sin-obra-scroll visible (puede que este cliente no tenga gasto sin obra)`)
    }

    // otras solapas
    for (const nombre of [/cobranzas/i, /documentos/i]) {
      const tab = page.getByRole('tab', { name: nombre }).or(page.getByRole('link', { name: nombre }))
      if (await tab.count()) {
        await tab.first().click()
        await page.waitForTimeout(500)
        const sw = await page.evaluate(() => document.documentElement.scrollWidth)
        console.log(`[${cliente}] solapa ${nombre} 390px scrollWidth=${sw}`)
        await page.screenshot({ path: `qa-shots/390-${cliente}-${nombre.source.replace(/\W/g,'')}.png`, fullPage: true })
      }
    }

    console.log(`[${cliente}] errores consola: ${JSON.stringify(errores)}`)
    console.log(`[${cliente}] status>=500: ${JSON.stringify(status5xx)}`)
  })

  test(`1440px — /clientes/${cliente} obras, alineacion fila sin obra`, async ({ page }) => {
    test.setTimeout(90000)
    await page.setViewportSize({ width: 1440, height: 900 })
    await login(page)
    await page.goto(`/clientes/${cliente}`)
    await page.waitForLoadState('networkidle')
    const tabObras = page.getByRole('tab', { name: /obras/i }).or(page.getByRole('link', { name: /^obras$/i }))
    if (await tabObras.count()) {
      await tabObras.first().click()
      await page.waitForTimeout(500)
    }
    await page.screenshot({ path: `qa-shots/1440-${cliente}-obras.png`, fullPage: true })
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
    console.log(`[${cliente}] 1440px scrollWidth=${scrollWidth}`)
  })
}
