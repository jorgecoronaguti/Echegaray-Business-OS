import { test, expect } from '@playwright/test'

// UX-2 (2026-07-08): /obras pasa de listado básico a tablero de gestión. Valida con
// datos reales ya verificados (Pisos: avance 58%, HH 681/4047, costo real $10.161.640
// -- mano de obra $3.105.500 + materiales/subcontratos $7.056.140 cargados en el ciclo
// de Ficha Integral de Obra, ver .claude/memory/project/ficha-integral-obra-pisos.md).

const EMAIL = 'jorge.o.corona+direccion-test-1783513222134@gmail.com'
const PASSWORD = 'TestPassword123!'

test('el tablero de Obras muestra avance, HH, costo real y salud económica de Pisos', async ({ page }) => {
  await page.goto('/login')
  await page.fill('input[name="email"]', EMAIL)
  await page.fill('input[name="password"]', PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/dashboard/, { timeout: 10000 })

  await page.goto('/obras')
  const fila = page
    .getByTestId('obra-tablero-fila')
    .filter({ has: page.getByRole('link', { name: 'Pisos', exact: true }) })
  await expect(fila).toContainText('58%')
  await expect(fila).toContainText('681')
  await expect(fila).toContainText('4047')
  await expect(fila).toContainText('10.161.640')
  await expect(fila).toContainText('Sano')
})
