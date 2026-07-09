import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

// Alta/baja nativa de Equipos (2026-07-09) -- gap real confirmado: la tabla `equipos`
// no tenía ningún formulario de escritura. Crea y borra su propio equipo de prueba
// para no alterar el conteo real de 6 vehículos verificado en continuidad-datos.

const EMAIL = 'jorge.o.corona+direccion-test-1783513222134@gmail.com'
const PASSWORD = 'TestPassword123!'

test('un equipo puede darse de alta y de baja desde el OS', async ({ page }) => {
  test.setTimeout(60000)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
  )
  await supabase.auth.signInWithPassword({ email: EMAIL, password: PASSWORD })

  const nombre = `Prueba E2E Equipo ${Date.now()}`
  await supabase.from('equipos').delete().ilike('nombre', 'Prueba E2E Equipo%')

  try {
    await page.goto('/login')
    await page.fill('input[name="email"]', EMAIL)
    await page.fill('input[name="password"]', PASSWORD)
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/dashboard/, { timeout: 10000 })

    await page.goto('/equipos')
    await page.getByTestId('equipo-alta-section').locator('summary').click()
    const form = page.getByTestId('equipo-alta-form')
    await form.locator('input[name="nombre"]').fill(nombre)
    await form.locator('select[name="tipo"]').selectOption('herramienta_mayor')
    await form.locator('button[type="submit"]').click()
    await page.waitForTimeout(1200)

    const fila = page.getByTestId('equipo-fila').filter({ hasText: nombre })
    await expect(fila).toBeVisible()
    await expect(fila).toContainText('fuente: OS')

    await fila.getByTestId('equipo-eliminar-form').locator('button[type="submit"]').click()
    await page.waitForTimeout(1200)
    await expect(page.getByTestId('equipo-fila').filter({ hasText: nombre })).toHaveCount(0)
  } finally {
    await supabase.from('equipos').delete().ilike('nombre', 'Prueba E2E Equipo%')
  }
})
