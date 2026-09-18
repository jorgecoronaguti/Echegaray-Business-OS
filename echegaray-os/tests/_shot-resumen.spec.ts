// TEMPORAL — capturas de Analíticas (Resumen, Obras, Nómina, Caja), la ficha del cliente y la ficha de la
// obra para el cotejo del 18/09/2026. No es parte de la suite.
import { test } from '@playwright/test'
import { entrarComo } from './util/login'
import { ADMIN } from './util/identidades'

const ETIQUETA = process.env.SHOT_TAG ?? 'despues'
const DIR = process.env.SHOT_DIR ?? 'tests/qa-shots'

const PAGINAS: [string, string, string][] = [
  ['resumen', '/analiticas', '[data-testid="resumen-por-cliente"]'],
  ['obras-quattropani', '/analiticas?vista=obras&obra=quattropani', '[data-testid="rubros"]'],
  ['obras-azufre', '/analiticas?vista=obras&obra=messina-playon-azufre', '[data-testid="rubros"]'],
  ['nomina', '/analiticas?vista=nomina', 'h1'],
  ['caja', '/analiticas?vista=caja', 'h1'],
  ['crm-quattropani', '/clientes/quattropani', '[data-testid="otros-obra-cliente"]'],
  ['crm-messina', '/clientes/messina', '[data-testid="otros-obra-cliente"]'],
  ['ficha-quattropani', '/obras/quattropani?vista=economia', '[data-testid="economia-contrato"]'],
]

test('capturas para el cotejo', async ({ page }) => {
  test.setTimeout(600_000)
  await entrarComo(page, ADMIN.email, ADMIN.password)
  for (const [nombre, ruta, espera] of PAGINAS) {
    for (const ancho of [1440, 390]) {
      await page.setViewportSize({ width: ancho, height: ancho === 390 ? 900 : 1100 })
      await page.goto(ruta)
      await page.waitForSelector(espera, { timeout: 120_000 }).catch(() => null)
      await page.waitForTimeout(1500)
      // ABRIR LO QUE SE ABRE: los «qué contiene» son <details>; en la captura tienen que verse abiertos.
      await page.$$eval('details', (els) => els.forEach((d) => { (d as HTMLDetailsElement).open = true }))
      await page.waitForTimeout(300)
      await page.screenshot({ path: `${DIR}/${nombre}-${ETIQUETA}-${ancho}.png`, fullPage: true })
      if (nombre.startsWith('obras-') && ancho === 1440) {
        const textos = await page.$$eval('[data-testid^="rubro-"], [data-testid^="lectura-"], [data-testid^="detalle-"]', (els) => els.map((e) => e.textContent?.replace(/\s+/g, ' ').trim()))
        console.log(`TEXTO ${nombre}:\n` + textos.join('\n'))
      }
      if (nombre === 'resumen' && ancho === 1440) {
        const t = await page.$eval('main', (m) => m.textContent?.replace(/\s+/g, ' ').trim().slice(0, 3000))
        console.log('TEXTO resumen:\n' + t)
      }
    }
  }
})
