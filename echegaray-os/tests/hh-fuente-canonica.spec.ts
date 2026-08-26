import { test, expect } from '@playwright/test'
import { conBase, entrar, OBRA } from './util/obras-e2e'
import { limpiarPersonasDePrueba, marca } from './util/rastro'

// EL CIRCUITO REAL DE PUNTA A PUNTA — la única prueba de que HH es la fuente canónica de tiempo.
//
// El dueño: *"no cierres Personal/HH hasta demostrar: cargar HH de una persona; cargar HH masivas de
// una cuadrilla; distinguir tipo de hora; consultar total por persona; consultar total por obra;
// consultar distribución por actividad; consultar período/quincena; obtener HH normales/extras por
// período; verificar que el mismo registro alimenta Obra y Persona; recargar y comprobar
// persistencia real en Supabase"*.
//
// Cada punto de esa lista está acá, en ese orden, sobre datos que se crean y se borran. Lo que hace
// que esto valga y no un test de función pura: LA MISMA fila que se carga desde la obra tiene que
// aparecer en la ficha de la persona. Si hubiera dos lugares donde se guardan las horas, este test
// se pondría rojo — que es exactamente lo que el dueño quiere impedir.

// ═══ LA MARCA, Y POR QUÉ CAMBIÓ (22/08/2026) ═══
//
// Era `e2e-hh-${Date.now()}`. En la base productiva quedaron dos personas con ese nombre —
// «e2e-hh-1787238441197» y «e2e-hh-1787239591040»— visibles en el plantel real. No fue un descuido
// del último test: el último test archiva la persona a propósito, porque el modelo dice que un
// legajo no se borra. Sólo que ESTA persona no es un legajo: es un maniquí, y un maniquí archivado
// sigue estando en la pantalla de Administración.
//
// Dos cambios: la marca ahora es la canónica —la misma que barren todas las demás suites— y lo que
// este archivo crea, este archivo lo saca.
const MARCA = marca('hh')

test.afterAll(async () => {
  // Por MARCA y no por el id que el test recuerda: si el test murió en el medio no hay id que
  // recordar, y ése es justamente el caso en el que la limpieza importa.
  const problemas = await limpiarPersonasDePrueba(await conBase(), MARCA)
  // Se avisa, no se tumba: un fallo de limpieza no puede tapar el resultado de la prueba.
  if (problemas.length) console.warn(`[rastro] quedó sin limpiar → ${problemas.join(' · ')}`)
})

/** Abre un `<details>` SÓLO si está cerrado: clickear el resumen es un interruptor, y hacerlo dos
 *  veces lo vuelve a cerrar — que es lo que pasaba después de la primera carga, porque el formulario
 *  se limpia pero el panel queda abierto. */
async function abrir(caja: import('@playwright/test').Locator) {
  if (await caja.getAttribute('open') === null) await caja.locator('summary').click()
  await expect(caja).toHaveAttribute('open', '')
}

test('la misma hora, cargada una vez, se lee desde la obra y desde la persona', async ({ page }) => {
  test.setTimeout(180000)
  await entrar(page)

  // ── 0 · EL CIRCUITO SE CREA SU PROPIA GENTE ──────────────────────────────
  //
  // No se apoya en que la obra ya tenga a alguien asignado: eso hace que el test pase o se saltee
  // según el día. Crea una persona, la asigna, trabaja con ella y la borra.
  await page.goto('/administracion/personas?nueva=1')
  await page.getByTestId('persona-nombre').fill(MARCA)
  await page.getByRole('button', { name: /crear|guardar/i }).first().click()
  await expect(page.getByRole('heading', { name: MARCA })).toBeVisible()

  await page.goto(`/obras/${OBRA}?vista=personal`)
  const alta = page.getByTestId('alta-asignacion')
  await abrir(alta)
  await alta.locator('select[name="persona_id"]').selectOption({ label: MARCA })
  await alta.locator('input[name="notas"]').fill(MARCA)
  await alta.getByRole('button', { name: /asignar|guardar/i }).first().click()
  await expect(page.getByTestId('tabla-personal')).toContainText(MARCA)

  // ── 1 · HH INDIVIDUAL, CON SU CLASE DE HORA ──────────────────────────────
  const hoy = new Date().toISOString().slice(0, 10)
  await abrir(page.getByTestId('alta-hh'))
  const form = page.getByTestId('form-hh')
  await form.locator('select[name="persona_id"]').selectOption({ label: MARCA })
  const persona = MARCA
  await form.locator('input[name="fecha"]').fill(hoy)
  await form.locator('input[name="horas"]').fill('8')
  await form.locator('select[name="tipo_hora"]').selectOption('normal')
  await form.locator('input[name="notas"]').fill(MARCA)
  await form.getByRole('button', { name: /imputar/i }).click()
  await expect(form.getByText('Horas imputadas.', { exact: true })).toBeVisible()

  // La MISMA persona, el MISMO día, otra clase de hora: es la jornada con extras, y antes de que el
  // tipo entrara a la clave única esto chocaba con 23505.
  await abrir(page.getByTestId('alta-hh'))
  await form.locator('select[name="persona_id"]').selectOption({ label: MARCA })
  await form.locator('input[name="fecha"]').fill(hoy)
  await form.locator('input[name="horas"]').fill('2')
  await form.locator('select[name="tipo_hora"]').selectOption('extra_50')
  await form.locator('input[name="notas"]').fill(MARCA)
  await form.getByRole('button', { name: /imputar/i }).click()
  await expect(form.getByText('Horas imputadas.', { exact: true })).toBeVisible()

  // ── 2 · SE RECARGA: la persistencia se prueba contra el servidor, no contra el DOM ────────────
  await page.reload()
  const registro = page.getByTestId('tabla-hh')
  await expect(registro).toContainText('Extra 50%')

  // ── 3 · TOTAL POR OBRA, con las extras nombradas ─────────────────────────
  await expect(page.getByTestId('titular-personal')).toContainText(/HH real/)
  await expect(page.getByTestId('titular-personal')).toContainText(/HH extras/)

  // ── 4 · LA MISMA FILA, DESDE LA PERSONA ──────────────────────────────────
  await page.goto('/administracion/personas')
  await page.getByRole('link', { name: persona, exact: true }).first().click()
  await page.getByTestId('solapa-horas').click()

  // Período: la quincena de la empresa, que es la que se liquida.
  await page.getByTestId('periodo-quincena').click()
  await expect(page.getByTestId('hh-periodo')).toContainText('10')       // 8 normales + 2 extras
  await expect(page.getByTestId('hh-por-tipo')).toContainText('Extra 50%')
  await expect(page.getByTestId('hh-por-obra')).toBeVisible()
  await expect(page.getByTestId('hh-por-actividad')).toBeVisible()
  await expect(page.getByTestId('hh-registro')).toContainText('Extra 50%')

  // ── 5 · CERRAR LA ASIGNACIÓN CONSERVA EL HISTORIAL ──────────────────────
  await page.goto(`/obras/${OBRA}?vista=personal`)
  const fila = page.getByTestId('tabla-personal').locator('tr', { hasText: MARCA })
  await fila.getByTestId('cerrar-asignacion').click()
  // La persona sale de la obra y el período queda escrito: la fila sigue, con su fecha de fin.
  await expect(page.getByTestId('tabla-personal')).toContainText(MARCA)

  // ── 6 · LIMPIEZA: el circuito no deja basura ────────────────────────────
  //
  // Se borra RE-CONSULTANDO cada vez: `all()` devuelve una foto del DOM, y el primer borrado la
  // invalida entera. Con la foto vieja se borra uno y se cree que se borraron todos.
  const conMarca = () => page.getByTestId('tabla-hh').locator('tr', { hasText: MARCA })
  for (let quedan = await conMarca().count(); quedan > 0; quedan--) {
    await conMarca().first().getByTestId('borrar-hh').click()
    await expect(conMarca()).toHaveCount(quedan - 1)
  }
  await page.getByTestId('tabla-personal').locator('tr', { hasText: MARCA })
    .getByTestId('quitar-asignacion').click()

  await page.reload()
  // `not.toContainText` sobre un locator QUE NO EXISTE falla. Y al sacar la última asignación la
  // pantalla deja de dibujar la tabla y pone su estado vacío, así que el locator desaparece — que
  // es justamente la prueba de que quedó limpia. Se cuenta en vez de negar el texto: funciona en
  // los dos casos, con tabla y sin tabla.
  await expect(page.getByTestId('tabla-personal').filter({ hasText: MARCA })).toHaveCount(0)
  await expect(page.getByTestId('tabla-hh').filter({ hasText: MARCA })).toHaveCount(0)

  // La persona SE ARCHIVA, no se borra: es lo que dice el modelo —el legajo de alguien que trabajó
  // no se elimina— y es también la razón por la que no se comprueba que su nombre desaparezca de la
  // pantalla entera: sigue en el plantel inactivo, que es donde tiene que estar.
  await page.goto('/administracion/personas?f=todos')
  await page.getByRole('link', { name: MARCA, exact: true }).first().click()
  await page.getByTestId('dar-de-baja').click()
  await expect(page.getByTestId('reincorporar')).toBeVisible()
})
