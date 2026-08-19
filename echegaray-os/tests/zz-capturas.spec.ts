import { test } from '@playwright/test'
import { entrar } from './util/obras-e2e'

// CAPTURAS PARA LA INSPECCIÓN VISUAL. No es un test: no afirma nada. Existe para MIRAR la pantalla,
// que es el único control que ve un layout roto — un test de tipos no lo ve.
// Se corre a mano y no forma parte de la suite: por eso el prefijo `zz-`.
//
// EL VIEWPORT ES EL DEL OBJETIVO. 1536×1024 es el tamaño del mockup contra el que se compara: una
// captura de 800px de ancho no prueba nada sobre una pantalla que se mira en 1536 o en 2560.

const DIR = process.env.CAPTURAS ?? 'test-results/capturas'

// SAN FRANCISCO TIENE 20 RUBROS Y GALPÓN 9 NINGUNO. Las dos hacen falta: la primera muestra la
// jerarquía Rubro → Actividad como el objetivo la pide, la segunda es la que el dueño abrió cuando
// dijo que no se parecía, y es la que prueba qué pasa cuando el origen no trae la clasificación.
const OBRAS = ['san-francisco', 'le-galpon-9', 'le-comedor']

test('capturas del workspace de la obra', async ({ page }) => {
  test.setTimeout(300000)
  await entrar(page)

  for (const [w, h, sufijo] of [[1536, 1024, '1536'], [2200, 1200, '2200']] as const) {
    await page.setViewportSize({ width: w, height: h })
    for (const obra of OBRAS) {
      await page.goto(`/obras/${obra}?vista=cronograma&sub=gantt`)
      await page.waitForTimeout(2500)
      await page.screenshot({ path: `${DIR}/${sufijo}-${obra}-gantt.png` })
      const fila = page.getByTestId('actividad-cronograma').first()
      if (await fila.count()) {
        await fila.click()
        await page.waitForTimeout(1200)
        await page.screenshot({ path: `${DIR}/${sufijo}-${obra}-panel.png` })
      }
    }
  }

  // El teléfono, que es el aparato del jefe de obra.
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/obras/san-francisco?vista=cronograma&sub=gantt')
  await page.waitForTimeout(2500)
  await page.screenshot({ path: `${DIR}/telefono-gantt.png` })
})
