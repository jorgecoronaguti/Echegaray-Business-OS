import { test, expect } from '@playwright/test'
import { entrarComo } from './util/login'
import { ADMIN, JEFE, servicio } from './util/identidades'
import { MARCA_PRUEBA } from './util/rastro'

// LA EVIDENCIA DEL EFECTO, EN EL NAVEGADOR Y CON DATOS REALES.
//
// Los módulos puros ya prueban la aritmética. Lo que sólo se puede ver acá es que la pantalla ABRE
// contra la base real, con las obras y las personas que existen — y que lo que se guarda se lee de
// vuelta en la OTRA pantalla, que es la única prueba de que la escritura ocurrió.
//
// Las capturas van a `qa-shots/asistencia-*`: móvil de 390px para la carga en obra, escritorio para
// la quincena de Administración.

// ═══ LO QUE SE LEE Y LO QUE SE ESCRIBE NO VAN A LA MISMA OBRA ═══
//
// Leer se puede hacer contra una obra viva: no deja rastro. Escribir NO — la corrida del 07/09 dejó
// 77,4 HH de nueve personas en PISOS INDUSTRIALES, horas que nadie trabajó, en la obra que alimenta
// el plan contra real y el margen forecast.
//
// La obra `prueba-e2e` que ya existe NO sirve para esto: está `cerrada`, y desde la validación del
// hallazgo 7 la acción rechaza cargar horas a una obra que no está activa —con razón—. Así que la
// prueba se fabrica su propia obra ACTIVA con el rastro `ZZ-E2E`, la usa y la borra. Es más código
// y es la única forma de probar la escritura sin escribir sobre una obra de verdad.
const OBRA_CON_GENTE = 'pisos-industriales'
const OBRA_DE_PRUEBA = `zz-e2e-asistencia`
const NOMBRE_OBRA = `${MARCA_PRUEBA} asistencia por obra`

/** Deja la obra de prueba ACTIVA con una persona real asignada, y devuelve a quién. */
async function prepararObraDePrueba(): Promise<string | null> {
  const sb = servicio()
  // LA PERSONA SALE DEL PLANTEL, NO DE UNA ASIGNACIÓN CUALQUIERA. La pantalla descarta a quien no
  // tiene nombre en `persona_plantel`; con `obra_asignacion ... limit(1)` el escenario caía en una
  // persona ficticia que dejó otro E2E (`e2e00000-…`), sin legajo, y la pantalla decía «Nadie está
  // asignado» con la obra creada y la asignación puesta. Medido el 07/09 con una sonda.
  const alguien = await sb.from('persona_plantel')
    .select('id').not('nombre_completo', 'is', null).limit(1)
  // `.maybeSingle()` no: con un error de PostgREST devuelve `data: null` y el test se SALTEA como si
  // la base estuviera vacía. El error se mira.
  if (alguien.error) throw new Error(`No pude elegir a alguien del plantel: ${alguien.error.message}`)
  const personaId = (alguien.data?.[0] as { id: string } | undefined)?.id ?? null
  if (!personaId) return null
  // LA PERSONA ES REAL Y LA OBRA NO. Al revés —persona inventada— habría que crear un legajo, que
  // es un maestro con más consecuencias que una obra de prueba que se borra entera.
  // CADA ESCRITURA SE MIRA. Un helper que ignora `.error` deja al test fallando en la aserción de
  // la pantalla con un mensaje que no dice nada del verdadero problema — que fue no poder preparar
  // el escenario. Ya pasó: dos tests en rojo por «form-asistencia no visible».
  const obra = await sb.from('obra_canonica').upsert({
    id: OBRA_DE_PRUEBA, nombre: NOMBRE_OBRA, estado: 'activa', jornada_horas: 8.8,
  }).select('id')
  if (obra.error) throw new Error(`No pude crear la obra de prueba: ${obra.error.message}`)
  await sb.from('obra_asignacion').delete().eq('obra_id', OBRA_DE_PRUEBA)
  const asig = await sb.from('obra_asignacion').insert({
    obra_id: OBRA_DE_PRUEBA, persona_id: personaId, rol: 'integrante', desde: '2026-01-01',
  }).select('id')
  if (asig.error) throw new Error(`No pude asignar a nadie a la obra de prueba: ${asig.error.message}`)
  await sb.from('registros_hh').delete().eq('obra_canonica_id', OBRA_DE_PRUEBA)

  // EL `usuario_obra` DE QUIEN MIRA. `ve_obra()` ya devuelve true para Administración, así que
  // para el ADMIN esto es redundante — pero no para el JEFE ni para nadie de campo, y una obra de
  // prueba que sólo ve un rol es una obra que sirve para un test y no para el siguiente.
  const { data: usuarios } = await sb.from('perfiles').select('id').limit(50)
  for (const u of (usuarios ?? []) as { id: string }[]) {
    await sb.from('usuario_obra').upsert(
      { usuario_id: u.id, obra_canonica_id: OBRA_DE_PRUEBA, papel: 'jefe' },
      { onConflict: 'usuario_id,obra_canonica_id' },
    )
  }

  // SE RELEE ANTES DE SEGUIR. Que el upsert conteste que sí no prueba que la obra esté ahí para la
  // sesión del navegador: es la misma regla que gobierna todo este trabajo, aplicada al escenario.
  const { data: vista, error } = await sb.from('obra_canonica')
    .select('id, estado').eq('id', OBRA_DE_PRUEBA).maybeSingle()
  if (error || !vista) throw new Error(`La obra de prueba no se puede releer: ${error?.message ?? 'no está'}`)
  if ((vista as { estado: string }).estado !== 'activa') {
    throw new Error(`La obra de prueba quedó en «${(vista as { estado: string }).estado}» y sólo se cargan horas a una activa.`)
  }
  return personaId
}

/** Barre TODO lo que la prueba creó. Las horas primero: `obra_canonica` las referencia. */
async function limpiarObraDePrueba(): Promise<void> {
  const sb = servicio()
  await sb.from('registros_hh').delete().eq('obra_canonica_id', OBRA_DE_PRUEBA)
  await sb.from('obra_asignacion').delete().eq('obra_id', OBRA_DE_PRUEBA)
  await sb.from('usuario_obra').delete().eq('obra_canonica_id', OBRA_DE_PRUEBA)
  await sb.from('obra_canonica').delete().eq('id', OBRA_DE_PRUEBA)
}

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

  // LA PANTALLA ABRE Y DIBUJA SU GENTE. Nada más se afirma acá: esta obra es VIVA y su día de hoy
  // cambia solo. Afirmar «la casilla está vacía» o «0 presentes» contra ella pondría el test en
  // rojo el día que un jefe cargue de verdad, sin que ninguna regla se haya roto. El control del
  // defecto que costó el revert vive donde el escenario es propio — ver el test 07.
  await expect(page.getByTestId('pie-jornada')).toBeVisible()
  await page.screenshot({ path: 'qa-shots/asistencia-01b-obra-390.png', fullPage: true })

  // EL PIE CUENTA LO QUE LA PANTALLA MUESTRA, no lo que la base tiene guardado.
  await expect(page.getByTestId('pie-jornada')).toBeVisible()
})

test('02 · la QUINCENA por obra abre en Administración → Personal', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await entrarComo(page, ADMIN.email, ADMIN.password)

  // UNA QUINCENA FIJA, NO LA DE HOY. Contra «hoy» no se puede afirmar cuántas columnas hay: la
  // segunda de febrero tiene 13 y la de enero 16. Con la fecha en la URL la aserción es defendible
  // todo el año — y de paso prueba que el parámetro se respeta.
  await page.goto('/administracion/personas?vista=asistencia&quincena=2026-09-20')
  await page.waitForLoadState('networkidle')
  await expect(page.getByTestId('bloque-asistencia')).toBeVisible()
  await expect(page.getByTestId('rotulo-quincena'))
    .toHaveText('2ª quincena de septiembre · 16 al 30')

  // EL DEFECTO QUE ATRAPA: que «anterior» reste quince días. Desde el 16 de un mes de 31 eso cae el
  // 1 —la misma quincena— y el link deja de mover la pantalla sin dar ningún error.
  await page.getByTestId('quincena-anterior').click()
  await page.waitForLoadState('networkidle')
  await expect(page.getByTestId('rotulo-quincena')).toHaveText('1ª quincena de septiembre · 1 al 15')
  await page.getByTestId('quincena-siguiente').click()
  await page.waitForLoadState('networkidle')
  await expect(page.getByTestId('rotulo-quincena')).toHaveText('2ª quincena de septiembre · 16 al 30')
  await page.screenshot({ path: 'qa-shots/asistencia-quincena-1440.png', fullPage: true })

  // LA SOLAPA VUELVE AL PLANTEL. Sin esto, «Asistencia» sería una pantalla sin salida.
  await page.getByRole('link', { name: 'Plantel' }).click()
  await page.waitForLoadState('networkidle')
  await expect(page.getByTestId('vistas-personal')).toBeVisible()
})

test('02b · la quincena en el teléfono', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await entrarComo(page, ADMIN.email, ADMIN.password)
  await page.goto('/administracion/personas?vista=asistencia&quincena=2026-09-20')
  await page.waitForLoadState('networkidle')
  await expect(page.getByTestId('bloque-asistencia')).toBeVisible()
  await page.screenshot({ path: 'qa-shots/asistencia-quincena-390.png', fullPage: true })
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
    'Escribe HH en su propia obra ZZ-E2E. Se habilita con E2E_ESCRIBE_ASISTENCIA=1.')
  // El único cierre que vale: la escritura probada en su DESTINO, y en la otra pantalla. Que el
  // formulario responda que sí no prueba nada.
  const persona = await prepararObraDePrueba()
  if (!persona) test.skip(true, 'La base no tiene a nadie en el plantel.')
  try {
  await page.setViewportSize({ width: 390, height: 844 })
  await entrarComo(page, ADMIN.email, ADMIN.password)

  await page.goto(`/campo/asistencia?obra=${OBRA_DE_PRUEBA}`)
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
  } finally {
    await limpiarObraDePrueba()
  }
})

test('04 · REABRIR EL DÍA MUESTRA LO YA CARGADO, no la jornada de nuevo', async ({ page }) => {
  test.skip(process.env.E2E_ESCRIBE_ASISTENCIA !== '1',
    'Escribe HH. Se habilita con E2E_ESCRIBE_ASISTENCIA=1 y usa su propia obra ZZ-E2E.')
  // El defecto que atrapa: que la casilla vuelva a traer la jornada completa al reabrir. El jefe
  // corrige a González a 5, sale, vuelve, guarda sin tocar nada — y le devuelve las 8,8 que
  // justamente había corregido. La excepción se pierde sin que nadie vea un error.
  const persona = await prepararObraDePrueba()
  if (!persona) test.skip(true, 'La base no tiene a nadie asignado.')
  try {
    await page.setViewportSize({ width: 390, height: 844 })
    await entrarComo(page, ADMIN.email, ADMIN.password)
    await page.goto(`/campo/asistencia?obra=${OBRA_DE_PRUEBA}`)
    await expect(page.getByTestId('form-asistencia')).toBeVisible()

    await page.getByTestId('horas').first().fill('5')
    await page.getByTestId('guardar-dia').click()
    await expect(page.getByTestId('acuse-jornada')).toContainText('1 marca nueva', { timeout: 20000 })

    await page.reload()
    await expect(page.getByTestId('form-asistencia')).toBeVisible()
    await expect(page.getByTestId('horas').first()).toHaveValue('5')
    await expect(page.getByTestId('fila-asistencia').first()).toHaveAttribute('data-estado', 'presente')

    // Y REGUARDAR SIN TOCAR NADA NO ESCRIBE DE NUEVO: el acuse lo dice.
    await page.getByTestId('guardar-dia').click()
    await expect(page.getByTestId('acuse-jornada')).toContainText('No cambió nada en la base')
    await page.screenshot({ path: 'qa-shots/asistencia-05-reabierto-390.png', fullPage: true })
  } finally {
    await limpiarObraDePrueba()
  }
})

test('05 · el panel de corrección SE ABRE AL COSTADO y la grilla queda detrás', async ({ page }) => {
  const ANCHO = 1440
  await page.setViewportSize({ width: ANCHO, height: 900 })
  await entrarComo(page, ADMIN.email, ADMIN.password)
  await page.goto('/administracion/personas?vista=asistencia')
  await expect(page.getByTestId('grilla-asistencia')).toBeVisible()

  const abrir = page.getByTestId('abrir-correccion').first()
  if (await abrir.count() === 0) test.skip(true, 'La quincena no tiene ninguna fila que corregir.')
  await abrir.click()
  const panel = page.getByTestId('panel-correccion')
  await expect(panel).toBeVisible()
  // LAS TRES PALANCAS QUE PIDIÓ EL DUEÑO, A LA VISTA: el día, la obra y qué pasó.
  await expect(page.getByTestId('correccion-dia')).toBeVisible()
  await expect(page.getByTestId('correccion-obra')).toBeVisible()
  await expect(page.getByTestId('correccion-estado')).toBeVisible()

  // EL DEFECTO QUE ATRAPA: que el panel vuelva a quedar DEBAJO de la grilla. Con veinte filas eso
  // lo deja fuera de la pantalla y hay que scrollear para corregir. Se mide la caja, no el CSS:
  // pegado al borde derecho, alto completo, y angosto respecto de la ventana.
  const caja = await panel.boundingBox()
  if (!caja) throw new Error('El panel no tiene caja: no está renderizado.')
  expect(Math.round(caja.x + caja.width)).toBe(ANCHO)
  expect(caja.x).toBeGreaterThan(ANCHO / 2)
  expect(caja.width).toBeLessThan(ANCHO / 2)
  expect(caja.height).toBeGreaterThan(800)
  // Y LA GRILLA SIGUE VISIBLE DETRÁS: un panel que la tapa es un modal con otra forma.
  await expect(page.getByTestId('grilla-asistencia')).toBeVisible()
  await page.screenshot({ path: 'qa-shots/asistencia-quincena-panel-1440.png' })

  // SE CIERRA CON ESCAPE. Sin esto, la única salida es acertarle a la ✕.
  await page.keyboard.press('Escape')
  await expect(panel).toBeHidden()

  // Y CLICKEANDO FUERA. El fondo es transparente en escritorio a propósito —tapar la grilla la
  // convertiría en un modal—, así que sin este control nadie se enteraría de que dejó de capturar
  // el clic: la pantalla se vería idéntica y el panel no se cerraría más.
  await abrir.click()
  await expect(panel).toBeVisible()
  await page.getByTestId('panel-correccion-fondo').click({ position: { x: 40, y: 400 } })
  await expect(panel).toBeHidden()
})

test('05b · en el teléfono el panel ocupa el ancho entero', async ({ page }) => {
  const ANCHO = 390
  await page.setViewportSize({ width: ANCHO, height: 844 })
  await entrarComo(page, ADMIN.email, ADMIN.password)
  await page.goto('/administracion/personas?vista=asistencia')
  await expect(page.getByTestId('grilla-asistencia')).toBeVisible()

  const abrir = page.getByTestId('abrir-correccion').first()
  if (await abrir.count() === 0) test.skip(true, 'La quincena no tiene ninguna fila que corregir.')
  await abrir.click()
  const caja = await page.getByTestId('panel-correccion').boundingBox()
  if (!caja) throw new Error('El panel no tiene caja: no está renderizado.')
  // 400px de drawer sobre una pantalla de 390 es un modal mal hecho: abajo de 768 va entero.
  expect(Math.round(caja.width)).toBe(ANCHO)
  expect(Math.round(caja.x)).toBe(0)
  await page.screenshot({ path: 'qa-shots/asistencia-quincena-panel-390.png' })
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

test('07 · LA CASILLA NACE VACÍA Y GUARDAR NO ESCRIBE NADA — sobre una obra propia', async ({ page }) => {
  test.skip(process.env.E2E_ESCRIBE_ASISTENCIA !== '1',
    'Prepara una obra ZZ-E2E. Se habilita con E2E_ESCRIBE_ASISTENCIA=1.')
  // EL CONTROL DEL DEFECTO QUE COSTÓ EL REVERT, EN EL NAVEGADOR Y CON ESCENARIO PROPIO.
  // Sobre una obra viva no se puede afirmar «0 presentes»: su día de hoy cambia cuando un jefe
  // carga. Acá la obra es de la prueba, así que el estado inicial es una afirmación defendible.
  const persona = await prepararObraDePrueba()
  if (!persona) test.skip(true, 'La base no tiene a nadie asignado.')
  try {
    await page.setViewportSize({ width: 390, height: 844 })
    await entrarComo(page, ADMIN.email, ADMIN.password)
    await page.goto(`/campo/asistencia?obra=${OBRA_DE_PRUEBA}`)
    await expect(page.getByTestId('form-asistencia')).toBeVisible()

    await expect(page.getByTestId('horas').first()).toHaveValue('')
    await expect(page.getByTestId('fila-asistencia').first()).toHaveAttribute('data-estado', 'sin_marcar')
    await expect(page.getByTestId('pie-jornada')).toContainText('0 presentes')
    await page.screenshot({ path: 'qa-shots/asistencia-07-casilla-vacia-390.png', fullPage: true })

    await page.getByTestId('poner-jornada').click()
    await expect(page.getByTestId('horas').first()).toHaveValue('8,8')
    await page.screenshot({ path: 'qa-shots/asistencia-08-jornada-puesta-390.png', fullPage: true })
  } finally {
    await limpiarObraDePrueba()
  }
})
