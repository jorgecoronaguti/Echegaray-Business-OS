import { test, expect } from '@playwright/test'
import { entrarComo } from './util/login'
import { ADMIN } from './util/identidades'

// LAS CUATRO SECCIONES DE LIQUIDACIÓN, A 390 PX Y CON LA CONSOLA LIMPIA (QA, 14/09/2026).
//
// Dos bloqueantes de la rama «Más en 3 secciones»: «Costo y convenio» desbordaba la página a 827 px, y
// Cierre avisaba «Encountered two children with the same key» con la quincena abierta y con la cerrada.
// Sólo lectura: navega y mide, no escribe nada.

const RUTA = (q: string, solapa: string) => `/administracion/personas?vista=liquidacion&quincena=${q}&solapa=${solapa}`

for (const q of ['2026-09-01', '2026-08-16']) {
  for (const solapa of ['quincena', 'caja', 'costo', 'cierre']) {
    test(`${solapa} · ${q}: la página no desborda a 390 px y React no avisa claves repetidas`, async ({ page }) => {
      test.setTimeout(240_000)
      const avisos: string[] = []
      page.on('console', (m) => { if (/same key/i.test(m.text())) avisos.push(m.text().slice(0, 200)) })
      await page.setViewportSize({ width: 390, height: 844 })
      await entrarComo(page, ADMIN.email, ADMIN.password)
      await page.goto(RUTA(q, solapa), { waitUntil: 'load', timeout: 180_000 })
      await page.waitForTimeout(2_000)
      const m = await page.evaluate(() => ({ ancho: document.documentElement.scrollWidth, vista: window.innerWidth }))
      expect(m.ancho, `${solapa} · ${q}: scrollWidth ${m.ancho} en una vista de ${m.vista}`).toBeLessThanOrEqual(m.vista)
      expect(avisos, `${solapa} · ${q}: claves repetidas`).toEqual([])
    })
  }
}
