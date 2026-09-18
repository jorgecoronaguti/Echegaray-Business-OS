import { expect, test, type Locator } from '@playwright/test'
import { entrar } from './util/obras-e2e'

// CAPTURAS Y LECTURA DEL PANEL «A QUIÉN LE DEBO» POR OBRA (dueño, 18/09/2026).
//
// No afirma nada del negocio: mira la pantalla ENTERA (tabla + panel) a 1280 y a 390, con un
// proveedor que debe en más de una obra y con uno de una sola, y ESCRIBE los números que el panel
// dibuja (subtotal por obra y total) para cotejarlos afuera contra una consulta independiente a la
// base. El cotejo no vive acá: un test que lee el número del panel y lo compara con el mismo panel
// no es un control.
//
// Lo único que sí afirma es el ORDEN: los comprobantes por obra tienen que estar ANTES que la nota
// «Qué hacer», que es exactamente lo que el dueño pidió cambiar.

const DIR = process.env.CAPTURAS ?? 'capturas/deuda-por-obra'

/** El texto de algo que puede no estar. `textContent()` a secas ESPERA al elemento hasta el timeout del test. */
const textoDe = async (loc: Locator): Promise<string | null> =>
  (await loc.count()) ? loc.first().textContent() : null
// Sin tilde: es la grafía del maestro («Corralon Progreso»), y `hasText` compara el texto tal cual.
const PROVEEDORES = (process.env.PROVEEDORES ?? 'Corralon Progreso,Pedro Tello').split(',')

test('capturas del panel de deuda por obra', async ({ page }) => {
  test.setTimeout(400000)
  await entrar(page)
  const leidos: Record<string, unknown>[] = []

  for (const [w, h, sufijo] of [[1280, 900, '1280'], [390, 844, '390']] as [number, number, string][]) {
    await page.setViewportSize({ width: w, height: h })
    await page.goto('/administracion/proveedores?vista=deuda')
    await page.getByTestId('tabla-deuda').waitFor({ timeout: 60000 })
    await page.waitForTimeout(800)
    await page.screenshot({ path: `${DIR}/${sufijo}-tabla.png`, fullPage: true })

    for (const nombre of PROVEEDORES) {
      const fila = page.getByTestId('fila-deuda').filter({ hasText: nombre }).first()
      if (!(await fila.count())) { leidos.push({ nombre, sufijo, ausente: true }); continue }
      await fila.click()
      const panel = page.getByTestId('panel-deuda-proveedor')
      await panel.waitFor({ timeout: 60000 })
      await page.waitForTimeout(800)
      const slug = nombre.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-')
      await page.screenshot({ path: `${DIR}/${sufijo}-${slug}-panel.png` })
      // El panel entero, no sólo lo que entra en el viewport: el drawer scrollea por adentro.
      await panel.screenshot({ path: `${DIR}/${sufijo}-${slug}-panel-entero.png` })

      // ORDEN: los bloques por obra y el total están antes que «Qué hacer», si hay nota.
      const nota = panel.getByTestId('nota-que-hacer')
      if (await nota.count()) {
        const yObra = (await panel.getByTestId('deuda-obra').first().boundingBox())?.y ?? Infinity
        const yTotal = (await panel.getByTestId('deuda-detalle-total').boundingBox())?.y ?? Infinity
        await nota.scrollIntoViewIfNeeded()
        const yNota = (await nota.boundingBox())?.y ?? -Infinity
        expect(yObra, 'la obra tiene que estar arriba de la nota').toBeLessThan(yNota)
        expect(yTotal, 'el total tiene que estar arriba de la nota').toBeLessThan(yNota)
      }

      const obras = await panel.getByTestId('deuda-obra').evaluateAll((els) => els.map((e) => ({
        obra: e.getAttribute('data-obra'),
        cabecera: e.querySelector('[data-testid="deuda-obra-cabecera"]')?.textContent?.trim(),
        subtotal: e.querySelector('[data-testid="deuda-obra-subtotal"]')?.textContent?.trim(),
        lineas: [...e.querySelectorAll('[data-testid="deuda-linea"]')].map((l) => ({
          fila: l.getAttribute('data-fila'), estado: l.getAttribute('data-estado'), texto: l.textContent?.trim(),
        })),
      })))
      leidos.push({
        nombre, sufijo,
        subtitulo: await textoDe(panel.locator('header')),
        resumen: await textoDe(panel.getByTestId('deuda-resumen')),
        total: await textoDe(panel.getByTestId('deuda-detalle-total')),
        noCierra: await textoDe(panel.getByTestId('deuda-no-cierra')),
        nota: (await panel.getByTestId('nota-que-hacer').count()) > 0,
        obras,
      })
      await page.getByTestId('panel-deuda-proveedor-cerrar').click()
      await panel.waitFor({ state: 'detached', timeout: 20000 })
    }
  }
  const { writeFileSync } = await import('node:fs')
  writeFileSync(`${DIR}/leido-del-panel.json`, JSON.stringify(leidos, null, 2))
})
