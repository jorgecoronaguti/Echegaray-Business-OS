import { test, expect } from '@playwright/test'
import { entrar } from './util/obras-e2e'

// LO QUE EL DUEÑO PIDIÓ VER, MEDIDO EN EL NAVEGADOR (12/09/2026, textual):
// «Necesito que cada obra tenga, así como las HH que lleva, los costos de obra aparejados: en una
// columna que sume materiales gastados y mano de obra en otra; eso de estado que has puesto como
// columna no me sirve» · «incluso la columna de cobrado neto no me es un dato que sirve verlo, porque
// para eso está la sección especial de cobranzas».
//
// ═══ QUÉ PRUEBA ESTA CAPTURA Y QUÉ NO ═══
//
// PRUEBA LA GRILLA: que las dos columnas nuevas existan, que Estado y Cobrado neto ya no estén, que
// ninguna cifra quede cortada y que a 400px la tabla ruede SIN llevarse la página de costado.
//
// NO PRUEBA EL NÚMERO. `costo_obra` viaja en la RPC, y la migración 20260912T1000 la aplica el dueño:
// mientras no esté aplicada, la clave no llega, `costosPorObra` es `null` y las dos celdas quedan
// VACÍAS a propósito —que es exactamente la conducta que se quiere cuando no se puede leer—. La
// prueba del número es el cruce contra las fuentes (`orquestador/lib/costo-por-obra.pg.test.mjs`).
// Por eso acá se afirma la FORMA de la celda (vacía o un importe o «—»), nunca un importe clavado: el
// timer de Compras espeja la pestaña cada hora.

const ANCHOS = [1280, 400] as const

for (const cliente of ['quattropani', 'san-francisco'] as const) {
  test(`la tabla de trabajos de ${cliente} publica MATERIALES y MANO DE OBRA, y ni estado ni cobranza`, async ({ page }) => {
    test.setTimeout(240000)
    await entrar(page)

    for (const ancho of ANCHOS) {
      await page.setViewportSize({ width: ancho, height: 1000 })
      await page.goto(`/clientes/${cliente}`)

      const tabla = page.getByTestId('obras-del-cliente').first()
      await expect(tabla).toBeVisible({ timeout: 60000 })
      // LAS DOS COLUMNAS NUEVAS, EN LOS DOS ANCHOS: a 400px no se esconde ninguna, la tabla rueda.
      await expect(tabla).toContainText('Materiales')
      await expect(tabla).toContainText('Mano de obra')
      await expect(tabla).toContainText('HH')
      // LAS DOS QUE EL DUEÑO SACÓ.
      await expect(tabla).not.toContainText('Estado')
      await expect(tabla).not.toContainText('Cobrado neto')

      const fila = page.getByTestId('fila-obra-cliente').first()
      // LA FORMA, NO EL IMPORTE: un número, «—», «sin valorizar» o vacío. Lo que NO puede pasar es un
      // «$ 0», que diría que esta obra no gastó nada.
      for (const celda of ['materiales-obra-cliente', 'mano-obra-obra-cliente']) {
        await expect(fila.getByTestId(celda)).toHaveText(/^(\$[\d.]+|—|sin valorizar|)$/)
      }

      // ═══ LA PÁGINA NO SE MUEVE DE COSTADO: LA QUE RUEDA ES LA TABLA ═══
      //
      // Es la medición que justifica el scroller. Sin él, seis columnas empujan el documento entero y
      // en un teléfono la ficha se lee corrida — el mismo control que `shell-dos-areas.spec.ts` hace
      // para el shell, acá sobre la pantalla que acaba de ganar dos columnas.
      const desborde = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth)
      expect(desborde, `la página se desplaza ${desborde}px de costado a ${ancho}px`).toBeLessThanOrEqual(1)

      await page.screenshot({
        path: `tests/capturas/cliente-costos-${cliente}-${ancho}.png`, fullPage: false,
      })
    }
  })
}

test('el pie de la tabla suma los tres acumulados del cliente', async ({ page }) => {
  test.setTimeout(240000)
  await entrar(page)
  await page.setViewportSize({ width: 1280, height: 1000 })
  await page.goto('/clientes/quattropani')

  const pie = page.getByTestId('pie-trabajos-cliente')
  await expect(pie).toBeVisible({ timeout: 60000 })
  // LAS TRES CIFRAS EXISTEN Y NINGUNA ES UN CERO FALSO: HH con su número, y las dos de costo con su
  // importe o con la palabra que dice por qué no hay número.
  await expect(pie.getByTestId('hh-del-cliente')).toContainText(/[\d.]+|no puedo leerlas/)
  // «NO PUEDO LEERLOS» ES UNA RESPUESTA VÁLIDA Y «—» NO LO ES MIENTRAS LA CLAVE NO LLEGUE: con la
  // migración sin aplicar el pie tiene que decir que no pudo leerlo, nunca que no hay ninguno.
  await expect(pie.getByTestId('materiales-del-cliente')).toContainText(/\$[\d.]+|—|no puedo leerlos/)
  await expect(pie.getByTestId('mano-obra-del-cliente')).toContainText(/\$[\d.]+|sin valorizar|no puedo leerla/)
  await page.screenshot({ path: 'tests/capturas/cliente-costos-pie-1280.png', fullPage: false })
})
