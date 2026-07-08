import { test, expect } from '@playwright/test'

// Tests de negocio reales (Track B / B3): validan preguntas ya declaradas
// "confiables" en el catálogo (features/preguntas-negocio) contra casos reales
// conocidos -- no una query cualquiera que "devuelve datos", sino un valor ya
// verificado independientemente (ver .claude/memory/project/o1-a-obra-piloto-base-operacional.md
// y el recálculo de O1 con HH reales de Pisos cargadas desde JORNALES).
//
// Usa la misma cuenta de prueba real de auth-roles.spec.ts.

const EMAIL = 'jorge.o.corona+direccion-test-1783513222134@gmail.com'
const PASSWORD = 'TestPassword123!'
const GALPONES_ID = 'aaf7c6e2-38a4-4188-a5a9-0a478e9ffa18'
const PISOS_ID = '85653d8c-e388-443d-80ad-46bf5103dc46'

async function login(page: import('@playwright/test').Page) {
  await page.goto('/login')
  await page.fill('input[name="email"]', EMAIL)
  await page.fill('input[name="password"]', PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/dashboard/, { timeout: 10000 })
}

test.describe.serial('preguntas confiables contra casos reales conocidos', () => {
  test('¿Qué obra perdió margen? (Galpones, obra cerrada) coincide con el cálculo manual ya validado', async ({
    page,
  }) => {
    await login(page)
    await page.goto(`/obras/${GALPONES_ID}`)

    const resumen = page.getByTestId('resumen-economico')
    // Margen actualizado y desvío porcentual ya verificados exactos contra el cálculo
    // manual de Jorge en O1-A -- si esto cambia sin una carga real nueva, es una
    // regresión en obra_resumen_economico, no un dato que deba "actualizarse".
    await expect(resumen).toContainText('40578428.25')
    await expect(resumen).toContainText('23.2%')
  })

  test('¿Dónde se excedieron HH? (Pisos, obra en curso) refleja las 681h reales cargadas desde JORNALES', async ({
    page,
  }) => {
    await login(page)
    await page.goto(`/obras/${PISOS_ID}`)

    const produccion = page.getByTestId('produccion-economica-obra-section')
    // HH consumida real (observado, suma de registros_hh cargados desde JORNALES para
    // las semanas 06-22/06-29/07-06) y HH estimada del presupuesto aprobado.
    await expect(produccion).toContainText('681')
    await expect(produccion).toContainText('4047')
    // Avance físico promedio de las 3 actividades cerradas: (75+75+25)/3 = 58,33% -> "58%".
    await expect(produccion).toContainText('58%')
    await expect(produccion).toContainText('atrasado')
  })
})
