// LA EVIDENCIA DEL EFECTO EN LA PANTALLA — los comprobantes que trajo el importador de Gmail se
// ven en la ficha del proveedor, con su tipo y su descarga.
//
// No prueba una regla: prueba que lo que se escribió en la base y en el bucket LLEGA a la cara que
// mira Administración. Una fila en Postgres no es un documento en la ficha hasta que se ve.
import { test, expect } from '@playwright/test'
import { entrarComo, ATERRIZAJE } from './util/login'

const ADMIN = { email: 'jorge.o.corona+direccion-test-1783513222134@gmail.com', password: 'TestPassword123!' }
// MASS CONSULTORA: dos comprobantes de transferencia traídos del mail el 09/09/2026.
const PROVEEDOR = 'fc804fd6-1528-424e-be9f-47aeb1fdc638'

test('la ficha del proveedor muestra las transferencias que trajo el mail', async ({ page }) => {
  test.setTimeout(180_000) // dev con webpack compila la ruta la primera vez que se la pide
  await page.setViewportSize({ width: 1440, height: 1000 })
  await entrarComo(page, ADMIN.email, ADMIN.password)
  await expect(page).toHaveURL(ATERRIZAJE)
  await page.goto(`/administracion/proveedores?p=${PROVEEDOR}`)
  // El NOMBRE DEL ARCHIVO, no la palabra «Transferencia» suelta: el rótulo podría venir de
  // cualquier parte de la pantalla y el test quedaría diciendo que sí sin haber mirado nada.
  await expect(page.getByText('solicitud-nro-15475208.pdf')).toBeVisible({ timeout: 60_000 })
  await expect(page.getByText('Simple_GISELA_AGOSTINA_D_AMICO_BARTOL_2026-09-09.pdf.pdf')).toBeVisible()
  await expect(page.getByText('Transferencia').first()).toBeVisible()
  await page.screenshot({ path: 'tests/capturas/transferencias-ficha-proveedor.png', fullPage: true })
  // EL TEXTO DEL PANEL, IMPRESO. La captura la mira una persona; esto lo puede leer cualquiera que
  // corra el test, y es lo que hace verificable que el tipo y la descarga están en la pantalla.
  const panel = await page.locator('main').innerText()
  const desde = panel.indexOf('Documentos')
  console.log('── PANEL ──\n' + panel.slice(desde).split('\n').filter((l) => l.trim()).join(' | ').slice(0, 900))
})
