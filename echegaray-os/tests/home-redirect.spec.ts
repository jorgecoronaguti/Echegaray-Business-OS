import { test, expect } from '@playwright/test'

// La raíz ("/") nunca tenía a dónde ir -- quedaba en el placeholder original de la
// Fundación, dando la impresión de que el OS "no cargaba" aunque el servidor
// funcionara. Bloque 12-B: "no quiero tener que inferir dónde está la interfaz".

test('la raíz redirige a /login sin sesión autenticada', async ({ page }) => {
  await page.goto('/')
  await page.waitForURL(/\/login/)
  await expect(page.getByRole('heading', { name: 'Ingresar' })).toBeVisible()
})
