import { test, expect } from '@playwright/test'
import { entrarComo } from './util/login'
import { ADMIN } from './util/identidades'

// EL SMOKE DE /xsas — la pantalla existe, contesta con el cerebro del OS, y lo DICE.
//
// Corre contra producción con `E2E_BASE_URL=https://app.ecsas.com.ar`. Ahí es donde prueba algo:
// en localhost, un endpoint mal publicado o una variable que falta en Vercel no se ven.
//
// Las tres preguntas son determinísticas y de sólo lectura. La que importa es la línea de traza:
// si dijera «Reasoner: SÍ» para «¿qué podés hacer?», la promesa del producto estaría rota aunque la
// respuesta se viera bien.

test('«¿qué podés hacer?» se contesta del registro del OS y sin razonador', async ({ page }) => {
  test.setTimeout(120_000)
  await entrarComo(page, ADMIN.email, ADMIN.password)
  await page.goto('/xsas')
  await expect(page.getByRole('heading', { name: 'XSAS' })).toBeVisible()

  await page.getByRole('button', { name: '¿qué podés hacer?' }).click()
  const respuesta = page.locator('text=/Tengo \\d+ capacidades disponibles/')
  await expect(respuesta).toBeVisible({ timeout: 60_000 })
  await expect(page.locator('text=/Reasoner: NO/').first()).toBeVisible()
})

test('una pregunta de plata la contesta una capacidad, no un modelo', async ({ page }) => {
  test.setTimeout(120_000)
  await entrarComo(page, ADMIN.email, ADMIN.password)
  await page.goto('/xsas')
  await page.locator('textarea').fill('como venimos')
  await page.locator('textarea').press('Enter')

  await expect(page.locator('text=/ESTADO DE LA EMPRESA/')).toBeVisible({ timeout: 60_000 })
  const traza = page.locator('text=/XSAS · /').first()
  await expect(traza).toContainText('os.estado_empresa')
  await expect(traza).toContainText('Reasoner: NO')
})
