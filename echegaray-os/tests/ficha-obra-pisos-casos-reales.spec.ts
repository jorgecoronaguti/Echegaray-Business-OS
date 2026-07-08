import { test, expect } from '@playwright/test'

// Ficha Integral de Obra (ciclo "centro de comando económico-productivo", 2026-07-08).
// Valida las preguntas de la Sección 13 del ciclo contra números reales de la obra
// piloto Pisos, ya auditados y cargados con evidencia real (JORNALES + Flujo de Caja -
// Cash Flow > Compras/02_Cobranzas). Ver .claude/memory/project/ficha-integral-obra-pisos.md.

const EMAIL = 'jorge.o.corona+direccion-test-1783513222134@gmail.com'
const PASSWORD = 'TestPassword123!'
const PISOS_ID = '85653d8c-e388-443d-80ad-46bf5103dc46'

async function login(page: import('@playwright/test').Page) {
  await page.goto('/login')
  await page.fill('input[name="email"]', EMAIL)
  await page.fill('input[name="password"]', PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/dashboard/, { timeout: 10000 })
}

test.describe.serial('Ficha Integral de Pisos responde de punta a punta con números reales', () => {
  test('Resumen y Economía: contratado, presupuesto, costo real, ETC/EAC, margen forecast', async ({ page }) => {
    await login(page)
    await page.goto(`/obras/${PISOS_ID}`)

    const resumen = page.getByTestId('ficha-obra-resumen')
    await expect(resumen).toContainText('58%')
    await expect(resumen).toContainText('atrasado')
    await expect(resumen).toContainText('30.170.317')
    await expect(resumen).toContainText('11.215.646')

    const economia = page.getByTestId('ficha-obra-economia')
    await expect(economia).toContainText('47.590.272')
    await expect(economia).toContainText('36.607.901')
    await expect(economia).toContainText('10.161.640')
    await expect(economia).toContainText('7.258.314')
    await expect(economia).toContainText('17.419.955')
    await expect(economia).toContainText('30.170.317')
  })

  test('HH y productividad: estimadas vs. reales cargadas desde JORNALES', async ({ page }) => {
    await login(page)
    await page.goto(`/obras/${PISOS_ID}`)

    const hh = page.getByTestId('ficha-obra-hh')
    await expect(hh).toContainText('4047')
    await expect(hh).toContainText('681')
    await expect(hh).toContainText('-83.17%')
  })

  test('Certificación y cobranza: declara $0 de certificado real sin ocultar la cobranza proyectada', async ({
    page,
  }) => {
    await login(page)
    await page.goto(`/obras/${PISOS_ID}`)

    const cc = page.getByTestId('ficha-obra-certificacion-cobranza')
    await expect(cc).toContainText('11.215.646')
    await expect(cc).toContainText('Dato real')
  })

  test('Costos: desglose por concepto y nota de costo con atribución inferida', async ({ page }) => {
    await login(page)
    await page.goto(`/obras/${PISOS_ID}`)

    const costos = page.getByTestId('ficha-obra-costos')
    await expect(costos).toContainText('3.203.699')
    await expect(costos).toContainText('6.957.941')
    await expect(costos).toContainText('Revoque fino')
    await expect(page.getByTestId('ficha-obra-costo-pendiente-clasificar')).toContainText('cliente compartido')
  })

  test('Riesgos y decisiones: reutiliza el mismo Motor de Observación del Dashboard, filtrado por esta obra', async ({
    page,
  }) => {
    await login(page)
    await page.goto(`/obras/${PISOS_ID}`)

    const riesgos = page.getByTestId('ficha-obra-riesgos-decisiones')
    await expect(riesgos).toContainText('HH')
    await expect(page.getByTestId('alerta-dashboard').first()).toBeVisible()
  })
})
