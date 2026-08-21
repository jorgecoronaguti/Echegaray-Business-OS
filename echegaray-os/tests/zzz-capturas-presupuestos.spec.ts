import { test } from '@playwright/test'
import { entrar } from './util/obras-e2e'
import { JEFE } from './util/identidades'

// CAPTURAS DE LAS CUATRO PANTALLAS DE PRESUPUESTOS. No es un test: no afirma nada. Existe para
// MIRAR, que es el único control que ve un layout roto — un typecheck no lo ve.
//
// ═══ LO QUE ESTAS CAPTURAS PUEDEN MOSTRAR HOY ═══
//
// `cotizaciones` tiene RLS pero NO tiene GRANT para `authenticated`: la base contesta 403 en la
// tabla y en las dos vistas que la leen. Hasta que se aplique esa línea, lo que un usuario real ve
// en estas cuatro rutas es el cartel de error CON EL MENSAJE DE LA BASE. Eso también hay que
// mirarlo: es la diferencia entre un error que dice qué arreglar y uno que manda a adivinar.
const DIR = process.env.CAPTURAS ?? 'test-results/capturas-presupuestos'

// Un identificador que no corresponde a ninguna fila: alcanza para probar que las tres rutas de
// adentro RENDERIZAN —no quedan en blanco ni tiran 500— aunque hoy la lectura las rechace.
const ID = '00000000-0000-4000-8000-000000000000'
const RUTAS: [string, string][] = [
  ['/presupuestos', '14-cartera'],
  ['/presupuestos?nuevo=1', '14-cartera-alta'],
  [`/presupuestos/${ID}`, '15-edicion'],
  [`/presupuestos/${ID}/partida/${ID}`, '16-analisis'],
  [`/presupuestos/${ID}/convertir`, '13-convertir'],
]

test('capturas de presupuestos', async ({ page }) => {
  test.setTimeout(400000)
  await entrar(page)

  for (const [w, h, sufijo] of [[1536, 1024, '1536'], [2200, 1200, '2200']] as [number, number, string][]) {
    await page.setViewportSize({ width: w, height: h })
    for (const [ruta, nombre] of RUTAS) {
      await page.goto(ruta)
      await page.waitForTimeout(2000)
      await page.screenshot({ path: `${DIR}/${sufijo}-${nombre}.png`, fullPage: true })
    }
  }

  // Si hay algún presupuesto legible, se entra al primero y se recorren las tres pantallas de
  // adentro. Si no lo hay —hoy no lo hay, por el grant— quedan las de la cartera y su error.
  await page.setViewportSize({ width: 1536, height: 1024 })
  await page.goto('/presupuestos')
  await page.waitForTimeout(1500)
  const fila = page.getByTestId('fila-presupuesto').first()
  if (await fila.count()) {
    await fila.getByRole('link').first().click()
    await page.waitForTimeout(2500)
    await page.screenshot({ path: `${DIR}/1536-15-edicion.png`, fullPage: true })
    const url = page.url()
    const partida = page.getByTestId('fila-partida').first()
    if (await partida.count()) {
      const id = await partida.getAttribute('data-partida')
      await page.goto(`${url}?partida=${id}`)
      await page.waitForTimeout(2000)
      await page.screenshot({ path: `${DIR}/1536-15-edicion-panel.png`, fullPage: true })
      await page.goto(`${url}/partida/${id}`)
      await page.waitForTimeout(2000)
      await page.screenshot({ path: `${DIR}/1536-16-analisis.png`, fullPage: true })
    }
    await page.goto(`${url}/convertir`)
    await page.waitForTimeout(2000)
    await page.screenshot({ path: `${DIR}/1536-13-convertir.png`, fullPage: true })
  }

  // EL PORTERO, que es lo único de este módulo que HOY funciona de punta a punta: un jefe de obra
  // no ve precio, y la pantalla lo dice como «sin permiso», no como «sin datos».
  await page.setViewportSize({ width: 1536, height: 1024 })
  await page.goto('/login')
  await page.getByRole('button', { name: /cerrar sesión/i }).count()
  await page.context().clearCookies()
  await page.goto('/login')
  await page.fill('input[name="email"]', JEFE.email)
  await page.fill('input[name="password"]', JEFE.password)
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/(dashboard|flujo-caja|obras)/, { timeout: 60000 })
  await page.goto('/presupuestos')
  await page.waitForTimeout(2000)
  await page.screenshot({ path: `${DIR}/1536-14-sin-permiso.png`, fullPage: true })
  await page.goto(`/presupuestos/${ID}/convertir`)
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${DIR}/1536-13-sin-permiso.png`, fullPage: true })

  // El teléfono: la cartera es lo único de este módulo que se mira desde afuera de la oficina.
  await entrar(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/presupuestos')
  await page.waitForTimeout(2000)
  await page.screenshot({ path: `${DIR}/telefono-14-cartera.png`, fullPage: true })
})
