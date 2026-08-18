import { test, expect } from '@playwright/test'
import { ATERRIZAJE } from './util/login'
import { createClient } from '@supabase/supabase-js'

// CARGA NATIVA DEL SALDO DIARIO DE CAJA.
//
// ═══ ESTE TEST ESCRIBIÓ EN EL SHEET REAL DEL DUEÑO (18/08/2026) ═══
//
// Su cabecera decía, textual: *"El dev server no tiene GOOGLE_SERVICE_ACCOUNT_JSON (igual que
// Vercel), así que este test prueba el camino real de producción: el formulario encola una Acción…
// acá no se escribe en el archivo real de negocio desde la suite"*.
//
// La premisa dejó de ser cierta y nadie lo notó: **producción SÍ tiene la service account**. Corrido
// con `E2E_BASE_URL=https://app.ecsas.com.ar`, el formulario tomó el camino directo y dejó DOS filas
// en la pestaña CAJA del "Flujo de Caja - Cash Flow": `18/8/2026 · Efectivo · 1.234.567,89 · OS web`.
// El test no falló por eso —falló porque el mensaje decía "cargado en el Sheet" en vez de
// "sincronización"—, o sea que el aviso de que estaba escribiendo el archivo del dueño llegó por un
// texto que no coincidía, de casualidad.
//
// LA REGLA QUE SALE DE ACÁ: un test no puede depender de que una credencial NO esté configurada para
// no hacer daño. Eso no es una salvaguarda, es una coincidencia de entorno. El caso que escribe se
// SALTEA explícitamente contra producción, y el que corre contra el dev server verifica lo único que
// se puede verificar sin tocar el archivo: que la acción quede encolada.

const EMAIL = 'jorge.o.corona+direccion-test-1783513222134@gmail.com'
const PASSWORD = 'TestPassword123!'
const NOTA_TEST = 'test-e2e-cargar-saldo (borrar)'

const CONTRA_PRODUCCION = /app\.ecsas\.com\.ar/.test(process.env.E2E_BASE_URL ?? '')

test('cargar el saldo del día desde la web lo encola para pasar al Sheet', async ({ page }) => {
  // Contra producción este formulario ESCRIBE la pestaña CAJA del archivo real. No se corre.
  test.skip(CONTRA_PRODUCCION,
    'contra producción este caso escribe en la CAJA real del dueño: se corre sólo contra el dev server')
  // `/flujo-caja` lee el Sheet real con una service account: contra producción es una función fría
  // de Vercel + una llamada a la API de Google, y 60 s no alcanzan. Se sube SÓLO el techo — no se
  // toca una afirmación: lo que tarda es el entorno, no lo que se prueba.
  test.setTimeout(240000)
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
