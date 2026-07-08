import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

// Backlog Autónomo -> Centro de Acción (Track B / punto 6, OLA 2). Confirma que un
// item de backlog puede convertirse en una Acción real, reutilizando el mismo
// mecanismo de alerta_origen_id (nunca duplica el task manager).
//
// Este test crea su propio item de backlog sintético y lo borra al final (junto con
// la acción resultante) en vez de operar sobre "la primera fila" de datos reales --
// desde que existen rutinas autónomas que insertan backlog real (detección de
// acciones vencidas / fuentes críticas atrasadas), la lista ya no es una lista fija de
// prueba: convertir "lo primero que aparezca" convertiría un ítem real de gestión en
// una Acción real como efecto secundario de correr la suite (auditoría de integridad
// de datos, 2026-07-08).

const EMAIL = 'jorge.o.corona+direccion-test-1783513222134@gmail.com'
const PASSWORD = 'TestPassword123!'

test('un item de backlog abierto puede convertirse en una acción real', async ({ page }) => {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
  )
  await supabase.auth.signInWithPassword({ email: EMAIL, password: PASSWORD })

  const titulo = `Prueba E2E backlog->acción ${Date.now()}`
  const { data: item, error: insertError } = await supabase
    .from('backlog_autonomo')
    .insert({
      tipo: 'mejora_potencial',
      titulo,
      evidencia: 'Fixture de test, no es un hallazgo real.',
      fuente: 'test Playwright',
      confianza: 'confirmado',
      impacto: 'baja',
      urgencia: 'baja',
      esfuerzo: 'bajo',
      recomendacion: 'Fixture de test.',
      nivel_autonomia_permitido: 'C',
      estado: 'abierto',
    })
    .select('id')
    .single()
  expect(insertError).toBeNull()

  try {
    await page.goto('/login')
    await page.fill('input[name="email"]', EMAIL)
    await page.fill('input[name="password"]', PASSWORD)
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/dashboard/, { timeout: 10000 })

    await page.goto('/backlog-autonomo')
    const fila = page.getByTestId('backlog-fila').filter({ hasText: titulo })
    await fila.getByTestId('convertir-backlog-en-accion-btn').click()
    await page.waitForTimeout(1500)
    await expect(fila.getByTestId('backlog-ya-convertido')).toBeVisible()
  } finally {
    await supabase.from('acciones').delete().eq('alerta_origen_id', item!.id)
    await supabase.from('backlog_autonomo').delete().eq('id', item!.id)
  }
})
