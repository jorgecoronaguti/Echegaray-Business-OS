import { test, expect } from '@playwright/test'
import { entrar } from './util/obras-e2e'

// LOS TRES ESTADOS TIENEN QUE VERSE DISTINTOS — `design/screens/gestion-obras-v5.md` §13.
//
// ═══ QUÉ DEFECTOS ATRAPA ═══
//
// 1. QUE NO EXISTA NINGUNA PANTALLA. La app tenía nueve `loading.tsx` y CERO `error.tsx` y
//    `not-found.tsx`: una obra borrada mostraba el 404 en inglés de Next —«This page could not be
//    found»— sin una sola salida, y un fallo del servidor dejaba la pantalla en blanco.
// 2. QUE EL 404 SE VISTA DE ERROR. «No existe» y «no lo pude leer» son dos hechos distintos, y
//    confundirlos ya mandó a buscar un defecto de permisos dentro del ruteo durante horas.
// 3. QUE LA SALIDA SEA EL INICIO. Desde una obra que no existe se vuelve a la cartera de obras.
//
// Se corre contra el navegador porque es lo único que prueba que Next TOMÓ estos archivos: un
// `not-found.tsx` en la carpeta equivocada compila igual y no se muestra nunca.

test('una obra que no existe muestra el no encontrado del OS, en español y con vuelta a la cartera', async ({ page }) => {
  test.setTimeout(120000)
  await entrar(page)
  await page.goto('/obras/esta-obra-no-existe-en-ninguna-parte-9z9z')

  const cartel = page.getByTestId('estado-no-encontrado')
  await expect(cartel).toBeVisible()
  await expect(cartel).toContainText('No encontramos esa obra')
  // NO es un error: ni cartel de error, ni la palabra en inglés de la pantalla de Next.
  await expect(page.getByTestId('estado-error')).toHaveCount(0)
  await expect(page.locator('body')).not.toContainText('could not be found')
  await expect(page.getByRole('link', { name: 'Cartera de obras' })).toHaveAttribute('href', '/obras')
})

test('una dirección inventada cae en el 404 del OS y no en el de Next', async ({ page }) => {
  test.setTimeout(120000)
  await entrar(page)
  await page.goto('/esta-pantalla-no-existe-9z9z')

  await expect(page.getByTestId('estado-no-encontrado')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Ir al inicio' })).toBeVisible()
  await expect(page.locator('body')).not.toContainText('could not be found')
})

test('un cliente que no existe también es un 404, no una pantalla de error', async ({ page }) => {
  test.setTimeout(120000)
  await entrar(page)
  await page.goto('/clientes/este-cliente-no-existe-9z9z')
  await expect(page.getByTestId('estado-no-encontrado')).toBeVisible()
  await expect(page.getByTestId('estado-error')).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Cartera de clientes' })).toHaveAttribute('href', '/clientes')
})

test('una persona que no existe cae en el 404 con vuelta al legajo', async ({ page }) => {
  test.setTimeout(120000)
  await entrar(page)
  await page.goto('/administracion/personas/00000000-0000-0000-0000-000000000000')
  await expect(page.getByTestId('estado-no-encontrado')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Personas' }).last()).toHaveAttribute('href', '/administracion/personas')
})

test('el vacío de una lista NO se ve como un error: sin cartel rojo y sin Reintentar', async ({ page }) => {
  test.setTimeout(120000)
  await entrar(page)
  // Un buscador que no encuentra nada es el VACÍO del sistema, y tiene que seguir siéndolo: si el
  // día que se cae la base esta pantalla se ve igual, nadie se entera de que se cayó.
  // El filtro de esta lista es LOCAL: se escribe en el campo, no se arma por URL.
  await page.goto('/clientes')
  await page.getByTestId('buscar-cliente').fill('zzzz-no-existe-ningun-cliente-asi')
  await expect(page.getByText('Ningún cliente se llama así.')).toBeVisible()
  await expect(page.getByTestId('estado-error')).toHaveCount(0)
  await expect(page.getByTestId('reintentar')).toHaveCount(0)
})
