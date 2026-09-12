import { test, expect } from '@playwright/test'
import { entrar } from './util/obras-e2e'

// NUEVE CARAS ERAN DEMASIADAS (dueño, 12/09/2026 13:10, textual):
// «El CRM admin en cada cliente tiene secciones inútiles y repetitivas con datos que pueden
// unificarse en menos secciones; revisar y mejorar todo eso.»
//
// ═══ QUÉ DEFECTOS ATRAPA ═══
//
//  1 · QUE UNA CARA RETIRADA SIGA OFRECIÉNDOSE. La barra tiene que tener CINCO y ninguna de las
//      cuatro que se fueron.
//  2 · QUE UN ENLACE VIEJO CAIGA EN LA FICHA GENÉRICA. `?vista=esquema` está compartido por mail: si
//      abre Trabajos, no se rompe nada visible y nadie reporta nada — el enlace deja de llevar a
//      donde decía y punto. Se verifica la dirección FINAL, que es lo que prueba que hubo redirect.
//  3 · QUE LA CONSOLIDACIÓN PIERDA UN BLOQUE. Cobranzas tiene que dibujar las filas, la cuenta
//      corriente y el esquema; el costado, la actividad y el portal.
//  4 · QUE LAS CIFRAS SE REPITAN EN LA MISMA CARA. La fila de cifras de Cobranzas es UNA.

const ANCHO = 1280

test('la ficha del cliente ofrece CINCO caras, y ninguna de las cuatro retiradas', async ({ page }) => {
  test.setTimeout(240000)
  await entrar(page)
  await page.setViewportSize({ width: ANCHO, height: 1000 })
  await page.goto('/clientes/messina')

  const barra = page.getByTestId('vistas-cliente')
  await expect(barra).toBeVisible({ timeout: 60000 })
  for (const cara of ['Trabajos', 'Órdenes de compra y de pago', 'Cobranzas', 'Presupuestos', 'Documentos']) {
    await expect(barra).toContainText(cara)
  }
  for (const retirada of ['Cuenta corriente', 'Esquema de pago', 'Acceso al portal', 'Actividad']) {
    await expect(barra).not.toContainText(retirada)
  }
  // EL COSTADO SE QUEDÓ CON LAS DOS QUE BAJARON.
  const costado = page.getByTestId('panel-informacion')
  await expect(costado).toContainText('Actividad reciente')
  await expect(costado).toContainText('Portal del cliente')
  await expect(costado.getByTestId('resumen-portal')).toContainText(/acceso|No pude leer/)
  await page.screenshot({ path: `tests/capturas/cliente-cinco-solapas-${ANCHO}.png`, fullPage: false })
})

test('los enlaces viejos redirigen a su bloque, y la dirección vieja sale de la barra', async ({ page }) => {
  test.setTimeout(240000)
  await entrar(page)
  await page.setViewportSize({ width: ANCHO, height: 1000 })

  for (const [vieja, esperada] of [
    ['cuenta', '/clientes/messina?vista=cobranzas#cuenta-corriente'],
    ['esquema', '/clientes/messina?vista=cobranzas#esquema-de-pago'],
    ['actividad', '/clientes/messina?actividad=todo'],
    ['accesos', '/clientes/messina?portal=1'],
  ] as const) {
    await page.goto(`/clientes/messina?vista=${vieja}`)
    await expect(page).toHaveURL(new RegExp(esperada.replace(/[?#]/g, (c) => `\\${c}`)), { timeout: 60000 })
  }
})

test('Cobranzas es una sola cara con sus tres bloques y UNA fila de cifras', async ({ page }) => {
  test.setTimeout(240000)
  await entrar(page)
  await page.setViewportSize({ width: ANCHO, height: 1000 })
  await page.goto('/clientes/messina?vista=cobranzas')

  // OJO CON EL `data-testid`: la BARRA dibuja cada solapa con `solapa-<clave>`, así que
  // `solapa-cobranzas` son DOS nodos —la pestaña y el bloque— y el localizador estricto falla. Lo
  // que identifica al bloque es su fila de cifras, que además es lo que este caso vino a contar.
  await expect(page.getByTestId('cifras-cobranzas')).toBeVisible({ timeout: 60000 })
  await expect(page.getByTestId('vista-cuenta-corriente')).toBeVisible()
  await expect(page.getByTestId('vista-esquema-pago').or(page.getByTestId('esquema-vacio'))).toBeVisible()
  // UNA SOLA FILA DE CIFRAS: la de `obra_cuenta` que abría la cuenta corriente se retiró, y con ella
  // el segundo «Vencido» medido con otro reloj.
  await expect(page.getByTestId('cifras-cobranzas')).toHaveCount(1)
  await expect(page.getByTestId('cuenta-de-trabajos')).toHaveCount(0)
  await expect(page.getByTestId('metrica-vencido')).toHaveCount(0)
  await expect(page.getByTestId('metrica-saldo')).toHaveCount(0)
  await page.screenshot({ path: `tests/capturas/cliente-cobranzas-unificada-${ANCHO}.png`, fullPage: false })
})

test('la actividad completa y el portal se abren sin solapa propia', async ({ page }) => {
  test.setTimeout(240000)
  await entrar(page)
  await page.setViewportSize({ width: ANCHO, height: 1000 })

  await page.goto('/clientes/messina?actividad=todo')
  await expect(page.getByTestId('actividad-completa')).toBeVisible({ timeout: 60000 })
  await expect(page.getByTestId('timeline-cliente')).toBeVisible()
  await expect(page.getByTestId('volver-de-actividad')).toBeVisible()

  await page.goto('/clientes/messina?portal=1')
  await expect(page.getByTestId('vista-accesos-portal')).toBeVisible({ timeout: 60000 })
  await expect(page.getByTestId('volver-de-portal')).toBeVisible()
  await page.screenshot({ path: `tests/capturas/cliente-portal-subpantalla-${ANCHO}.png`, fullPage: false })
})

test('a 400px la ficha consolidada no se lleva la página de costado', async ({ page }) => {
  test.setTimeout(240000)
  await entrar(page)
  await page.setViewportSize({ width: 400, height: 900 })
  await page.goto('/clientes/messina')
  await expect(page.getByTestId('obras-del-cliente').first()).toBeVisible({ timeout: 60000 })
  const desborde = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(desborde, `la página se desplaza ${desborde}px de costado`).toBeLessThanOrEqual(1)
  await page.screenshot({ path: 'tests/capturas/cliente-cinco-solapas-400.png', fullPage: false })
})
