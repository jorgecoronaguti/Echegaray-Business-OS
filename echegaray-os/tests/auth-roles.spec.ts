import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

// PR5 — Login y roles reales. Usa una cuenta real de Supabase Auth (creada por este
// mismo test suite en una sesión anterior vía signup real, confirmada manualmente por
// SQL -- mismo mecanismo que un alta real de usuario). El rol se cambia entre bloques
// vía la tabla `perfiles` para probar los 3 roles con una sola cuenta real, dado que
// Supabase Auth tiene un rate limit de emails que impide crear 3 cuentas nuevas en la
// misma sesión de pruebas.
//
// No se hardcodea la contraseña de una cuenta real de producción: esta es una cuenta
// de prueba dedicada (jorge.o.corona+direccion-test-...@gmail.com), sin datos de
// negocio asociados a su identidad, solo usada para validar RLS por rol.

const EMAIL = 'jorge.o.corona+direccion-test-1783513222134@gmail.com'
const PASSWORD = 'TestPassword123!'

async function login(page: import('@playwright/test').Page) {
  await page.goto('/login')
  await page.fill('input[name="email"]', EMAIL)
  await page.fill('input[name="password"]', PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/dashboard/, { timeout: 10000 })
}

test.describe.serial('acceso autenticado real por rol', () => {
  test('login real funciona y la lectura queda permitida para cualquier rol autenticado', async ({ page }) => {
    await login(page)
    await page.goto('/caja')
    // Con sesión real, RLS ya no bloquea la lectura -- no debe verse el banner de "sin sesión".
    await expect(page.getByTestId('page-error')).toHaveCount(0)
    await expect(page.getByTestId('usuario-actual')).toContainText(EMAIL)
  })

  test('jefe_obra: puede planificar actividad semanal (escritura operación permitida)', async ({ page }) => {
    const supabaseLimpieza = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL as string,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    )
    await supabaseLimpieza.auth.signInWithPassword({ email: EMAIL, password: PASSWORD })
    // Auto-sanación: si una corrida anterior fue interrumpida, la limpieza de abajo
    // (no envuelta en try/finally) nunca llegó a ejecutar -- hallazgo real y
    // recurrente en esta sesión. Se borra cualquier residuo previo antes de crear el
    // fixture nuevo.
    await supabaseLimpieza.from('actividades_semanales').delete().ilike('actividad', 'Prueba E2E jefe_obra%')

    const actividad = `Prueba E2E jefe_obra ${Date.now()}`
    await login(page)
    await page.goto('/obras')
    await page.getByRole('link', { name: 'Pisos', exact: true }).click()
    await page.waitForURL(/\/obras\//)
    // Ficha Integral de Obra (2026-07-08): el detalle operativo (formularios de carga)
    // quedó colapsado detrás de "Detalle operativo completo" -- hay que expandirlo
    // antes de poder interactuar con el formulario.
    await page.getByTestId('obra-detalle-operativo').locator('summary').first().click()

    const form = page.getByTestId('plan-semanal-form')
    await form.locator('input[name="actividad"]').fill(actividad)
    await form.locator('input[name="responsable"]').fill('Test E2E')
    await form.locator('button[type="submit"]').click()
    await page.waitForTimeout(1500)
    // Sin mensaje de error de permisos -- la escritura operacional fue permitida.
    const error = form.locator('span.text-red-600')
    await expect(error).toHaveCount(0)

    // Este insert es real (obra Pisos real) -- se borra acá mismo para no dejar datos
    // de prueba mezclados con la planificación real de la obra (auditoría de
    // integridad de datos, 2026-07-08).
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL as string,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    )
    await supabase.auth.signInWithPassword({ email: EMAIL, password: PASSWORD })
    await supabase.from('actividades_semanales').delete().eq('actividad', actividad)
  })

  // Deshabilitado: esta cuenta de prueba se reasignó a rol 'direccion' (a pedido
  // explícito de Jorge, para poder navegar el OS él mismo sin restricciones de
  // escritura -- ver .claude/memory/project/continuidad-operacional-datos.md). Con ese
  // rol el insert YA NO es denegado, así que este test no solo fallaba: además dejaba
  // un movimiento de caja real ("Prueba E2E denegada") insertado en datos financieros
  // reales en cada corrida de la suite (encontrado y limpiado el 2026-07-08). No se
  // revierte el rol de la cuenta compartida (decisión ya tomada), así que este test
  // queda deshabilitado hasta que exista una cuenta de prueba dedicada con rol
  // jefe_obra real, no compartida con la navegación de Jorge.
  test.skip('jefe_obra: NO puede registrar un movimiento de caja (escritura financiera denegada)', async ({ page }) => {
    await login(page)
    await page.goto('/caja')

    const form = page.getByTestId('movimiento-form-section')
    await form.locator('select[name="cuenta_financiera_id"]').selectOption({ index: 1 })
    await form.locator('input[name="fecha_esperada"]').fill('2026-12-01')
    await form.locator('select[name="cliente_id"]').selectOption({ index: 1 })
    await form.locator('select[name="obra_id"]').selectOption({ index: 1 })
    await form.locator('input[name="concepto"]').fill('Prueba E2E denegada')
    await form.locator('input[name="monto"]').fill('1000')
    await form.getByRole('button', { name: 'Registrar movimiento' }).click()
    await page.waitForTimeout(1500)

    // RLS debe rechazar el insert -- tiene que aparecer un mensaje de error, no un alta silenciosa.
    await expect(page.locator('body')).toContainText(/row-level security|policy|permission denied/i)
  })

  // Validado manualmente en esta sesión (no queda como test automático permanente):
  // se cambió perfiles.rol de esta misma cuenta a 'administracion' vía SQL y se
  // repitió exactamente este mismo flujo -- el insert se permitió y no hubo error de
  // RLS, confirmando que la escritura financiera es específica de rol, no un bloqueo
  // total. Se dejó documentado en vez de automatizado porque requeriría credenciales
  // de service role dentro del test (la app nunca las expone al cliente, por diseño),
  // y alternar el rol de la cuenta de prueba en cada corrida haría el suite frágil.
  test.skip('administracion: SÍ puede registrar un movimiento de caja (mismo usuario, rol distinto)', async ({ page }) => {
    await login(page)
    await page.goto('/caja')

    const form = page.getByTestId('movimiento-form-section')
    await form.locator('select[name="cuenta_financiera_id"]').selectOption({ index: 1 })
    await form.locator('input[name="fecha_esperada"]').fill('2026-12-01')
    await form.locator('select[name="cliente_id"]').selectOption({ index: 1 })
    await form.locator('select[name="obra_id"]').selectOption({ index: 1 })
    await form.locator('input[name="concepto"]').fill('Prueba E2E permitida (administracion)')
    await form.locator('input[name="monto"]').fill('1000')
    await form.getByRole('button', { name: 'Registrar movimiento' }).click()
    await page.waitForTimeout(1500)

    await expect(page.locator('body')).not.toContainText(/row-level security|permission denied/i)
    await expect(page.locator('body')).toContainText('Prueba E2E permitida (administracion)')
  })
})
