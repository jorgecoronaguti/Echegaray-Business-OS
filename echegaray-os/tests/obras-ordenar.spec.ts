import { test, expect, type Page } from '@playwright/test'
import { entrar } from './util/obras-e2e'

// El dueño (19/08/2026): *"necesito filtros dentro de cada columna de la vista de «resumen» y gantt
// porque quiero q las obras se vayan acomodando según como quiero verlas"*. Esto prueba que el orden
// LLEGA A LA PANTALLA, no que la función pura ordena — eso ya lo cubre `ordenObras.test.ts`.

const nombres = async (page: Page) => page.locator('[data-testid="portafolio-tabla"] tbody tr td:first-child').allInnerTexts()

test('la tabla se reordena por la columna que se elige, y la elegida se marca', async ({ page }) => {
  await entrar(page)
  await page.goto('/obras')
  const original = await nombres(page)
  expect(original.length).toBeGreaterThan(1)

  await page.getByTestId('orden-nombre').click()
  await expect(page.getByTestId('orden-nombre')).toHaveAttribute('data-activo', 'asc')
  const porNombre = await nombres(page)
  expect(porNombre).toEqual([...porNombre].sort((a, b) => a.localeCompare(b, 'es-AR')))

  // El segundo clic da vuelta la MISMA columna.
  await page.getByTestId('orden-nombre').click()
  await expect(page.getByTestId('orden-nombre')).toHaveAttribute('data-activo', 'desc')
  expect(await nombres(page)).toEqual([...porNombre].reverse())
})

test('ordenar por costo pone arriba el que más gastó, y no toca la columna comercial', async ({ page }) => {
  await entrar(page)
  await page.goto('/obras?orden=costo&dir=desc')
  await expect(page.getByTestId('orden-costo')).toHaveAttribute('data-activo', 'desc')
  const costos = await page.locator('[data-testid="portafolio-tabla"] tbody tr td:last-child').allInnerTexts()
  const n = (s: string) => Number(s.replace(/[^\d]/g, '') || 0)
  expect(costos.map(n)).toEqual([...costos.map(n)].sort((a, b) => b - a))
})

test('cambiar el orden NO esconde las obras archivadas que se acababan de mostrar', async ({ page }) => {
  await entrar(page)
  await page.goto('/obras?archivadas=1')
  const conArchivadas = (await nombres(page)).length
  await page.getByTestId('orden-etapa').click()
  expect((await nombres(page)).length).toBe(conArchivadas)
})

test('un campo inventado en la URL no rompe la pantalla', async ({ page }) => {
  await entrar(page)
  await page.goto('/obras?orden=sueldo&dir=desc')
  await expect(page.getByTestId('portafolio-tabla')).toBeVisible()
  await expect(page.getByTestId('orden-nombre')).not.toHaveAttribute('data-activo', /.+/)
})

test('el Gantt ordena por lo que muestra y vuelve al cronológico', async ({ page }) => {
  await entrar(page)
  await page.goto('/obras/gantt')
  await expect(page.getByTestId('orden-gantt-cronologico')).toHaveAttribute('data-activo', 'si')
  await page.getByTestId('orden-gantt-avance').click()
  await expect(page.getByTestId('orden-gantt-avance')).toHaveAttribute('data-activo', 'desc')
  await page.getByTestId('orden-gantt-cronologico').click()
  await expect(page.getByTestId('orden-gantt-cronologico')).toHaveAttribute('data-activo', 'si')
})
