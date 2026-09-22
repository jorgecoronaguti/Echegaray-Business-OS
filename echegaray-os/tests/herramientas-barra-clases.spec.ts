import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { entrar, EMAIL, PASSWORD } from './util/obras-e2e'

// LA BARRA DE CLASES NO DESAPARECE (dueño, 22/09/2026: «al hacer en alguna de las secciones las otras
// desaparecen, no quedan marcadas con la posibilidad de acceder a las otras»).
//
// La clase es un filtro, no otra pantalla: se salta de Maquinarias a Rodados y de ahí a Herramientas sin
// volver atrás, con la puesta marcada y las cuentas a la vista. Las cuentas se comparan contra la BASE,
// no contra la pantalla: un control no se valida con la información que produce.

const CAPTURAS = 'test-results/herramientas-barra-clases'

test('la barra de clases sobrevive a las tres vistas y las cuentas son las de la base', async ({ page }) => {
  test.setTimeout(180000)
  const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  await s.auth.signInWithPassword({ email: EMAIL, password: PASSWORD })
  const vivos = (await s.from('activo').select('clase, estado').neq('estado', 'baja').limit(10000)).data ?? []
  const porClase = (c: string) => vivos.filter((a) => a.clase === c).length

  await page.setViewportSize({ width: 1440, height: 950 })
  await entrar(page)
  await page.goto('/herramientas/inventario')
  await page.waitForLoadState('networkidle')

  const barra = page.getByTestId('barra-clases')
  await expect(barra).toBeVisible()
  await expect(page.getByTestId('clase-herramienta')).toContainText(String(porClase('herramienta')))
  await expect(page.getByTestId('clase-equipo')).toContainText(String(porClase('equipo')))
  await expect(page.getByTestId('clase-rodado')).toContainText(String(porClase('rodado')))
  await expect(page.getByTestId('clase-todo')).toContainText(String(vivos.length))

  // Maquinarias: la vista propia, y la barra sigue ahí con las otras clicables.
  await page.getByTestId('clase-equipo').click()
  await expect(page.getByTestId('maquinarias')).toBeVisible()
  await expect(barra).toBeVisible()
  await expect(page.getByTestId('clase-equipo')).toHaveAttribute('aria-current', 'page')
  await page.screenshot({ path: `${CAPTURAS}-1-maquinarias.png`, fullPage: false })

  // De Maquinarias a Rodados SIN volver atrás.
  await page.getByTestId('clase-rodado').click()
  await expect(page.getByTestId('rodados')).toBeVisible()
  await expect(barra).toBeVisible()
  await expect(page.getByTestId('clase-rodado')).toHaveAttribute('aria-current', 'page')
  await expect(page).toHaveURL(/clase=rodado/)
  await page.screenshot({ path: `${CAPTURAS}-2-rodados.png`, fullPage: false })

  // Y de Rodados de vuelta a Herramientas, siempre desde la misma barra.
  await page.getByTestId('clase-herramienta').click()
  await expect(page.getByTestId('inventario')).toBeVisible()
  await expect(barra).toBeVisible()
  await expect(page.getByTestId('clase-herramienta')).toHaveAttribute('aria-current', 'page')

  // Al bajar, las dos barras quedan fijas y la cabecera del inventario cae justo debajo de la de clases.
  await page.mouse.move(400, 600)
  await page.mouse.wheel(0, 2500)
  await page.waitForTimeout(400)
  const b = (await barra.boundingBox())!
  const cab = (await page.getByTestId('cabecera-inventario').boundingBox())!
  expect(b.y).toBeLessThan(120)
  expect(cab.y).toBeGreaterThanOrEqual(b.y + b.height - 1)
  expect(cab.y).toBeLessThan(b.y + b.height + 3)
  await page.screenshot({ path: `${CAPTURAS}-3-fijas.png`, fullPage: false })
})
