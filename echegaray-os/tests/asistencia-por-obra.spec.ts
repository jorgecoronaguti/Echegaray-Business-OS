import { test, expect } from '@playwright/test'
import { entrarComo } from './util/login'
import { ADMIN, JEFE } from './util/identidades'

// LA EVIDENCIA DEL EFECTO, EN EL NAVEGADOR Y CON DATOS REALES.
//
// Los módulos puros ya prueban la aritmética. Lo que sólo se puede ver acá es que la pantalla ABRE
// contra la base real, con las obras y las personas que existen — y que lo que se guarda se lee de
// vuelta en la OTRA pantalla, que es la única prueba de que la escritura ocurrió.
//
// Las capturas van a `qa-shots/asistencia-*`: móvil de 390px para la carga en obra, escritorio para
// la semana de Administración.

// La obra con más personal asignado de la base real al 07/09/2026 (9 asignaciones vigentes). Va por
// ID y no por nombre porque el ID es la clave de `obra_canonica` y el nombre se edita.
const OBRA_CON_GENTE = 'pisos-industriales'

test('01 · el jefe carga la asistencia en el teléfono', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await entrarComo(page, JEFE.email, JEFE.password)

  // PRIMERO EL ESTADO «ELEGIR OBRA»: con varias obras a la vista es lo que ve el jefe al entrar, y
  // que la lista salga vacía sería indistinguible de que no tenga ninguna asignada.
  await page.goto('/campo/asistencia')
  await expect(page.getByTestId('elegir-obra').first()).toBeVisible()
  await page.screenshot({ path: 'qa-shots/asistencia-01-campo-390.png', fullPage: true })

  await page.goto(`/campo/asistencia?obra=${OBRA_CON_GENTE}`)
  await expect(page.getByTestId('form-asistencia')).toBeVisible()
  await expect(page.getByTestId('fila-asistencia').first()).toBeVisible()
  await page.screenshot({ path: 'qa-shots/asistencia-01b-obra-390.png', fullPage: true })

  // EL PIE CUENTA LO QUE LA PANTALLA MUESTRA, no lo que la base tiene guardado.
  await expect(page.getByTestId('pie-jornada')).toBeVisible()
})

test('02 · la semana por obra abre en Administración → Personal', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await entrarComo(page, ADMIN.email, ADMIN.password)

  await page.goto('/administracion/personas?vista=asistencia')
  await page.waitForLoadState('networkidle')
  await expect(page.getByTestId('bloque-asistencia')).toBeVisible()
  await page.screenshot({ path: 'qa-shots/asistencia-02-semana-1440.png', fullPage: true })

  // LA SOLAPA VUELVE AL PLANTEL. Sin esto, «Asistencia» sería una pantalla sin salida.
  await page.getByRole('link', { name: 'Plantel' }).click()
  await page.waitForLoadState('networkidle')
  await expect(page.getByTestId('vistas-personal')).toBeVisible()
})

// ═══ ESTE TEST ESCRIBE HORAS REALES EN LA BASE REAL, Y POR ESO NO CORRE SOLO ═══
//
// Corrido el 07/09/2026 dejó NUEVE registros de PISOS INDUSTRIALES —77,4 HH que nadie declaró
// haber trabajado— en `registros_hh`. Se borraron a mano y quedó verificado que el día volvió a
// cero. Un test que fabrica horas de obra cada vez que alguien corre la suite es exactamente lo
// que la Regla de Oro 1 prohíbe: esas horas viajan al costo de mano de obra de una obra viva.
//
// Se habilita a propósito, con testigo y sabiendo qué se va a limpiar después:
//   E2E_ESCRIBE_ASISTENCIA=1 npx playwright test tests/asistencia-por-obra.spec.ts
//
// La evidencia que produjo esa corrida —el 7 escrito en el teléfono y leído de vuelta en la grilla
// de Administración— está en `qa-shots/asistencia-03-guardado-390.png` y `-04-leido-1440.png`.
test('LO QUE SE GUARDA EN CAMPO SE LEE EN ADMINISTRACIÓN', async ({ page }) => {
  test.skip(process.env.E2E_ESCRIBE_ASISTENCIA !== '1',
    'Escribe HH reales en la base real. Se habilita con E2E_ESCRIBE_ASISTENCIA=1 y se limpia después.')
  // El único cierre que vale: la escritura probada en su DESTINO, y en la otra pantalla. Que el
  // formulario responda que sí no prueba nada.
  await page.setViewportSize({ width: 390, height: 844 })
  await entrarComo(page, ADMIN.email, ADMIN.password)

  await page.goto(`/campo/asistencia?obra=${OBRA_CON_GENTE}`)
  await expect(page.getByTestId('form-asistencia')).toBeVisible()

  const casilla = page.getByTestId('horas').first()
  await casilla.fill('7')
  await page.getByTestId('guardar-dia').click()
  await expect(page.getByTestId('acuse-jornada')).toBeVisible({ timeout: 20000 })
  await page.screenshot({ path: 'qa-shots/asistencia-03-guardado-390.png', fullPage: true })

  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/administracion/personas?vista=asistencia')
  await page.waitForLoadState('networkidle')
  await expect(page.getByTestId('grilla-asistencia')).toBeVisible()
  await expect(page.locator('[data-testid="celda-hora"][value="7"]').first()).toBeVisible()
  await page.screenshot({ path: 'qa-shots/asistencia-04-leido-1440.png', fullPage: true })
})

test('04 · REABRIR EL DÍA MUESTRA LO YA CARGADO, no la jornada de nuevo', async ({ page }) => {
  test.skip(process.env.E2E_ESCRIBE_ASISTENCIA !== '1',
    'Escribe HH reales en la base real. Se habilita con E2E_ESCRIBE_ASISTENCIA=1 y se limpia después.')
  // El defecto que atrapa: que la casilla vuelva a traer la jornada completa al reabrir. El jefe
  // corrige a González a 5, sale, vuelve, guarda sin tocar nada — y le devuelve las 8,8 que
  // justamente había corregido. La excepción se pierde sin que nadie vea un error.
  await page.setViewportSize({ width: 390, height: 844 })
  await entrarComo(page, ADMIN.email, ADMIN.password)
  await page.goto(`/campo/asistencia?obra=${OBRA_CON_GENTE}`)
  await expect(page.getByTestId('form-asistencia')).toBeVisible()

  await page.getByTestId('horas').first().fill('5')
  await page.getByTestId('guardar-dia').click()
  await expect(page.getByTestId('acuse-jornada')).toBeVisible({ timeout: 20000 })

  await page.reload()
  await expect(page.getByTestId('form-asistencia')).toBeVisible()
  await expect(page.getByTestId('horas').first()).toHaveValue('5')
  await page.screenshot({ path: 'qa-shots/asistencia-05-reabierto-390.png', fullPage: true })
})

test('05 · el panel de corrección de Administración', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await entrarComo(page, ADMIN.email, ADMIN.password)
  await page.goto('/administracion/personas?vista=asistencia')
  await expect(page.getByTestId('grilla-asistencia')).toBeVisible()

  const abrir = page.getByTestId('abrir-correccion').first()
  if (await abrir.count() === 0) test.skip(true, 'La semana no tiene ninguna fila que corregir.')
  await abrir.click()
  await expect(page.getByTestId('panel-correccion')).toBeVisible()
  // LAS TRES PALANCAS QUE PIDIÓ EL DUEÑO, A LA VISTA: el día, la obra y qué pasó.
  await expect(page.getByTestId('correccion-dia')).toBeVisible()
  await expect(page.getByTestId('correccion-obra')).toBeVisible()
  await expect(page.getByTestId('correccion-estado')).toBeVisible()
  await page.screenshot({ path: 'qa-shots/asistencia-06-correccion-1440.png', fullPage: true })
})

test('06 · el registro cronológico de la persona, con quién lo cargó', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await entrarComo(page, ADMIN.email, ADMIN.password)
  await page.goto('/administracion/personas')
  await expect(page.getByTestId('vistas-personal')).toBeVisible()

  // POR EL href Y NO POR UN CLIC A CIEGAS: «En obra ahora» y «Cuadrillas» también cuelgan de
  // /administracion/personas/, y el primero de la lista es uno de ellos — no una persona.
  const href = await page.locator('a[href^="/administracion/personas/"]')
    .evaluateAll((as) => (as as HTMLAnchorElement[])
      .map((a) => a.getAttribute('href') ?? '')
      .find((h) => /\/administracion\/personas\/[0-9a-f-]{36}$/.test(h)) ?? null)
  if (!href) test.skip(true, 'El plantel no tiene ninguna persona con ficha.')
  await page.goto(`${href}?v=horas`)
  await expect(page.getByTestId('bloque-horas')).toBeVisible()
  await page.screenshot({ path: 'qa-shots/asistencia-07-cronologia-1440.png', fullPage: true })
})
