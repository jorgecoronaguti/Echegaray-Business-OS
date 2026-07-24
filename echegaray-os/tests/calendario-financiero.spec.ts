import { test, expect } from '@playwright/test'

// QA del Calendario Financiero (23/07). El módulo pinta lo que decide el motor de Ingeniería
// Financiera (orquestador/lib/calendario-financiero.mjs) materializado en public.finanzas_calendario.
// Estas pruebas navegan la app REAL autenticada: son la Fase 2 (QA visual) y la Fase 3 (QA funcional)
// del pedido, que no se pueden dar por hechas leyendo el código.

const EMAIL = 'jorge.o.corona+direccion-test-1783513222134@gmail.com'
const PASSWORD = 'TestPassword123!'

async function entrar(page: import('@playwright/test').Page) {
  await page.goto('/login')
  await page.fill('input[name="email"]', EMAIL)
  await page.fill('input[name="password"]', PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/dashboard/, { timeout: 15000 })
  await page.goto('/calendario-financiero')
}

test('con sesión, el calendario muestra días reales y no el cartel de vacío', async ({ page }) => {
  await entrar(page)
  // El encabezado del módulo y la caja inicial: si el snapshot no llegó, acá se cae.
  await expect(page.getByText(/caja inicial/i)).toBeVisible({ timeout: 15000 })
  // La grilla del mes: los siete nombres de día tienen que estar.
  for (const d of ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom']) {
    await expect(page.getByText(d, { exact: true }).first()).toBeVisible()
  }
})

// HALLAZGO DEL QA (23/07): ninguna página de (main) redirige al anónimo a /login — el guardián real
// es RLS en Supabase, y `finanzas_calendario` es `for select to authenticated`. Así que lo que hay
// que probar no es la redirección (que este repo no hace en ninguna pantalla), sino la propiedad que
// de verdad importa: sin sesión NO se ve un solo peso.
test('sin sesión no se filtra ninguna cifra: RLS deja la pantalla sin datos', async ({ page }) => {
  await page.goto('/calendario-financiero')
  await expect(page.getByRole('heading', { name: 'Calendario Financiero' })).toBeVisible()
  await expect(page.getByText(/caja inicial/i)).toHaveCount(0)
  await expect(page.getByText(/\$\s?\d/)).toHaveCount(0)
})

test('las tres vistas se pueden cambiar y cada una cambia lo que se ve', async ({ page }) => {
  await entrar(page)
  await expect(page.getByText(/caja inicial/i)).toBeVisible({ timeout: 15000 })

  await page.getByRole('button', { name: 'semanal', exact: true }).click()
  await expect(page.getByText(/^Semana \d+ de \d+$/)).toBeVisible()

  await page.getByRole('button', { name: 'diaria', exact: true }).click()
  await expect(page.getByText(/^Semana \d+ de \d+$/)).toHaveCount(0)

  await page.getByRole('button', { name: 'mensual', exact: true }).click()
  await expect(page.getByText('lun', { exact: true }).first()).toBeVisible()
})

test('la navegación de períodos avanza y se frena en los extremos', async ({ page }) => {
  await entrar(page)
  await expect(page.getByText(/caja inicial/i)).toBeVisible({ timeout: 15000 })

  const anterior = page.getByRole('button', { name: 'Mes anterior' })
  const siguiente = page.getByRole('button', { name: 'Mes siguiente' })
  // En el primer mes no se puede retroceder: el calendario arranca hoy.
  await expect(anterior).toBeDisabled()
  await expect(siguiente).toBeEnabled()

  await siguiente.click()
  await expect(anterior).toBeEnabled()

  // Se avanza hasta el final y ahí el botón se apaga: no se inventan meses vacíos.
  for (let i = 0; i < 6 && (await siguiente.isEnabled()); i++) await siguiente.click()
  await expect(siguiente).toBeDisabled()
})

test('al elegir un día se abre su panel con el saldo y la composición', async ({ page }) => {
  await entrar(page)
  await expect(page.getByText(/caja inicial/i)).toBeVisible({ timeout: 15000 })

  // Un día con movimientos: los pinta con el delta en miles (+Nk / −Nk).
  const conMovimiento = page.locator('button').filter({ hasText: /[+−]\d+k/ }).first()
  await conMovimiento.click()

  // El panel vive en el <aside>: "Movimientos" también es un link del nav, así que se acota el ámbito.
  const panel = page.getByRole('complementary')
  await expect(panel.getByText('Saldo inicial')).toBeVisible()
  await expect(panel.getByText('Saldo final')).toBeVisible()
  await expect(panel.getByText('Movimientos')).toBeVisible()
})

test('las recomendaciones del motor se muestran (la pantalla no decide nada por su cuenta)', async ({ page }) => {
  await entrar(page)
  await expect(page.getByText(/caja inicial/i)).toBeVisible({ timeout: 15000 })
  await expect(page.getByText('Acciones recomendadas')).toBeVisible()
})

// QA del Plan de ejecución (24/07). El calendario sigue central; debajo aparece el Plan de Tesorería
// optimizado con su estado, y la acción única "Aprobar y convertir en trabajo". Nada financiero se
// calcula en React: todo sale de public.finanzas_plan_vigente (el motor lo dejó ahí).
test('el Plan de ejecución aparece bajo el calendario con su estado y las acciones', async ({ page }) => {
  await entrar(page)
  await expect(page.getByRole('heading', { name: 'Plan de ejecución' })).toBeVisible({ timeout: 15000 })
  // El estado del plan es visible (pendiente / aprobado / en ejecución).
  await expect(page.getByText(/Pendiente de aprobación|Aprobado|En ejecución/).first()).toBeVisible()
})

test('sin sesión, el Plan de ejecución no filtra ninguna acción (RLS)', async ({ page }) => {
  await page.goto('/calendario-financiero')
  // La sección no debería mostrar acciones ni el botón de aprobación sin sesión.
  await expect(page.getByRole('button', { name: /Aprobar y convertir en trabajo/ })).toHaveCount(0)
})
