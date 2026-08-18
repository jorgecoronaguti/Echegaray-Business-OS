import { test, expect } from '@playwright/test'
import { ATERRIZAJE, entrarComo } from './util/login'
import { createClient } from '@supabase/supabase-js'

// F7 — Chat interno 0-API embebido en la web.
//
// El chat rutea la pregunta con el ruteador determinístico del OS (routeConsulta) y responde LEYENDO
// las tablas ya materializadas (finanzas_scorecard_vigente, costos_obra, avance_obra). NO llama a
// ninguna API. Las tablas finanzas_* dan SELECT sólo a `authenticated`: por eso el QA que vale INICIA
// SESIÓN real como Dirección (con anon, RLS bloquearía y sería un falso OK).

const EMAIL = 'jorge.o.corona+direccion-test-1783513222134@gmail.com'
const PASSWORD = 'TestPassword123!'

// Escribe una pregunta, la envía y devuelve el locator de la ÚLTIMA respuesta pintada.
async function preguntar(page: import('@playwright/test').Page, texto: string) {
  const antes = await page.getByTestId('chat-respuesta').count()
  await page.getByTestId('chat-input').fill(texto)
  await page.getByTestId('chat-enviar').click()
  await expect(async () => {
    expect(await page.getByTestId('chat-respuesta').count()).toBeGreaterThan(antes)
  }).toPass({ timeout: 15000 })
  return page.getByTestId('chat-respuesta').last()
}

// Desde el 17/08 ninguna pantalla se ve sin sesión (ver calendario-financiero.spec.ts): este test
// mira que la pantalla CARGUE, así que ahora entra primero. Que sin sesión mande al login lo prueba
// obras-modulo-01.spec.ts para todas las rutas a la vez.
test('la página del chat carga y ofrece sugerencias', async ({ page }) => {
  await entrarComo(page, EMAIL, PASSWORD)
  const response = await page.goto('/chat')
  expect(response?.status()).toBe(200)
  await expect(page.getByRole('heading', { name: 'Chat del OS' })).toBeVisible()
  await expect(page.getByTestId('chat-sugerencias')).toBeVisible()
  await expect(page.locator('body')).not.toContainText('Application error')
})

test('autenticado como Dirección: responde lo cubierto con datos reales y lo no cubierto con honestidad', async ({ page }) => {
  test.setTimeout(90000)
  // Cliente directo sólo para validar credenciales; la sesión de la Web se siembra por el login real.
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
    await page.waitForURL(ATERRIZAJE, { timeout: 15000 })

    await page.goto('/chat')
    await expect(page.getByTestId('chat-interno')).toBeVisible()

    // 1) CUBIERTA — caja: el scorecard vigente trae la caja de hoy con un valor en pesos.
    const rCaja = await preguntar(page, '¿Cuánto tengo en caja hoy?')
    await expect(rCaja).toContainText('Posición de caja')
    await expect(rCaja).toContainText('$')

    // 2) CUBIERTA — obligaciones: rutea a otra capacidad financiera y pinta filas.
    const rObl = await preguntar(page, '¿Cuánto tengo que pagar?')
    await expect(rObl).toContainText('Obligaciones y deuda')

    // 3) CUBIERTA — scorecard completo: ambas secciones del área + métricas del OS.
    const rScore = await preguntar(page, 'Dame el scorecard de finanzas')
    await expect(rScore).toContainText('Scorecard Admin/Finanzas')

    // 4) NO CUBIERTA — el chat NO inventa: lo dice y ofrece qué sí puede responder.
    const rNo = await preguntar(page, '¿Cuántos adicionales detecté?')
    await expect(rNo.getByTestId('chat-no-cubierta')).toBeVisible()
    await expect(rNo).toContainText('No tengo esa capacidad todavía')

    // GUARDIA: ningún objeto/jsonb se filtró al DOM como "[object Object]".
    await expect(page.locator('body')).not.toContainText('[object Object]')
    await expect(page.locator('body')).not.toContainText('Application error')

    // Evidencia visual para revisión (el enunciado pide mirar el screenshot).
    await page.screenshot({ path: 'test-results/chat-interno-autenticado.png', fullPage: true })
  } finally {
    await supabase.auth.signOut()
  }
})
