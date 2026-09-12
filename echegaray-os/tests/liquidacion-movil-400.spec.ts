import { test } from '@playwright/test'
import { entrarComo } from './util/login'
import { ADMIN } from './util/identidades'

// LAS TABLAS DE LIQUIDACIÓN EN UN TELÉFONO, A 400 px.
//
// QA visual del 11/09/2026: «Horas», «Pagos», «Convenios» y «Quincena» tienen scroll horizontal
// propio y NO lo dicen —la tabla se corta en el borde sin ningún indicio— y al arrastrar el nombre
// de la persona se va con el resto, así que los números quedan sin dueño. En una pantalla de sueldos
// es la peor forma de leer mal.
//
// No afirma nada: es la evidencia para mirar. Lo que hay que ver en la captura es el degradado del
// borde derecho (hay más) y la columna del nombre quieta después de arrastrar.

const RUTA = '/administracion/personas?vista=liquidacion&quincena=2026-09-01'
const DESTINO = process.env.E2E_CAPTURAS ?? '.playwright'

for (const solapa of ['quincena', 'horas', 'pagos'] as const) {
  test(`captura · ${solapa} a 400 con la tabla desplazada`, async ({ page }) => {
    test.setTimeout(120_000)
    await page.setViewportSize({ width: 400, height: 900 })
    await entrarComo(page, ADMIN.email, ADMIN.password)
    await page.goto(`${RUTA}&solapa=${solapa}`, { waitUntil: 'load' })
    await page.waitForTimeout(2500)
    // SE ARRASTRA LA TABLA: el defecto no se ve en reposo. Sin esto, la captura muestra la primera
    // columna en su lugar natural y no prueba nada sobre el sticky.
    await page.evaluate(() => {
      const marco = [...document.querySelectorAll('div')]
        .find((d) => d.scrollWidth > d.clientWidth + 40)
      if (marco) marco.scrollLeft = 400
    })
    await page.waitForTimeout(400)
    await page.screenshot({ path: `${DESTINO}/${solapa}-400.png`, fullPage: false })
  })
}
