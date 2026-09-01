import { test, expect } from '@playwright/test'
import { entrarComo } from './util/login'
import { ADMIN } from './util/identidades'

// EL EXTRACTO POR /xsas, DE PUNTA A PUNTA Y CONTRA PRODUCCIÓN.
//
// Usa el CSV REAL ya importado esta mañana: la corrida es IDEMPOTENTE (0 nuevos, la réplica
// reescribe los mismos movimientos). Eso es lo que la vuelve segura como smoke y lo que prueba a la
// vez la deduplicación. La aserción que importa: Reasoner NO — el circuito entero es determinístico.
const CSV = '/home/jorge/echegaray-os/app/echegaray-os/.claude/estado/extractos/extracto-2026-09-01.csv'

test('el CSV del banco soltado en /xsas corre el circuito entero sin razonador', async ({ page }) => {
  test.setTimeout(180_000)
  await entrarComo(page, ADMIN.email, ADMIN.password)
  await page.goto('/xsas')

  await page.locator('input[type="file"]').setInputFiles(CSV)
  await expect(page.locator('text=descargaUltimosMovimientos').or(page.locator('text=extracto-2026-09-01'))).toBeVisible()
  await page.locator('textarea').fill('procesá esto y actualizá lo que corresponda')
  await page.locator('textarea').press('Enter')

  await expect(page.locator('text=/cadena de saldos/')).toBeVisible({ timeout: 120_000 })
  await expect(page.locator('text=/0 nuevo\\(s\\), 348 ya estaban/')).toBeVisible()
  await expect(page.locator('text=/_BANCO_RAW actualizada/')).toBeVisible()
  const traza = page.locator('text=/XSAS · /').first()
  await expect(traza).toContainText('Reasoner: NO')
  await expect(traza).toContainText('banco.importar_extracto')
})
