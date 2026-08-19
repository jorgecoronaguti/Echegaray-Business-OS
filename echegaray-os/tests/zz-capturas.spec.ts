import { test } from '@playwright/test'
import { entrar } from './util/obras-e2e'

// CAPTURAS PARA LA INSPECCIÓN VISUAL. No es un test: no afirma nada. Existe para MIRAR la pantalla,
// que es el único control que ve un layout roto — un test de tipos no lo ve.
// Se corre a mano y no forma parte de la suite: por eso el prefijo `zz-`.

const DIR = process.env.CAPTURAS ?? 'test-results/capturas'

test('capturas del workspace de la obra', async ({ page }) => {
  test.setTimeout(180000)
  await entrar(page)
  await page.setViewportSize({ width: 1536, height: 1000 })

  const OBRA = 'le-comedor'
  const tiros: [string, string][] = [
    ['01-gantt', `/obras/${OBRA}?vista=cronograma&sub=gantt`],
    ['02-lista', `/obras/${OBRA}?vista=cronograma&sub=lista`],
    ['03-tablero', `/obras/${OBRA}?vista=cronograma&sub=tablero`],
    ['04-proximos', `/obras/${OBRA}?vista=cronograma&sub=proximos`],
    ['05-resumen', `/obras/${OBRA}?vista=resumen`],
    ['06-ejecucion', `/obras/${OBRA}?vista=ejecucion`],
  ]
  for (const [nombre, url] of tiros) {
    await page.goto(url)
    await page.waitForTimeout(2500)
    await page.screenshot({ path: `${DIR}/${nombre}.png` })
  }

  // El panel abierto sobre la primera actividad: es la pantalla que hay que comparar con el objetivo.
  await page.goto(`/obras/${OBRA}?vista=cronograma&sub=gantt`)
  await page.waitForTimeout(2500)
  await page.getByTestId('actividad-cronograma').first().click()
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${DIR}/07-panel.png` })

  // La barra con los rubros y con los filtros desplegados.
  await page.getByTestId('nuevo-rubro').click()
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${DIR}/08-rubros.png` })
  await page.getByTestId('boton-filtros').click()
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${DIR}/09-filtros.png` })

  // Y el teléfono, que es el aparato del jefe de obra.
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`/obras/${OBRA}?vista=ejecucion`)
  await page.waitForTimeout(2500)
  await page.screenshot({ path: `${DIR}/10-telefono-ejecucion.png` })
})
