import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { entrar, EMAIL, PASSWORD } from './util/obras-e2e'

// 22/09: el dueño dio de baja «Alargue corto 3» y dijo «no funcionó». La base la registró (vendida,
// 07:54). Esta prueba hace la baja desde la pantalla, sobre un activo de prueba, y mira qué ve la
// persona después: el aviso, la ficha y la lista.

const CAPTURAS = 'test-results/herramientas-baja'

test('dar de baja desde la ficha: lo que se ve después', async ({ page }) => {
  test.setTimeout(180000)
  const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  await s.auth.signInWithPassword({ email: EMAIL, password: PASSWORD })
  const taller = (await s.from('ubicacion').select('id').eq('tipo', 'taller').single()).data!.id
  const alta = await s.rpc('dar_de_alta_activo', { p_clase: 'herramienta', p_nombre: 'PRUEBA E2E baja desde pantalla', p_ubicacion: taller })
  expect(alta.error).toBeNull()
  const codigo = (await s.from('activo').select('codigo').eq('id', alta.data).single()).data!.codigo as string

  await page.setViewportSize({ width: 1440, height: 1000 })
  await entrar(page)
  await page.goto(`/herramientas/inventario?clase=todo&activo=${codigo}`)
  await page.waitForLoadState('networkidle')
  await page.screenshot({ path: `${CAPTURAS}-1-antes.png`, fullPage: false })
  await page.getByTestId('abrir-baja').click()
  await page.getByTestId('motivo-descartada').check()
  await page.screenshot({ path: `${CAPTURAS}-2-dialogo.png`, fullPage: false })
  await page.getByTestId('confirmar-baja').click()
  await page.waitForTimeout(4000)
  await page.screenshot({ path: `${CAPTURAS}-3-despues.png`, fullPage: false })
  const aviso = await page.getByTestId('aviso-herramientas').textContent().catch(() => null)
  const errorVisible = await page.getByRole('alert').allTextContents()
  console.log('AVISO:', aviso, '| ERRORES:', JSON.stringify(errorVisible))
  const base = (await s.from('activo').select('estado,baja_motivo').eq('id', alta.data).single()).data
  console.log('BASE:', JSON.stringify(base))
  await page.reload()
  await page.waitForLoadState('networkidle')
  await page.screenshot({ path: `${CAPTURAS}-4-recargada.png`, fullPage: false })
  expect(base?.estado).toBe('baja')
})
