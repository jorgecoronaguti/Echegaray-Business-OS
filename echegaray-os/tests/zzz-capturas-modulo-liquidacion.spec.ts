import { test } from '@playwright/test'
import { entrarComo } from './util/login'
import { ADMIN } from './util/identidades'

// LAS SEIS SOLAPAS DEL MÓDULO, A 1280, CON DATOS REALES Y SESIÓN DE DIRECCIÓN.
//
// No afirman nada: son la evidencia para comparar contra el mockup ejecutable
// `design/Liquidación de horas v2.dc.html`. La regla del repo es «ver antes de dar por buena»: una
// pantalla no se declara conforme al contrato de diseño sin haberla mirado en un navegador.
//
// 1280 y no 1440 porque es el ancho en el que el dueño trabaja y donde la tabla de Pagos —1.144 px
// de ancho mínimo— empieza a pedir scroll horizontal: si algo se rompe por angosto, se rompe acá.

const RUTA = '/administracion/personas?vista=liquidacion&quincena=2026-09-01'
const DESTINO = process.env.E2E_CAPTURAS ?? '.playwright'

// LAS CLAVES SON LAS DE `solapas/index.ts`, no las de los archivos: «Costo a la obra» es `costo` y
// adentro dibuja las pantallas 5, 6 y 7. Una clave inventada NO rompe la pantalla —`solapaDe`
// devuelve la de por defecto— y por eso una captura con la clave mal puesta se ve como «Horas» y
// engaña: lo comprobé el 11/09/2026 pidiendo `costo-hora`.
const SOLAPAS = ['horas', 'pagos', 'costo', 'convenios', 'cierre', 'recibos'] as const

for (const solapa of SOLAPAS) {
  test(`captura · ${solapa} a 1280`, async ({ page }) => {
    test.setTimeout(120_000)
    await page.setViewportSize({ width: 1280, height: 1000 })
    await entrarComo(page, ADMIN.email, ADMIN.password)
    await page.goto(`${RUTA}&solapa=${solapa}`, { waitUntil: 'load' })
    await page.waitForTimeout(2500)
    await page.screenshot({ path: `${DESTINO}/${solapa}.png`, fullPage: true })
  })
}
