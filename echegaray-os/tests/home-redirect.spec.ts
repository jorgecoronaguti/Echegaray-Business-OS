import { test, expect } from '@playwright/test'

// La raíz ("/") nunca tenía a dónde ir -- quedaba en el placeholder original de la
// Fundación, dando la impresión de que el OS "no cargaba" aunque el servidor
// funcionara. Bloque 12-B: "no quiero tener que inferir dónde está la interfaz".

test('la raíz redirige a /login sin sesión autenticada', async ({ page }) => {
  await page.goto('/')
  await page.waitForURL(/\/login/)
  // El título era «Ingresar» y esta línea llevaba tiempo desactualizada: la pantalla decía «Entrá a
  // tu obra» desde el porte de M01. Desde el 08/09/2026 dice «Entrá al OS de Echegaray» — neutro,
  // porque por esta puerta entran las cuatro identidades de adentro y «tu obra» le hablaba a una.
  await expect(page.getByRole('heading', { name: 'Entrá al OS de Echegaray' })).toBeVisible()
})
