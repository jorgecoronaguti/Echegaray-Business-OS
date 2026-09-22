// ANALÍTICAS → CAJA, EN EL NAVEGADOR Y CON SESIÓN DE DIRECCIÓN.
//
// Muerde en los dos estados que la base puede tener: sin el espejo aplicado (migración 20260918T1500)
// la vista lo DICE y no dibuja una caja en cero; con el espejo, las cinco tarjetas de la pestaña están
// con sus rótulos, el importe en dólares queda en su columna y nunca en la de pesos, y la posición
// declara que el período no la mueve. En los dos: el filtro trae los atajos de Caja, el bloque «Lo que
// se está gastando» existe y obedece a la URL, y en 390 px no hay desplazamiento de costado.
import { test, expect } from '@playwright/test'
import { entrarComo } from './util/login'
import { EMAIL, PASSWORD } from './util/obras-e2e'

const TARJETAS = ['CAJA DISPONIBLE', 'DEUDA ATRASADA Y DEL MES', 'SI NO COBRÁS MÁS ESTE MES', 'CAJA INVERTIDA', 'SALDO AL CIERRE']

test('la vista Caja: la pestaña (o por qué no), el gasto por período y los atajos', async ({ page }) => {
  await entrarComo(page, EMAIL, PASSWORD)
  await page.goto('/analiticas?vista=caja&periodo=30d')
  await expect(page.getByRole('heading', { name: 'Caja', exact: true })).toBeVisible()

  const sinFoto = page.getByTestId('caja-sin-foto')
  if (await sinFoto.count()) {
    // SIN ESPEJO: se dice, no se dibuja en cero.
    await expect(sinFoto).toContainText(/espejo de CAJA/)
    for (const t of TARJETAS) await expect(page.getByText(t, { exact: true })).toHaveCount(0)
  } else {
    for (const t of TARJETAS) await expect(page.getByText(t, { exact: true })).toBeVisible()
    await expect(page.getByTestId('caja-a-la-fecha')).toContainText('el período de arriba no la mueve')
    const cuentas = page.getByTestId('caja-seccion-1')
    await expect(cuentas).toBeVisible()
    // DOS MONEDAS: un «U$S» sólo puede estar en «Importe en origen», nunca en «Saldo en pesos».
    const filaUsd = cuentas.locator('div', { hasText: /^Santander · cta cte USD/ }).first()
    const celdas = await filaUsd.locator(':scope > div').allInnerTexts()
    expect(celdas.length).toBeGreaterThanOrEqual(3)
    expect(celdas[1]).toMatch(/U\$S/)
    expect(celdas[2]).not.toMatch(/U\$S/)
    // FECHAS dd/mm/yy en las tablas y en el eje de los gráficos; una celda vacía no se rellena con «—».
    await expect(cuentas).not.toContainText(/\d\d\/\d\d\/\d{4}/)
    const ejes = await page.locator('[data-testid^="caja-grafico-"] svg text').allInnerTexts()
    expect(ejes.filter((t) => /\d\d\/\d\d\/\d{4}/.test(t))).toEqual([])
    // COMBO: ningún rótulo del eje de días se pisa con su vecino.
    for (const svg of await page.locator('[data-testid^="caja-grafico-"] svg').all()) {
      const cajas = await svg.locator('text[text-anchor="start"], text[text-anchor="middle"], text[text-anchor="end"]').evaluateAll((ts) => ts
        .filter((t) => /^\d\d\/\d\d\/\d\d$/.test(t.textContent ?? '')).map((t) => { const r = t.getBoundingClientRect(); return [r.left, r.right] }))
      for (let k = 1; k < cajas.length; k++) expect(cajas[k - 1][1], 'dos fechas del eje encimadas').toBeLessThanOrEqual(cajas[k][0])
    }
  }

  // EL GASTO EXISTE Y OBEDECE A LA URL (dd/mm/yy, una sola vez). Sin la migración, la vista
  // `caja_egreso_percibido` no existe: se DICE (y la parte de la ventana queda para la base con migración).
  if (await page.getByTestId('caja-gasto-sin-lectura').count()) {
    await expect(page.getByTestId('caja-gasto-sin-lectura')).toContainText('caja_egreso_percibido')
    await expect(page.getByTestId('caja-gasto')).toHaveCount(0)
    test.info().annotations.push({ type: 'sin-migracion', description: 'caja_egreso_percibido no existe en esta base: la ventana del gasto no se probó en el navegador' })
  } else {
    const gasto = page.getByTestId('caja-gasto')
    await expect(gasto).toBeVisible()
    await expect(page.getByTestId('caja-gasto-ventana')).toContainText(/últimos 30 días · \d\d\/\d\d\/\d\d – \d\d\/\d\d\/\d\d/)
    await expect(page.getByTestId('caja-gasto-ventana')).not.toContainText(/\d{4}-\d{2}-\d{2}/)
    await page.goto('/analiticas?vista=caja&periodo=2026-08-01..2026-08-31')
    await expect(page.getByTestId('caja-gasto-ventana')).toContainText('01/08/26 – 31/08/26')
    expect((await page.getByTestId('caja-gasto-ventana').innerText()).match(/01\/08\/26/g)?.length).toBe(1)
  }

  // LOS ATAJOS DE CAJA EN EL FILTRO.
  await page.getByTestId('filtro-periodo').click()
  await expect(page.getByRole('button', { name: 'Mes anterior', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Últimos 30 días', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Mes anterior', exact: true }).click()
  await expect(page).toHaveURL(/periodo=mesAnt/)
})

test('en 390 px la vista Caja no se desplaza de costado', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await entrarComo(page, EMAIL, PASSWORD)
  await page.goto('/analiticas?vista=caja&periodo=30d')
  await expect(page.getByTestId('caja-gasto').or(page.getByTestId('caja-gasto-sin-lectura'))).toBeVisible()
  const [scroll, ancho] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth])
  expect(scroll).toBeLessThanOrEqual(ancho)
})

// ═══ DE NÓMINA A CAJA: LA CABECERA DE CAJA NO ARRASTRA UNA TARJETA DE NÓMINA (dueño, 22/09/2026) ═══
//
// «quitar ese valor de "en negro" que aparece en la sección Caja del módulo de Analíticas, no tiene
// nada que ver con lo que debe mostrar ahí». No estaba en el Sheet ni en `VistaCaja`: la portada del
// espejo publica exactamente cinco tarjetas y ninguna se llama así. Era React reusando un nodo: las
// dos tarjetas «en negro» de Nómina compartían `key`, y al cambiar de solapa SIN recargar (las
// solapas son `<Link>`) el sobrante quedaba pegado en la cabecera de Caja. Por eso la navegación
// tiene que ser por la solapa: un `goto` recarga y el defecto no aparece.
test('de Nómina a Caja por la solapa: la cabecera de Caja no arrastra la tarjeta «en negro»', async ({ page }) => {
  await entrarComo(page, EMAIL, PASSWORD)
  await page.goto('/analiticas?vista=nomina')
  await expect(page.getByRole('heading', { name: 'Nómina', exact: true })).toBeVisible()
  const negro = page.getByText('lo que el recibo no paga', { exact: true })
  if (!(await negro.count())) test.skip(true, 'esta base no tiene nómina pagada: la tarjeta «en negro» no se dibuja')
  // EN NÓMINA LA CIFRA SÍ CORRESPONDE, Y SON DOS (la plata y su porcentaje): el arreglo es de llaves,
  // no saca nada de acá.
  await expect(page.getByText('en negro', { exact: true })).toHaveCount(2)
  await page.getByTestId('vista-caja').click()
  await expect(page.getByRole('heading', { name: 'Caja', exact: true })).toBeVisible()
  await expect(page.getByText('lo que el recibo no paga', { exact: true })).toHaveCount(0)
  await expect(page.getByText('en negro', { exact: true })).toHaveCount(0)
  // Y LAS DE CAJA SIGUEN ESTANDO, con la de deuda reemplazada por la de Proveedores.
  if (!(await page.getByTestId('caja-sin-foto').count())) {
    for (const t of ['CAJA DISPONIBLE', 'SI NO COBRÁS MÁS ESTE MES', 'CAJA INVERTIDA', 'SALDO AL CIERRE']) {
      await expect(page.getByText(t, { exact: true })).toBeVisible()
    }
    await expect(page.getByText('Deuda con proveedores', { exact: true })).toBeVisible()
  }
})
