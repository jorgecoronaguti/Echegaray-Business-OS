import { test, expect } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { entrar } from './util/obras-e2e'

// EVIDENCIA DEL PUENTE «OTROS» (18/09/2026): lee de la PANTALLA —no de la base— lo que cada ficha de
// cliente publica por trabajo, y saca la captura de la ficha de Messina (ME - PILÓN). Corre igual contra
// producción (`E2E_BASE_URL=https://app.ecsas.com.ar`, el «antes») y contra el árbol local (el «después»).
// No afirma importes: los escribe en `EVIDENCIA_DIR/<etiqueta>.json` para cotejarlos contra el recuento
// independiente sobre compra_sheet. Sólo lee.

const DIR = process.env.EVIDENCIA_DIR ?? 'tests/capturas'
const ETIQUETA = process.env.EVIDENCIA_ETIQUETA ?? 'local'
const CLIENTES = ['messina', 'san-francisco', 'quattropani', 'la-estrella', 'arcor'] as const
const CELDAS = ['materiales-obra-cliente', 'subcontratos-obra-cliente', 'otros-obra-cliente', 'mano-obra-obra-cliente'] as const
const ANALITICAS = ['pilon', 'messina-bsa', 'messina-playon-dilucion-acido', 'pisos-industriales', 'quattropani', 'entrepiso-y-escalera', 'san-francisco'] as const

test('lo que la pantalla publica por trabajo, leído de la pantalla', async ({ page: primera }) => {
  let page = primera
  // UNA PESTAÑA POR PANTALLA, cerrando la anterior: con `next dev` la pestaña acumula memoria y se caía.
  const fresca = async (ancho = 1440) => {
    const nueva = await page.context().newPage()
    await page.close()
    page = nueva
    await page.setViewportSize({ width: ancho, height: 1100 })
  }
  test.setTimeout(600000)
  mkdirSync(DIR, { recursive: true })
  await entrar(page)
  await page.setViewportSize({ width: 1440, height: 1100 })
  const salida: Record<string, unknown> = { etiqueta: ETIQUETA, base: page.url(), leido: new Date().toISOString(), fichas: {}, analiticas: {} }
  for (const cliente of CLIENTES) {
    await page.goto(`/clientes/${cliente}`)
    const tabla = page.getByTestId('obras-del-cliente').first()
    await expect(tabla).toBeVisible({ timeout: 90000 })
    await expect(page.getByTestId('fila-obra-cliente').first()).toBeVisible({ timeout: 90000 })
    const filas = await page.getByTestId('fila-obra-cliente').evaluateAll((els, celdas) => els.map((el) => {
      const href = el.getAttribute('href') ?? ''
      const trabajo = new URL(href, 'http://x').searchParams.get('trabajo')
      const leer = (id: string) => {
        const c = el.querySelector(`[data-testid="${id}"]`)
        return c ? (c.textContent ?? '').replace(/\s+/g, ' ').trim() : null
      }
      return { trabajo, nombre: (el.textContent ?? '').slice(0, 60), ...Object.fromEntries(celdas.map((c) => [c, leer(c)])) }
    }), CELDAS as unknown as string[])
    const encabezado = await page.locator('[data-testid="obras-del-cliente"]').first().innerText()
    const pie = await page.getByTestId('pie-trabajos-cliente').first().innerText().catch(() => null)
    ;(salida.fichas as Record<string, unknown>)[cliente] = { filas, tieneColumnaOtros: /\bOtros\b/.test(encabezado.split('\n').slice(0, 12).join(' ')), pie }
    if (cliente === 'messina') {
      await page.getByTestId('obras-del-cliente').first().screenshot({ path: join(DIR, `ficha-messina-${ETIQUETA}.png`) })
      // LA TABLA DONDE ESTÁ PILÓN (obra cerrada: grupo «Terminados»), entera.
      const pilon = page.locator('[data-testid="fila-obra-cliente"][href*="trabajo=pilon"]')
      await pilon.scrollIntoViewIfNeeded()
      await page.locator('[data-testid="obras-del-cliente"]', { has: pilon }).screenshot({ path: join(DIR, `ficha-messina-pilon-${ETIQUETA}.png`) })
    }
  }
  writeFileSync(join(DIR, `${ETIQUETA}.json`), JSON.stringify(salida, null, 1))
  // LA CARTERA DEL CRM, a los dos anchos donde las columnas de costo existen.
  for (const ancho of [1440, 1280]) {
    await fresca(ancho)
    await page.goto('/clientes')
    await expect(page.getByTestId('clientes-tabla')).toBeVisible({ timeout: 90000 })
    await page.screenshot({ path: join(DIR, `cartera-${ancho}-${ETIQUETA}.png`) })
    const messina = page.getByTestId('fila-cliente').filter({ hasText: 'Messina' }).first()
    ;(salida as Record<string, unknown>)[`cartera${ancho}`] = (await messina.innerText().catch(() => '')).replace(/\s+/g, ' ')
  }
  for (const obra of ANALITICAS) {
    await fresca()
    await page.goto(`/analiticas?vista=obras&obra=${obra}&estado=todas`)
    const rubros = page.getByTestId('rubros')
    await expect(rubros).toBeVisible({ timeout: 90000 })
    const cabecera = await page.locator('body').innerText()
    const rubro = async (k: string) => (await page.getByTestId(`rubro-${k}`).innerText().catch(() => '')).replace(/\s+/g, ' ')
    ;(salida.analiticas as Record<string, unknown>)[obra] = {
      consumido: /consumido\s*\n\s*([^\n]+)/.exec(cabecera)?.[1] ?? null,
      materiales: await rubro('materiales'), subcontratos: await rubro('subcontratos'), otros: await rubro('otros'), manoObra: await rubro('manoObra'),
    }
    if (obra === 'pilon') await page.screenshot({ path: join(DIR, `analiticas-pilon-${ETIQUETA}.png`), fullPage: true })
    writeFileSync(join(DIR, `${ETIQUETA}.json`), JSON.stringify(salida, null, 1))
  }
  await fresca()
  await page.goto('/analiticas?estado=todas')
  await expect(page.getByTestId('resumen-por-cliente')).toBeVisible({ timeout: 90000 })
  const resumen = await page.locator('body').innerText()
  salida.resumen = { consumido: /consumido en obras[^\n]*\n\s*([^\n]+)/.exec(resumen)?.[1] ?? null }
  await page.screenshot({ path: join(DIR, `analiticas-resumen-${ETIQUETA}.png`), fullPage: true })
  writeFileSync(join(DIR, `${ETIQUETA}.json`), JSON.stringify(salida, null, 1))
})
