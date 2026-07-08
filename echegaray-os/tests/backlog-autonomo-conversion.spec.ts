import { test, expect } from '@playwright/test'

// Backlog Autónomo -> Centro de Acción (Track B / punto 6, OLA 2). Confirma que un
// item de backlog puede convertirse en una Acción real, reutilizando el mismo
// mecanismo de alerta_origen_id (nunca duplica el task manager).

const EMAIL = 'jorge.o.corona+direccion-test-1783513222134@gmail.com'
const PASSWORD = 'TestPassword123!'

test('un item de backlog abierto puede convertirse en una acción real', async ({ page }) => {
  await page.goto('/login')
  await page.fill('input[name="email"]', EMAIL)
  await page.fill('input[name="password"]', PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/dashboard/, { timeout: 10000 })

  await page.goto('/backlog-autonomo')
  const primeraFila = page.getByTestId('backlog-fila').first()
  const boton = primeraFila.getByTestId('convertir-backlog-en-accion-btn')

  // Si ya fue convertido en una corrida anterior, el botón no existe -- el test igual
  // confirma que el estado es consistente (ya convertido), no que algo se rompió.
  if ((await boton.count()) > 0) {
    await boton.click()
    await page.waitForTimeout(1500)
    await expect(primeraFila.getByTestId('backlog-ya-convertido')).toBeVisible()
  } else {
    await expect(primeraFila.getByTestId('backlog-ya-convertido')).toBeVisible()
  }
})
