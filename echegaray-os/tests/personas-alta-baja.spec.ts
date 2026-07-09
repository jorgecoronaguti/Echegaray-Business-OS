import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

// Alta/modificación/baja nativa de Personas (2026-07-09) -- gap real confirmado: la
// tabla `personas` no tenía ningún formulario de escritura, solo lectura de lo
// descubierto en Drive. Este test crea y borra su propio legajo de prueba para no
// alterar el conteo real de 30 legajos verificado en personas-legajos-casos-reales.

const EMAIL = 'jorge.o.corona+direccion-test-1783513222134@gmail.com'
const PASSWORD = 'TestPassword123!'

async function login(page: import('@playwright/test').Page) {
  await page.goto('/login')
  await page.fill('input[name="email"]', EMAIL)
  await page.fill('input[name="password"]', PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/dashboard/, { timeout: 10000 })
}

test('un legajo puede darse de alta, editarse y darse de baja desde el OS', async ({ page }) => {
  test.setTimeout(60000)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
  )
  await supabase.auth.signInWithPassword({ email: EMAIL, password: PASSWORD })

  const nombre = `Prueba E2E Legajo ${Date.now()}`
  // Auto-sanación: limpiar residuo de una corrida anterior interrumpida.
  await supabase.from('personas').delete().ilike('nombre_completo', 'Prueba E2E Legajo%')

  try {
    await login(page)
    await page.goto('/personas')

    await page.getByTestId('persona-alta-section').locator('summary').click()
    const altaForm = page.getByTestId('persona-alta-form')
    await altaForm.locator('input[name="nombre_completo"]').fill(nombre)
    await altaForm.locator('input[name="fecha_ingreso"]').fill('2026-07-09')
    await altaForm.locator('input[name="categoria"]').fill('Oficial')
    await altaForm.locator('button[type="submit"]').click()
    await page.waitForTimeout(1200)

    const fila = page.getByTestId('persona-fila').filter({ hasText: nombre })
    await expect(fila).toBeVisible()
    await expect(fila).toContainText('Activo')

    await fila.getByTestId('persona-actualizar-section').locator('summary').click()
    const actualizarForm = fila.getByTestId('persona-actualizar-form')
    await actualizarForm.getByTestId('persona-fecha-egreso-input').fill('2026-07-10')
    await actualizarForm.locator('button[type="submit"]').click()
    await page.waitForTimeout(1200)

    const filaActualizada = page.getByTestId('persona-fila').filter({ hasText: nombre })
    await expect(filaActualizada).toContainText('Baja')
    await expect(filaActualizada).toContainText('2026-07-10')
  } finally {
    await supabase.from('personas').delete().ilike('nombre_completo', 'Prueba E2E Legajo%')
  }
})
