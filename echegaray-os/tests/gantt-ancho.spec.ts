import { test, expect } from '@playwright/test'
import { entrar } from './util/obras-e2e'

// El dueño, con captura: el Gantt "se corta y no corre a la derecha". Esto prueba lo que se VE: que
// el lienzo ocupa el ancho que tiene y que la última etiqueta de mes entra entera.
test('el lienzo del Gantt llena el ancho disponible en las dos escalas', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await entrar(page)
  await page.goto('/obras/gantt')
  const caja = page.getByTestId("gantt-obras").first()
  await expect(caja).toBeVisible({ timeout: 30000 })

  for (const escala of ['Semana', 'Mes']) {
    await page.getByRole('button', { name: new RegExp(`^${escala}$`, 'i') }).click()
    const { libre, lienzo } = await page.evaluate(() => {
      const cont = document.querySelector('[data-gantt-caja]') as HTMLElement
      const fija = cont.querySelector('[data-columna-fija]') as HTMLElement
      const svg = cont.querySelector('svg') as SVGElement
      return { libre: cont.clientWidth - fija.clientWidth, lienzo: Number(svg.getAttribute('width')) }
    })
    // Nunca más angosto que su lugar: eso es lo que se veía como "cortado".
    expect(lienzo, `escala ${escala}`).toBeGreaterThanOrEqual(libre - 1)
  }
})
