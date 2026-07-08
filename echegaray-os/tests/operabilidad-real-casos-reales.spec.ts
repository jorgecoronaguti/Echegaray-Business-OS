import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

// Ciclo "operabilidad real" (2026-07-09): valida con datos reales las capacidades
// nuevas -- cola de clasificación de costo por obra, bloqueo de acciones, ritual
// diario/semanal. Los tests de lectura usan datos ya reales y verificados; el test de
// escritura (bloqueo) crea y borra su propio fixture, igual que el resto de la suite.

const EMAIL = 'jorge.o.corona+direccion-test-1783513222134@gmail.com'
const PASSWORD = 'TestPassword123!'

async function login(page: import('@playwright/test').Page) {
  await page.goto('/login')
  await page.fill('input[name="email"]', EMAIL)
  await page.fill('input[name="password"]', PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/dashboard/, { timeout: 10000 })
}

test.describe.serial('operabilidad real — capacidades nuevas con datos reales', () => {
  test('la cola de clasificación de costos muestra gastos reales de San Francisco con sugerencia declarada', async ({ page }) => {
    await login(page)
    await page.goto('/administracion')

    const cola = page.getByTestId('cola-clasificacion-costos')
    await expect(cola).toContainText('gasto(s) sin obra confirmada')
    // Caso real verificado a mano: DUPEC mar-26 ($5.100.000) no cae en la ventana
    // declarada de ninguna obra (Galpones cerró en enero, Pisos empezó en junio) --
    // el OS no fuerza una sugerencia.
    const filaDupec = page.getByTestId('clasificacion-costo-fila').filter({ hasText: 'Compras mar-26' }).first()
    await expect(filaDupec).toBeVisible()
  })

  test('el ritual semanal de Dirección muestra caja de 8 semanas y estado de obras reales', async ({ page }) => {
    await login(page)
    await page.goto('/sintesis-semanal')

    const caja = page.getByTestId('semanal-caja')
    const filasSemana = caja.locator('tbody tr')
    await expect(filasSemana).toHaveCount(8)

    const obras = page.getByTestId('semanal-obras')
    await expect(obras).toContainText('Pisos')
  })

  test('el ritual semanal de Obras (Operación) muestra la síntesis real de Pisos', async ({ page }) => {
    await login(page)
    await page.goto('/operacion')

    const sintesis = page.getByTestId('operacion-sintesis-por-obra')
    await expect(sintesis).toContainText('Pisos')
    await expect(sintesis).toContainText('HH real/est.')
  })

  test('el Operador Digital muestra los 7 bloques (Observando/Detectado/Investigando/Recomendando/Trabajo/Bloqueado/Mejorando)', async ({ page }) => {
    await login(page)
    await page.goto('/operador-digital')

    for (const testId of [
      'operador-digital-observando',
      'operador-digital-detectado',
      'operador-digital-investigando',
      'operador-digital-recomienda',
      'operador-digital-backlog',
      'operador-digital-bloqueado',
      'operador-digital-mejorando',
    ]) {
      await expect(page.getByTestId(testId)).toBeVisible()
    }
  })

  test('una acción puede marcarse como bloqueada y aparece en el Centro de Acción y en la home de Dirección', async ({ page }) => {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL as string,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    )
    await supabase.auth.signInWithPassword({ email: EMAIL, password: PASSWORD })

    // Auto-sanación (patrón ya establecido en esta suite): limpiar residuo de una
    // corrida anterior interrumpida antes de crear el fixture nuevo.
    await supabase.from('acciones').delete().ilike('titulo', 'Prueba E2E bloqueo%')

    const titulo = `Prueba E2E bloqueo ${Date.now()}`
    const { data: accion, error } = await supabase
      .from('acciones')
      .insert({ origen: 'manual', titulo, area: 'direccion', estado: 'pendiente' })
      .select('id')
      .single()
    expect(error).toBeNull()

    try {
      await login(page)
      await page.goto('/acciones')
      const card = page.getByTestId('accion-card').filter({ hasText: titulo })
      await card.getByTestId('toggle-bloqueada').click()
      await card.locator('input[name="motivo_bloqueo"]').fill('Esperando confirmación del cliente')
      await card.locator('button[type="submit"]').last().click()
      await page.waitForTimeout(1500)
      await expect(page.getByTestId('accion-card').filter({ hasText: titulo })).toContainText('⛔ Bloqueada')

      await page.goto('/dashboard')
      const trabajo = page.getByTestId('direccion-acciones')
      await expect(trabajo).toContainText('Bloqueadas')
    } finally {
      await supabase.from('acciones').delete().eq('id', accion!.id)
    }
  })
})
