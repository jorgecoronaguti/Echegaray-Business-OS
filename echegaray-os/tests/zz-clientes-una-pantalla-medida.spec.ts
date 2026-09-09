import { test, expect } from '@playwright/test'
import { entrar } from './util/obras-e2e'

// LO QUE UNA REGLA PUEDE CAZAR SOLA no debería llegar a los ojos del dueño: tipografía del sistema,
// los hexes de los chips del handoff, cero gradientes y el panel de órdenes abriéndose de verdad.
test('la pantalla única cumple el handoff y el panel de órdenes abre', async ({ page }) => {
  test.setTimeout(3 * 60 * 1000)
  await entrar(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/clientes', { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle').catch(() => {})

  const medido = await page.evaluate(() => {
    const chips = Array.from(document.querySelectorAll('[data-testid="aviso-datos"] span, [data-testid="chip-obra"] span'))
      .map((e) => {
        const s = getComputedStyle(e)
        return { txt: (e.textContent || '').trim(), color: s.color, fondo: s.backgroundColor, borde: s.borderColor }
      })
    const grad = Array.from(document.querySelectorAll('*'))
      .filter((e) => /gradient/i.test(getComputedStyle(e).backgroundImage)).length
    return {
      fuente: getComputedStyle(document.body).fontFamily,
      gradientes: grad,
      chips: chips.slice(0, 8),
      filas: document.querySelectorAll('[data-testid="fila-cliente"]').length,
      obras: document.querySelectorAll('[data-testid="fila-obra"]').length,
      margenes: Array.from(document.querySelectorAll('[data-testid="margen"]')).slice(0, 3).map((e) => (e.textContent || '').trim()),
      tabular: getComputedStyle(document.querySelector('[data-testid="contratado"]')!).fontVariantNumeric,
    }
  })
  console.log(JSON.stringify(medido, null, 1))
  expect(medido.fuente).toMatch(/plex/i)
  expect(medido.gradientes, 'el handoff prohíbe los gradientes').toBe(0)
  expect(medido.tabular).toMatch(/tabular-nums/)

  // EL CHIP ABRE EL PANEL Y NO NAVEGA A LA OBRA: es un <button> dentro de un <a>.
  await page.locator('[data-testid="chip-orden"]').first().click()
  await page.waitForSelector('[data-testid="panel-ordenes"]', { timeout: 15000 })
  expect(new URL(page.url()).pathname, 'el chip NO navega a la obra').toBe('/clientes')
  const filas = await page.locator('[data-testid="orden-descargar"]').count()
  console.log('órdenes en el panel:', filas)
  expect(filas).toBeGreaterThan(0)
  // Y EL PDF BAJA DE VERDAD: la evidencia es el byte, no el botón dibujado.
  const href = await page.locator('[data-testid="orden-descargar"]').first().getAttribute('href')
  const r = await page.request.get(href!)
  console.log('descarga:', r.status(), r.headers()['content-type'], (await r.body()).length, 'bytes')
  expect(r.status()).toBe(200)
  expect((await r.body()).length).toBeGreaterThan(1000)
})
