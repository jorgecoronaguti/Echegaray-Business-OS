import { test } from '@playwright/test'
import { entrar } from './util/obras-e2e'

// CAPTURAS PARA LA INSPECCIÓN VISUAL. No es un test: no afirma nada. Existe para MIRAR la pantalla,
// que es el único control que ve un layout roto — un test de tipos no lo ve.
//
// LOS TRES VIEWPORTS SON LOS QUE IMPORTAN, y el tercero es el que faltaba: el dueño trabaja en un
// monitor de ~3.900 px CSS, donde una fila de 40 px y un texto de 14 se leen como una planilla
// comprimida. Una captura de 1.536 px no dice NADA sobre esa pantalla.

const DIR = process.env.CAPTURAS ?? 'test-results/capturas'
const OBRAS = (process.env.OBRAS ?? 'le-comedor,san-francisco,le-galpon-9').split(',')
const VIEWPORTS: [number, number, string][] = [
  [1536, 1024, '1536'],
  [2200, 1200, '2200'],
  [3900, 1600, '3900'],
]

test('capturas del workspace de la obra', async ({ page }) => {
  test.setTimeout(400000)
  await entrar(page)

  for (const [w, h, sufijo] of VIEWPORTS) {
    await page.setViewportSize({ width: w, height: h })
    for (const obra of OBRAS) {
      await page.goto(`/obras/${obra}?vista=cronograma&sub=gantt`)
      await page.waitForTimeout(2500)
      await page.screenshot({ path: `${DIR}/${sufijo}-${obra}-gantt.png` })
      const fila = page.getByTestId('actividad-cronograma').first()
      if (await fila.count()) {
        await fila.click()
        await page.waitForTimeout(1500)
        await page.screenshot({ path: `${DIR}/${sufijo}-${obra}-panel.png` })
      }
    }
  }

  // El teléfono, que es el aparato del jefe de obra.
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`/obras/${OBRAS[0]}?vista=cronograma&sub=gantt`)
  await page.waitForTimeout(2500)
  await page.screenshot({ path: `${DIR}/telefono-gantt.png` })
})
