import { test } from '@playwright/test'
import { entrarComo } from './util/login'
import { ADMIN, servicio } from './util/identidades'

// LAS CAPTURAS DEL DIAGNÓSTICO DE ASIGNACIÓN (docs/engineering/UX_ASIGNACION_DE_PERSONAL.md).
//
// No afirman nada: son la evidencia de cómo se ve HOY cada lugar donde se asigna gente a una obra.
// El diagnóstico se escribe mirándolas, no de memoria — la skill de diseño lo exige: «no se da una
// pantalla por buena sin haberla mirado en un navegador autenticado y en 390px».

const OBRA = 'pisos-industriales'

// LA ESPERA NO PUEDE SER `networkidle` NI NADA: la primera corrida sacó la foto del ESQUELETO de
// carga y el documento se habría escrito mirando cuatro rectángulos grises. Se espera a que el
// contenido esté —`load` más un respiro— y se mira la captura antes de usarla.
// `networkidle` NO: la grilla de asistencia hace su propio tráfico y la espera nunca terminaba —el
// `goto` moría a los 30 s sin que ninguna pantalla estuviera rota. Se espera el `load` y se saca la
// foto.
test('capturas · los cuatro lugares donde hoy se asigna gente', async ({ page }) => {
  test.setTimeout(120_000)
  await entrarComo(page, ADMIN.email, ADMIN.password)
  const sb = servicio()
  const { data } = await sb.from('obra_asignacion').select('persona_id').limit(1)
  const persona = (data?.[0] as { persona_id: string } | undefined)?.persona_id ?? null

  for (const [ancho, alto, sufijo] of [[1440, 900, '1440'], [390, 844, '390']] as const) {
    await page.setViewportSize({ width: ancho, height: alto })

    await page.goto(`/obras/${OBRA}?vista=personal`)
    await page.waitForTimeout(3000)
    await page.screenshot({ path: `qa-shots/ux-asignacion-obra-personal-${sufijo}.png`, fullPage: true })

    if (persona) {
      await page.goto(`/administracion/personas/${persona}?v=asignaciones`)
      await page.waitForTimeout(3000)
        await page.screenshot({ path: `qa-shots/ux-asignacion-ficha-${sufijo}.png`, fullPage: true })
    }

    await page.goto('/administracion/personas/cuadrillas')
    await page.waitForTimeout(3000)
    await page.screenshot({ path: `qa-shots/ux-asignacion-cuadrillas-${sufijo}.png`, fullPage: true })

    await page.goto('/administracion/personas?vista=asistencia')
    await page.waitForTimeout(3000)
    await page.screenshot({ path: `qa-shots/ux-asignacion-asistencia-${sufijo}.png`, fullPage: true })
  }
})
