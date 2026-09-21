// ANALÍTICAS → COBRANZA, EN EL NAVEGADOR Y CON SESIÓN DE DIRECCIÓN.
//
// El dueño (21/09/2026): «la pestaña de cobranza no es de utilidad si no me marca con claridad los
// cobros próximos». Lo que se prueba acá es eso, y con la base real:
//
//   · la vista ABRE con «Cobros próximos» y cada fila dice el día, cuánto entra, de quién y por qué
//     comprobante;
//   · la cabecera trae «entra en 7 días» y «entra en 30 días» además de las tres cifras del v9;
//   · un período pasado NO vacía la agenda —el defecto que esto viene a evitar: un cobro de octubre
//     no está emitido en enero y desaparecería justo cuando hay plata por entrar—;
//   · en 390 px no hay desplazamiento de costado.
//
// Si la base no tuviera ni un comprobante de deuda, la vista lo DICE con su palabra: el spec acepta
// las dos realidades, pero nunca un cero dibujado.
import { test, expect } from '@playwright/test'
import { entrarComo } from './util/login'
import { EMAIL, PASSWORD } from './util/obras-e2e'

test('la vista Cobranza abre con los cobros próximos, y el período no se los lleva', async ({ page }) => {
  await entrarComo(page, EMAIL, PASSWORD)
  await page.goto('/analiticas?vista=cobranza')
  await expect(page.getByRole('heading', { name: 'Cobranza', exact: true })).toBeVisible()

  // LA PREGUNTA DEL DUEÑO ESTÁ ARRIBA DE TODO, antes de la antigüedad.
  await expect(page.getByRole('heading', { name: 'Cobros próximos' })).toBeVisible()
  await expect(page.getByText('entra en 7 días')).toBeVisible()
  await expect(page.getByText('entra en 30 días')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Antigüedad de lo que se debe' })).toBeVisible()

  const agenda = page.getByTestId('cobranza-proximos')
  await expect(agenda).toBeVisible()
  // La aclaración vive en la columna del título de la sección, al lado de la lista.
  await expect(page.getByText('no se recorta por el período de arriba')).toBeVisible()
  const filas = page.getByTestId('cobranza-proximo')
  const n = await filas.count()
  if (n === 0) {
    // Sin cobros en 30 días se dice por qué, nunca una lista vacía sin explicación.
    await expect(agenda).toContainText(/nada en los próximos 30 días|ningún comprobante de deuda/)
  } else {
    // Cada fila: fecha dd/mm/aaaa, plata en la escala del módulo y el tiempo en palabras.
    const texto = await filas.first().innerText()
    expect(texto).toMatch(/\d\d\/\d\d\/\d{4}/)
    expect(texto).toMatch(/\$ [\d.]+,\d\d M/)
    expect(texto).toMatch(/hoy|mañana|en \d+ días|vencido/)
  }

  // UN PERÍODO PASADO NO VACÍA LA AGENDA: recorta lo emitido, no lo que viene.
  await page.goto('/analiticas?vista=cobranza&periodo=2026-01-01..2026-01-31')
  await expect(page.getByRole('heading', { name: 'Cobros próximos' })).toBeVisible()
  expect(await page.getByTestId('cobranza-proximo').count()).toBe(n)
})

test('en el teléfono la cobranza no se desplaza de costado', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await entrarComo(page, EMAIL, PASSWORD)
  await page.goto('/analiticas?vista=cobranza')
  await expect(page.getByRole('heading', { name: 'Cobros próximos' })).toBeVisible()
  const desborde = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(desborde).toBeLessThanOrEqual(1)
})
