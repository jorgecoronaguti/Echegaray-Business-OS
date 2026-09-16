import { expect, test, type Page } from '@playwright/test'
import { entrarComo } from './util/login'
import { ADMIN } from './util/identidades'

// EL ENCABEZADO DE LIQUIDACIÓN QUEDA FIJO AL BAJAR — MEDIDO, NO DECLARADO (16/09/2026).
//
// El dueño, en Chrome sobre Mac: «no me queda fija la fila Persona + días». El código la declaraba
// `sticky` y el typecheck no ve un layout. Este spec baja 800 px en 1440×700 y mide dónde quedó la
// cabecera: bajo el header (top ≤ 60), y con NINGUNA fila dibujada por encima de ella —lo que hay en
// cada punto de la franja de la cabecera es la cabecera, no una fila que pasó por delante—.
//
// DOS RECORRIDOS. El primero es la página tal cual. El segundo le ROMPE el sticky a propósito —la caja
// del cuadro pasa a `overflow: hidden`, que crea un scrollport y le roba el anclaje— y exige el mismo
// resultado: ahí es el respaldo `fixed` de `CintaHorizontal` el que sostiene la cabecera, y `data-modo`
// tiene que decirlo. Sin el segundo, el spec pasaría en este Chromium (donde el sticky anda) sin probar
// nunca que el respaldo puede activarse: un control que no puede dar rojo.

const RUTA = '/administracion/personas?vista=liquidacion&solapa=quincena'
const TOPE = 60
const BAJADA = 800
const CABECERA = 'espejo-cinta-cabecera'
/** La caja del cuadro (la que lleva `overflow: clip`): con `hidden` es un scrollport y el sticky muere. */
const ROMPE_STICKY = `div:has(> div > [data-testid="${CABECERA}"]) { overflow: hidden !important }`

type Rect = { top: number; bottom: number; left: number; width: number }

async function rectDe(page: Page, testid: string): Promise<Rect> {
  return page.evaluate((id) => {
    const r = document.querySelector(`[data-testid="${id}"]`)!.getBoundingClientRect()
    return { top: r.top, bottom: r.bottom, left: r.left, width: r.width }
  }, testid)
}

async function abrirLaQuincena(page: Page): Promise<void> {
  await entrarComo(page, ADMIN.email, ADMIN.password)
  await page.goto(RUTA)
  await expect(page.getByTestId(CABECERA)).toBeVisible({ timeout: 30000 })
  await expect(page.getByTestId('espejo-encabezado')).toContainText('Persona')
  // HACE FALTA PÁGINA PARA BAJAR: si la quincena tiene pocas filas, no hay defecto que medir.
  const alto = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)
  test.skip(alto < BAJADA, `la página sólo baja ${alto} px: no alcanza para medir el encabezado fijo`)
}

async function bajar(page: Page): Promise<void> {
  await page.mouse.move(720, 400)
  await page.mouse.wheel(0, BAJADA)
  await page.waitForFunction((b) => window.scrollY >= b - 1, BAJADA)
  await page.waitForTimeout(300)
}

/** Lo que se exige después de bajar, sea cual sea el mecanismo que sostiene la cabecera. */
async function exigirCabeceraArriba(page: Page): Promise<void> {
  const r = await rectDe(page, CABECERA)
  expect(r.top, 'la cabecera se fue con la página').toBeLessThanOrEqual(TOPE)
  expect(r.top, 'la cabecera quedó por encima del header de la app').toBeGreaterThanOrEqual(0)
  expect(r.bottom - r.top).toBeGreaterThan(20)
  // NINGUNA FILA POR ENCIMA: en cinco puntos de la franja de la cabecera, lo que hay es la cabecera.
  const encima = await page.evaluate(({ r: { top, bottom, left, width }, id }) => {
    const y = (top + bottom) / 2
    const cab = document.querySelector(`[data-testid="${id}"]`)!
    return [0.05, 0.25, 0.5, 0.75, 0.95].map((f) => {
      const el = document.elementFromPoint(left + width * f, y)
      const fila = el?.closest('[data-testid^="espejo-fila-"], [data-testid="espejo-total"]')
      return { x: Math.round(left + width * f), enCabecera: cab.contains(el), fila: fila?.getAttribute('data-testid') ?? null }
    })
  }, { r, id: CABECERA })
  expect(encima.filter((p) => !p.enCabecera), `hay filas dibujadas por encima de la cabecera: ${JSON.stringify(encima)}`).toEqual([])
  await expect(page.getByTestId('espejo-encabezado')).toBeInViewport()
}

test.use({ viewport: { width: 1440, height: 700 } })

test('al bajar 800 px la cabecera queda bajo el header y ninguna fila pasa por encima', async ({ page }) => {
  await abrirLaQuincena(page)
  // SIN BAJAR, la cabecera está donde la puso el flujo: más abajo del header.
  expect((await rectDe(page, CABECERA)).top).toBeGreaterThan(TOPE)
  await bajar(page)
  await exigirCabeceraArriba(page)
  await page.screenshot({ path: 'test-results/liquidacion-encabezado-fijo/sticky.png' })
})

test('con el sticky roto a propósito, el respaldo fixed la sostiene igual', async ({ page }) => {
  await abrirLaQuincena(page)
  await page.addStyleTag({ content: ROMPE_STICKY })
  await bajar(page)
  // EL RESPALDO SE ACTIVÓ: el medidor vio la cabecera irse y la fijó. MUTACIÓN: sin el medidor, `data-modo`
  // sigue en «flujo» y la cabecera queda 800 px arriba.
  await expect(page.getByTestId(CABECERA)).toHaveAttribute('data-modo', 'fija')
  await expect(page.getByTestId('espejo-cinta-espaciador')).toBeAttached()
  await exigirCabeceraArriba(page)
  await page.screenshot({ path: 'test-results/liquidacion-encabezado-fijo/fixed.png' })
})
