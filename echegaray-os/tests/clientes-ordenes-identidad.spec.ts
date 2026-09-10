import { test, expect } from '@playwright/test'
import { entrar } from './util/obras-e2e'

// LA FILA DE LA OBRA TIENE QUE DECIR CUÁL ES SU ORDEN, NO CUÁNTAS TIENE.
//
// Pedido del dueño (10/09/2026), textual, mirando `/clientes`: «así no me sirve: me tiene que
// demostrar claramente la OC/OP que corresponde a cada obra desde esa pantalla; que luego quiera
// hacer click y verlas es otra cosa, pero necesito identificarlas con la obra a simple vista».
//
// EL DEFECTO QUE ATRAPA: la fila dibujaba «OC ·1» —un conteo— y volver a eso deja este caso rojo.
// Se exige el NÚMERO de la orden real de esa obra (OC 00002-00002173, «Construcción de Playón de
// Azufre», que Messina emitió el 11/08/2026), leído de `cliente_orden`. Es dato vivo y a propósito:
// si el re-atribuidor deja de colgar esa OC de esa obra, la pantalla vuelve a mentir y esto lo dice.
test('la fila de ME - PLAYÓN DE AZUFRE muestra el número de su OC', async ({ page }) => {
  test.setTimeout(180000)
  await entrar(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/clientes')
  await expect(page.getByTestId('clientes-tabla')).toBeVisible()

  const fila = page.getByTestId('fila-obra').filter({ hasText: 'PLAYÓN DE AZUFRE' }).first()
  await expect(fila).toBeVisible()
  const numeros = fila.getByTestId('chip-orden')
  await expect(numeros.first()).toBeVisible()
  // El número, con su día. No «OC ·1»: un conteo no identifica nada.
  await expect(numeros.filter({ hasText: '2173' })).toHaveCount(1)
  await expect(fila).not.toContainText('OC ·')

  await page.screenshot({ path: 'tests/capturas/clientes-ordenes-1440.png', fullPage: false })
})
