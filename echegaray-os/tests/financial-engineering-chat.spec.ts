import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

// FE1 — Financial Engineering multi-experto embebido en la web.
//
// La capacidad RAZONA (tres lentes expertas grounded en sus skills + comparación) y es SÓLO-LECTURA:
// interpreta el Flujo de Fondos, nunca lo toca. El QA que vale INICIA SESIÓN real como Dirección
// (las tablas finanzas_* dan SELECT sólo a `authenticated`). Sin credencial de razonamiento en el
// entorno, la ruta degrada HONESTAMENTE (sin_credito / sin_contexto) mostrando el contexto real sin
// interpretar — nunca un 500 ni un peso inventado. El QA acepta cualquiera de las dos ramas: respuesta
// razonada (fe-respuesta) o degradación honesta (fe-error), y en ambas verifica que no hay error de app.

const EMAIL = 'jorge.o.corona+direccion-test-1783513222134@gmail.com'
const PASSWORD = 'TestPassword123!'

test('la página carga sin sesión y ofrece sugerencias (RLS-safe)', async ({ page }) => {
  const response = await page.goto('/financial-engineering-chat')
  expect(response?.status()).toBe(200)
  await expect(page.getByRole('heading', { name: 'Hablá con el Financial Engineering' })).toBeVisible()
  await expect(page.getByTestId('fe-sugerencias')).toBeVisible()
  await expect(page.getByTestId('fe-input')).toBeVisible()
  await expect(page.locator('body')).not.toContainText('Application error')
})

test('autenticado como Dirección: consulta el Flujo de Fondos y responde razonado o degrada honesto (sólo-lectura)', async ({ page }) => {
  test.setTimeout(90000)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
  )
  await supabase.auth.signInWithPassword({ email: EMAIL, password: PASSWORD })

  try {
    await page.goto('/login')
    await page.fill('input[name="email"]', EMAIL)
    await page.fill('input[name="password"]', PASSWORD)
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/(dashboard|flujo-caja)/, { timeout: 15000 })

    // Navegación real: el link del nav lleva a la página.
    await page.goto('/financial-engineering-chat')
    await expect(page.getByTestId('fe-input')).toBeVisible()

    // Enviar una consulta real sobre el Flujo de Fondos.
    await page.getByTestId('fe-input').fill('¿Conviene pagar hoy a los proveedores o esperar?')
    await page.getByTestId('fe-enviar').click()

    // Cualquiera de las dos ramas debe aparecer: la respuesta razonada o la degradación honesta.
    await expect(async () => {
      const ok = await page.getByTestId('fe-respuesta').count()
      const err = await page.getByTestId('fe-error').count()
      expect(ok + err).toBeGreaterThan(0)
    }).toPass({ timeout: 60000 })

    // Si razonó, deben verse las tres lentes y la comparación.
    if ((await page.getByTestId('fe-respuesta').count()) > 0) {
      await expect(page.getByTestId('lente-contador')).toBeVisible()
      await expect(page.getByTestId('lente-abogado')).toBeVisible()
      await expect(page.getByTestId('lente-financiero')).toBeVisible()
      await expect(page.getByTestId('comparacion')).toBeVisible()
    }

    // GUARDIAS DURAS en ambas ramas: nada de objetos crudos ni errores de app.
    await expect(page.locator('body')).not.toContainText('[object Object]')
    await expect(page.locator('body')).not.toContainText('Application error')

    await page.screenshot({ path: 'test-results/financial-engineering-chat-autenticado.png', fullPage: true })
  } finally {
    await supabase.auth.signOut()
  }
})
