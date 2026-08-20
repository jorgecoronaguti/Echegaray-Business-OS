import { test, expect } from '@playwright/test'
import { ATERRIZAJE } from './util/login'
import { createClient } from '@supabase/supabase-js'

// F6 — Scorecard de Admin/Finanzas + KPIs del propio OS.
//
// La página lee tablas finanzas_* que dan SELECT sólo a `authenticated`. Con anon, RLS bloquea y la
// página muestra el aviso (falso OK si sólo se probara sin login). Por eso el test principal INICIA
// SESIÓN real como Dirección y verifica que las secciones pintan datos de verdad.

const EMAIL = 'jorge.o.corona+direccion-test-1783513222134@gmail.com'
const PASSWORD = 'TestPassword123!'

// Contrato cambiado el 17/08/2026: el anónimo ya no llega a la pantalla a que RLS lo frene — lo
// frena el middleware antes, y en TODAS las rutas. Ver el comentario largo en calendario-financiero.
test('sin sesión autenticada no se llega a la pantalla: manda al login', async ({ page }) => {
  await page.goto('/scorecard-finanzas')
  await page.waitForURL(/\/login/, { timeout: 15000 })
  await expect(page.locator('body')).not.toContainText('Application error')
})

test('autenticado como Dirección: las secciones pintan datos reales y ningún valor se renderiza como objeto', async ({ page }) => {
  test.setTimeout(60000)
  // Cliente directo para sembrar el token de sesión que el server component lee vía cookies.
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

    await page.goto('/scorecard-finanzas')

    // No hay aviso de RLS ni error de app: la sesión llegó.
    await expect(page.getByTestId('page-error')).toHaveCount(0)
    await expect(page.locator('body')).not.toContainText('Application error')

    // Las dos secciones aparecen con datos.
    await expect(page.getByTestId('scorecard-finanzas-section')).toBeVisible()
    await expect(page.getByTestId('salud-area-section')).toBeVisible()
    await expect(page.getByTestId('metricas-os-section')).toBeVisible()

    // Salud del área: al menos la caja de hoy con un valor formateado (fuente única modelo de liquidez).
    const caja = page.getByTestId('kpi-caja_hoy')
    await expect(caja).toBeVisible()
    await expect(caja.getByTestId('kpi-valor')).toContainText('$')

    // Métricas del OS: frescura con un % real, y precisión del forecast honesta como "aún sin datos".
    await expect(page.getByTestId('kpi-frescura_pct').getByTestId('kpi-valor')).toContainText('%')
    await expect(page.getByTestId('kpi-forecast_precision')).toContainText('aún sin datos')

    // GUARDIA CLAVE: ningún jsonb/objeto se filtró al DOM como "[object Object]".
    await expect(page.locator('body')).not.toContainText('[object Object]')

    // Evidencia visual para revisión (el enunciado pide mirar el screenshot).
    await page.screenshot({ path: 'test-results/scorecard-finanzas-autenticado.png', fullPage: true })
  } finally {
    await supabase.auth.signOut()
  }
})
