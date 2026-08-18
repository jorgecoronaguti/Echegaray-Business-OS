import { test, expect } from '@playwright/test'
import { ATERRIZAJE } from './util/login'
import { createClient } from '@supabase/supabase-js'

// Carga nativa del saldo diario de Caja (ciclo autónomo, 2026-07-10). El dev
// server no tiene GOOGLE_SERVICE_ACCOUNT_JSON (igual que Vercel), así que este
// test prueba el camino real de producción: el formulario encola una Acción
// con el payload, que el sync local pasa al Sheet. El test crea su propia
// acción vía UI y la borra al final (delete policy de acciones existe desde
// 20260708185509). El flush real al Sheet se prueba aparte a mano -- acá no se
// escribe en el archivo real de negocio desde la suite.

const EMAIL = 'jorge.o.corona+direccion-test-1783513222134@gmail.com'
const PASSWORD = 'TestPassword123!'
const NOTA_TEST = 'test-e2e-cargar-saldo (borrar)'

test('cargar el saldo del día desde la web lo encola para pasar al Sheet', async ({ page }) => {
  test.setTimeout(60000)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
  )
  await supabase.auth.signInWithPassword({ email: EMAIL, password: PASSWORD })

  // Auto-sanación: limpiar residuos de corridas interrumpidas.
  await supabase.from('acciones').delete().eq('categoria_alerta', 'cargar_saldo_caja').ilike('causa', `%${NOTA_TEST}%`)

  try {
    await page.goto('/login')
    await page.fill('input[name="email"]', EMAIL)
    await page.fill('input[name="password"]', PASSWORD)
    await page.click('button[type="submit"]')
    await page.waitForURL(ATERRIZAJE, { timeout: 15000 })

    await page.goto('/flujo-caja')
    await page.getByTestId('cargar-saldo-section').locator('summary').click()
    const form = page.getByTestId('cargar-saldo-form')
    await form.locator('select[name="cuenta"]').selectOption('Efectivo')
    await form.locator('input[name="saldo"]').fill('1234567.89')
    await form.locator('input[name="notas"]').fill(NOTA_TEST)
    await page.getByTestId('cargar-saldo-submit').click()

    await expect(page.getByTestId('cargar-saldo-ok')).toBeVisible({ timeout: 15000 })
    await expect(page.getByTestId('cargar-saldo-ok')).toContainText('sincronización')

    // La acción quedó encolada con el payload correcto.
    const { data } = await supabase
      .from('acciones')
      .select('titulo, monto, contraparte, estado, causa')
      .eq('categoria_alerta', 'cargar_saldo_caja')
      .ilike('causa', `%${NOTA_TEST}%`)
    expect(data).toHaveLength(1)
    expect(data![0].estado).toBe('pendiente')
    expect(Number(data![0].monto)).toBeCloseTo(1234567.89, 2)
    expect(data![0].contraparte).toBe('Efectivo')
    expect(JSON.parse(data![0].causa).cuenta).toBe('Efectivo')
  } finally {
    await supabase.from('acciones').delete().eq('categoria_alerta', 'cargar_saldo_caja').ilike('causa', `%${NOTA_TEST}%`)
    await supabase.auth.signOut()
  }
})
