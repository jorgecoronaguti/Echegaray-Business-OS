// TEMPORAL — capturas de Analíticas (Resumen, Obras, Nómina, Caja), la ficha del cliente y la ficha de la
// obra para el cotejo del 18/09/2026. No es parte de la suite.
import { test } from '@playwright/test'
import { entrarComo } from './util/login'
import { ADMIN } from './util/identidades'

const ETIQUETA = process.env.SHOT_TAG ?? 'despues'
const DIR = process.env.SHOT_DIR ?? 'tests/qa-shots'

const TODAS: [string, string, string][] = [
  ['resumen', '/analiticas', '[data-testid="resumen-por-cliente"]'],
  ['obras-quattropani', '/analiticas?vista=obras&obra=quattropani', '[data-testid="rubros"]'],
  ['obras-azufre', '/analiticas?vista=obras&obra=messina-playon-azufre', '[data-testid="rubros"]'],
  ['obras-bsa', '/analiticas?vista=obras&obra=messina-bsa', '[data-testid="rubros"]'],
  ['nomina', '/analiticas?vista=nomina', 'h1'],
  ['caja', '/analiticas?vista=caja', 'h1'],
  ['crm-quattropani', '/clientes/quattropani', '[data-testid="otros-obra-cliente"]'],
  ['crm-messina', '/clientes/messina', '[data-testid="otros-obra-cliente"]'],
  ['ficha-quattropani', '/obras/quattropani?vista=economia', '[data-testid="economia-contrato"]'],
]
// SHOT_ONLY=resumen,obras-bsa recorta la corrida — la VM tiene poca memoria para el navegador y una
// corrida de 9 páginas × 2 anchos en la misma pestaña de dev (Turbopack + HMR) la hacía crashear.
const SOLO = process.env.SHOT_ONLY?.split(',').map((s) => s.trim())
const PAGINAS = SOLO ? TODAS.filter(([n]) => SOLO.includes(n)) : TODAS

test('capturas para el cotejo', async ({ page }) => {
  test.setTimeout(600_000)
  await entrarComo(page, ADMIN.email, ADMIN.password)
  for (const [nombre, ruta, espera] of PAGINAS) {
    for (const ancho of [1440, 390]) {
      await page.setViewportSize({ width: ancho, height: ancho === 390 ? 900 : 1100 })
      await page.goto(ruta)
      await page.waitForSelector(espera, { timeout: 120_000 }).catch(() => null)
      await page.waitForTimeout(1500)
      // EL TEXTO SE LEE ANTES DE ABRIR LOS <details> Y SACAR LA CAPTURA: la VM tiene poca memoria para
      // el navegador y esas dos operaciones son las que la hacen crashear; si crashean, la evidencia de
      // texto ya quedó en la consola.
      if (nombre.startsWith('obras-') && ancho === 1440) {
        const cabecera = await page.$eval('h1', (h1) => h1.parentElement?.parentElement?.textContent?.replace(/\s+/g, ' ').trim())
        console.log(`CABECERA ${nombre}:\n` + cabecera)
        const textos = await page.$$eval('[data-testid^="rubro-"], [data-testid^="lectura-"], [data-testid^="detalle-"]', (els) => els.map((e) => e.textContent?.replace(/\s+/g, ' ').trim()))
        console.log(`TEXTO ${nombre}:\n` + textos.join('\n'))
      }
      if (nombre === 'resumen' && ancho === 1440) {
        const t = await page.$eval('main', (m) => m.textContent?.replace(/\s+/g, ' ').trim().slice(0, 3000))
        console.log('TEXTO resumen:\n' + t)
      }
      if (process.env.SHOT_LITE) {
        // MODO LIVIANO: sin abrir <details> ni página completa — la VM se queda sin memoria en el
        // navegador con el render entero de esta pantalla abierta. Sirve para confirmar cabecera y
        // rubros; el detalle expandido se probó por texto (consola), no por esta captura.
        await page.screenshot({ path: `${DIR}/${nombre}-${ETIQUETA}-${ancho}.png` })
      } else {
        // ABRIR LO QUE SE ABRE: los «qué contiene» son <details>; en la captura tienen que verse abiertos.
        await page.$$eval('details', (els) => els.forEach((d) => { (d as HTMLDetailsElement).open = true }))
        await page.waitForTimeout(300)
        await page.screenshot({ path: `${DIR}/${nombre}-${ETIQUETA}-${ancho}.png`, fullPage: true })
      }
    }
  }
})
