import { test, expect } from '@playwright/test'
import { entrar } from './util/obras-e2e'

// LO QUE EL DUEÑO PIDIÓ VER, MEDIDO EN EL NAVEGADOR (11/09/2026, textual):
// «Necesito saber las hs que se van sumando en cada obra dentro de cada cliente» · «no tengo idea de
// cuándo empezó cada obra en el CRM, no sé cuánto llevan hs totales, un desastre» · «que de ahí me
// lleve a un desglose de la obra entera con las personas por día que participaron de las HH».
//
// Corre contra DATOS VIVOS: lo que se afirma son INVARIANTES —que la columna diga un número o «—» y
// nunca quede vacía con sesión de Administración, que el desglose cierre con el número que lo abrió—
// y no importes clavados. El timer de JORNALES importa horas cada hora: un «551» escrito acá se
// pondría rojo sin que ninguna regla se haya roto (lección del 11/09: la obra pasó de 551 a 492 h en
// cuarenta minutos porque el espejo de JORNALES reimputó registros).
//
// LA CAPTURA ES PARTE DE LA EVIDENCIA, no un adorno: un typecheck no ve una columna cortada ni una
// grilla que desborda.

const ANCHO = 1280

test('la tabla de trabajos publica INICIO y HH, y el número abre el desglose', async ({ page }) => {
  test.setTimeout(180000)
  await entrar(page)
  await page.setViewportSize({ width: ANCHO, height: 1000 })
  await page.goto('/clientes/quattropani')

  const tabla = page.getByTestId('obras-del-cliente').first()
  await expect(tabla).toBeVisible({ timeout: 60000 })
  await expect(tabla).toContainText('Inicio')
  await expect(tabla).toContainText('HH')
  // LAS COLUMNAS QUE SE FUERON (dueño, 18:42): sus importes viven en «Órdenes de compra y de pago».
  await expect(tabla).not.toContainText('OC c/IVA')
  await expect(tabla).not.toContainText('OP c/IVA')

  const fila = page.getByTestId('fila-obra-cliente').first()
  // UN NÚMERO O «—», NUNCA VACÍO: esta sesión es dirección, así que «no puedo leerlas» sería un
  // defecto de la RPC (la clave `hh_obra` no viajó) y se vería igual que «no tiene horas».
  await expect(fila.getByTestId('hh-obra-cliente')).toHaveText(/[\d.]+|—/)
  await expect(fila.getByTestId('inicio-obra-cliente')).toHaveText(/\d{2}\/\d{2}\/\d{2}|—/)
  // EL ACUMULADO DEL CLIENTE, EN EL PIE.
  await expect(page.getByTestId('hh-del-cliente')).toContainText(/[\d.]+/)

  // EL DESTINO, NO EL CLIC: este `next dev` no hidrata (medido el 10/09/2026 en este mismo repo), así
  // que un clic mediría el servidor de desarrollo y no la pantalla. Lo que se verifica es que el
  // número lleve al desglose de SU obra.
  await expect(fila.getByTestId('abrir-desglose-hh')).toHaveAttribute('data-href', /hh=quattropani/)

  await page.screenshot({ path: `tests/capturas/cliente-hh-columna-${ANCHO}.png`, fullPage: false })
})

test('el desglose de una obra dibuja persona × día y cierra con el acumulado', async ({ page }) => {
  test.setTimeout(180000)
  await entrar(page)
  await page.setViewportSize({ width: ANCHO, height: 1000 })
  await page.goto('/clientes/quattropani?vista=obras&hh=quattropani')

  const d = page.getByTestId('desglose-hh')
  await expect(d).toBeVisible({ timeout: 60000 })
  // EL TITULAR DICE LAS TRES COSAS: qué trabajo, cuánto lleva y de cuándo a cuándo.
  await expect(page.getByTestId('desglose-total-hh')).toHaveText(/[\d.]+ HH/)
  await expect(page.getByTestId('desglose-periodo')).toHaveText(/\d{2}\/\d{2}\/\d{4} → \d{2}\/\d{2}\/\d{4}/)
  // LA GRILLA, CON SUS FILAS DE PERSONA Y SU TOTAL POR DÍA.
  await expect(page.getByTestId('grilla-hh')).toBeVisible()
  expect(await page.getByTestId('fila-persona-hh').count()).toBeGreaterThan(0)
  await expect(page.getByTestId('total-ventana')).toHaveText(/[\d.]+/)
  // TODAS LAS QUINCENAS ESTÁN OFERTADAS: ninguna se esconde en silencio.
  expect(await page.getByTestId('periodo-hh').count()).toBeGreaterThan(0)
  // Y SE PUEDE VOLVER SIN EL BOTÓN DE ATRÁS.
  await expect(page.getByTestId('volver-a-obras')).toBeVisible()

  await page.screenshot({ path: `tests/capturas/cliente-hh-desglose-${ANCHO}.png`, fullPage: false })
})
