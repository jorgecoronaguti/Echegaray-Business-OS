import { test } from '@playwright/test'
import { conBase, entrar } from './util/obras-e2e'

// CAPTURAS DEL WORKSPACE DE TAREAS. No es un test: no afirma nada. Existe para MIRAR la pantalla,
// que es el único control que ve un layout roto.
const DIR = process.env.CAPTURAS ?? 'test-results/capturas-tareas'
const OBRAS = ['san-francisco', 'quattropani', 'messina']

test('capturas 03/04/05/06 con las obras reales', async ({ page }) => {
  test.setTimeout(600000)
  const sb = await conBase()
  await entrar(page)
  await page.setViewportSize({ width: 1536, height: 1024 })

  for (const obra of OBRAS) {
    // 03 · el árbol
    await page.goto(`/obras/${obra}?vista=tareas`)
    await page.waitForTimeout(2000)
    await page.screenshot({ path: `${DIR}/03-${obra}-tareas.png`, fullPage: false })

    // 04 · el panel de la primera actividad ejecutable
    const { data: act } = await sb.from('obra_actividad')
      .select('id').eq('obra_id', obra).neq('tipo', 'resumen').eq('archivada', false)
      .order('orden').limit(1).maybeSingle()
    if (act) {
      await page.goto(`/obras/${obra}?vista=tareas&act=${act.id}&sol=avance`)
      await page.waitForTimeout(1800)
      await page.screenshot({ path: `${DIR}/04-${obra}-panel.png` })
      await page.goto(`/obras/${obra}?vista=tareas&act=${act.id}&sol=general`)
      await page.waitForTimeout(1200)
      await page.screenshot({ path: `${DIR}/04-${obra}-panel-general.png` })

      // 05 · registrar avance
      await page.goto(`/obras/${obra}/avance/${act.id}`)
      await page.waitForTimeout(1500)
      await page.screenshot({ path: `${DIR}/05-${obra}-avance.png` })
    }

    // 06 · avance masivo, con selección puesta para que se vea la barra y «QUEDARÁ EN»
    await page.goto(`/obras/${obra}/avance-masivo`)
    await page.waitForTimeout(1800)
    await page.screenshot({ path: `${DIR}/06-${obra}-masivo.png` })
    await page.getByTestId('sel-todo').click()
    await page.waitForTimeout(800)
    await page.screenshot({ path: `${DIR}/06-${obra}-masivo-seleccion.png` })
  }

  // El teléfono, que es el aparato del jefe de obra: la página no se puede correr de costado.
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/obras/san-francisco?vista=tareas')
  await page.waitForTimeout(2000)
  await page.screenshot({ path: `${DIR}/03-telefono.png` })
})
