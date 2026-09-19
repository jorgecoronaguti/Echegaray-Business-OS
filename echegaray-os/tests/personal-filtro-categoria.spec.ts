import { test, expect, type Page } from '@playwright/test'
import { entrarComo } from './util/login'
import { ADMIN } from './util/identidades'

// EL RECORTE POR CATEGORÍA DE PERSONAL, EN EL NAVEGADOR (dueño, 17/09/2026).
//
// Lo que las funciones puras ya prueban —quién cae en qué cajón, cuánto anuncia cada pastilla— no se
// repite acá. Lo que SÓLO se puede ver en un navegador es lo que este spec mira:
//
//   · que la fila exista en LAS TRES solapas y con el mismo control;
//   · que al recortar, el número que la pantalla publica y las filas que se ven cierren;
//   · que el recorte sobreviva al cambio de solapa y a recargar la URL — que es lo que hace que un
//     enlace pegado en el chat reproduzca la vista;
//   · que en 390px la pantalla no se desplace de costado.
//
// Las capturas quedan en `qa-shots/personal-categoria-*`.

const RUTA = '/administracion/personas'
const SOLAPAS = [
  { clave: 'plantel', url: RUTA, testidTabla: 'tabla-personas' },
  { clave: 'horas', url: `${RUTA}?vista=asistencia&modo=quincena`, testidTabla: 'bloque-asistencia' },
  { clave: 'liquidacion', url: `${RUTA}?vista=liquidacion`, testidTabla: 'vista-quincena' },
] as const

/** `8/17 personas` → `{ n: 8, total: 17 }`. Es lo que la pantalla AFIRMA estar mostrando. */
function leerConteo(texto: string | null): { n: number; total: number } {
  const m = (texto ?? '').match(/(\d+)\s*\/\s*(\d+)/)
  if (!m) throw new Error(`no encontré el conteo en «${texto}»`)
  return { n: Number(m[1]), total: Number(m[2]) }
}

/** El conteo que corresponde a cada solapa: en el Plantel lo escribe la fila de los cortes. */
async function conteoDe(page: Page, solapa: string): Promise<{ n: number; total: number }> {
  const testid = solapa === 'plantel' ? 'filtro-conteo' : 'filtro-categoria-conteo'
  return leerConteo(await page.getByTestId(testid).textContent())
}

test.describe('el recorte por categoría vive en las tres solapas de Personal', () => {
  test.beforeEach(async ({ page }) => {
    await entrarComo(page, ADMIN.email, ADMIN.password)
  })

  for (const solapa of SOLAPAS) {
    test(`${solapa.clave}: la fila recorta y el número cierra con lo que se ve`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 })
      await page.goto(solapa.url)
      const fila = page.getByTestId('filtro-categoria')
      await expect(fila).toBeVisible({ timeout: 30000 })
      await expect(page.getByTestId(solapa.testidTabla)).toBeVisible()
      const antes = await conteoDe(page, solapa.clave)
      await page.screenshot({ path: `qa-shots/personal-categoria-${solapa.clave}-1440-sin.png`, fullPage: false })

      // RECORTAR POR UNA CATEGORÍA REAL. `oficial` es la más numerosa del plantel activo.
      await page.getByTestId('filtro-categoria-oficial').click()
      await expect(page).toHaveURL(/categoria=oficial/)
      await expect(page.getByTestId('filtro-categoria-oficial')).toHaveAttribute('aria-current', 'true')
      const despues = await conteoDe(page, solapa.clave)
      await page.screenshot({ path: `qa-shots/personal-categoria-${solapa.clave}-1440-oficial.png`, fullPage: false })

      // EL NÚMERO QUE LA PANTALLA PUBLICA ES EL DE LO QUE MUESTRA, y el total del corte no se movió.
      expect(despues.total).toBe(antes.total)
      expect(despues.n).toBeLessThan(antes.total)
      expect(despues.n).toBeGreaterThan(0)
      // Y COINCIDE CON LA PASTILLA que se acaba de apretar: la pastilla promete cuántas filas hay del
      // otro lado del clic.
      const cuenta = Number((await page.getByTestId('filtro-categoria-oficial-cuenta').textContent())?.trim())
      expect(despues.n).toBe(cuenta)

      // VOLVER A «TODAS» CON UN TOQUE.
      await page.getByTestId('filtro-categoria-todas').click()
      await expect(page).not.toHaveURL(/categoria=/)
      expect((await conteoDe(page, solapa.clave)).n).toBe(antes.n)
    })

    test(`${solapa.clave}: en 390px la fila se usa y la pantalla no se desplaza de costado`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 })
      await page.goto(`${solapa.url}${solapa.url.includes('?') ? '&' : '?'}categoria=oficial`)
      await expect(page.getByTestId('filtro-categoria')).toBeVisible({ timeout: 30000 })
      await page.screenshot({ path: `qa-shots/personal-categoria-${solapa.clave}-390-oficial.png`, fullPage: false })
      const desborde = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(desborde).toBeLessThanOrEqual(1)
    })
  }

  test('el recorte sobrevive al cambio de solapa y a recargar la URL', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(`${RUTA}?categoria=oficial`)
    await expect(page.getByTestId('filtro-categoria-oficial')).toHaveAttribute('aria-current', 'true')

    // PLANTEL → HORAS: la puerta de la solapa se escribe desde cero, y aun así tiene que llevarlo.
    await page.getByTestId('vistas-personal').getByText('Horas', { exact: true }).click()
    await expect(page).toHaveURL(/vista=asistencia/)
    await expect(page).toHaveURL(/categoria=oficial/)
    await expect(page.getByTestId('filtro-categoria-oficial')).toHaveAttribute('aria-current', 'true', { timeout: 30000 })

    // HORAS → LIQUIDACIÓN.
    await page.getByTestId('vistas-personal').getByText('Liquidación', { exact: true }).click()
    await expect(page).toHaveURL(/vista=liquidacion/)
    await expect(page).toHaveURL(/categoria=oficial/)
    await expect(page.getByTestId('filtro-categoria-oficial')).toHaveAttribute('aria-current', 'true', { timeout: 30000 })
    const enLiquidacion = await conteoDe(page, 'liquidacion')

    // RECARGAR LA MISMA URL: un enlace pegado en el chat reproduce la vista, número incluido.
    const url = page.url()
    await page.goto(url)
    await expect(page.getByTestId('filtro-categoria-oficial')).toHaveAttribute('aria-current', 'true', { timeout: 30000 })
    expect(await conteoDe(page, 'liquidacion')).toEqual(enLiquidacion)
    await page.screenshot({ path: 'qa-shots/personal-categoria-sobrevive-recarga.png', fullPage: false })
  })
})
