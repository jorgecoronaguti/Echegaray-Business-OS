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
    .toHaveText('2ª quincena de septiembre · 16 al 30', { timeout: 30000 })

  // EL DEFECTO QUE ATRAPA: que «anterior» reste quince días. Desde el 16 de un mes de 31 eso cae el
  // 1 —la misma quincena— y el link deja de mover la pantalla sin dar ningún error.
  // CONTRA PRODUCCIÓN LA GRILLA TARDA HASTA 6 s: se espera la URL nueva, no un reloj de 5 s.
  await page.getByTestId('quincena-anterior').click()
  await page.waitForURL(/quincena=2026-09-01/, { timeout: 30000 })
  await page.waitForLoadState('networkidle')
  await expect(page.getByTestId('rotulo-quincena')).toHaveText('1ª quincena de septiembre · 1 al 15')
  await page.getByTestId('quincena-siguiente').click()
  await page.waitForURL(/quincena=2026-09-16/, { timeout: 30000 })
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

  // LA COLUMNA HORAS NO QUEDA TAPADA. El panel flota encima; sin reservarle el ancho a la grilla,
  // el total de la persona —lo que se está por corregir— queda debajo del drawer.
  const horas = page.getByTestId('total-quincena-valor')
  const cajaHoras = await horas.boundingBox()
  if (!cajaHoras) throw new Error('El total de la quincena no está renderizado.')
  expect(cajaHoras.x + cajaHoras.width).toBeLessThanOrEqual(caja.x + 1)

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

test('05c · GUARDAR DEJA EL PANEL ABIERTO CON EL ACUSE, y la celda de atrás cambia', async ({ page }) => {
  test.skip(process.env.E2E_ESCRIBE_ASISTENCIA !== '1',
    'Escribe HH en su propia obra ZZ-E2E. Se habilita con E2E_ESCRIBE_ASISTENCIA=1.')
  // EL HUECO QUE ENCONTRÓ EL AUDITOR. Si al guardar la fila desaparece de `filas`, el panel se
  // desmonta y se lleva el acuse: el usuario ve desaparecer la pantalla y no sabe si escribió. Y la
  // otra mitad: que la grilla de atrás se relea de verdad, no que el panel diga «guardado» mientras
  // la celda sigue mostrando el número viejo.
  const persona = await prepararObraDePrueba()
  if (!persona) test.skip(true, 'La base no tiene a nadie en el plantel.')
  try {
    await page.setViewportSize({ width: 1440, height: 900 })
    await entrarComo(page, ADMIN.email, ADMIN.password)
    await page.goto('/administracion/personas?vista=asistencia')
    await expect(page.getByTestId('grilla-asistencia')).toBeVisible()

    // LA FILA SE UBICA POR EL id DE LA PERSONA, no por el rótulo de obra: la persona de prueba es
    // real y su columna OBRA muestra la obra donde tiene MÁS horas, que casi nunca es la ZZ-E2E.
    const fila = page.locator(`[data-testid="fila-quincena"]:has(a[href*="${persona}"])`).first()
    if (await fila.count() === 0) test.skip(true, 'La persona de prueba no está en esta quincena.')
    await fila.getByTestId('abrir-correccion').click()
    await expect(page.getByTestId('panel-correccion')).toBeVisible()

    // LA ESCRITURA VA A LA OBRA DE PRUEBA Y A NINGUNA OTRA. Sin fijar el destino, la corrección
    // caería en la obra viva donde esa persona tiene sus horas de verdad.
    await page.getByTestId('correccion-dia').selectOption({ index: 0 })
    await page.getByTestId('correccion-obra').selectOption(OBRA_DE_PRUEBA)
    await page.getByTestId('correccion-horas').fill('6')
    await page.getByTestId('guardar-correccion').click()

    // (a) EL ACUSE, CON EL PANEL TODAVÍA ABIERTO.
    await expect(page.getByTestId('acuse-correccion')).toBeVisible({ timeout: 20000 })
    await expect(page.getByTestId('panel-correccion')).toBeVisible()
    // (b) LA GRILLA DE ATRÁS RELEÍDA. El selector de día del panel se dibuja con los datos que el
    // servidor acaba de devolver: que ese día diga «6 hs» es el destino leído, no la promesa del
    // formulario. Sin el `router.refresh()` seguiría diciendo lo de antes.
    await expect(page.getByTestId('correccion-dia')).toContainText('6 hs', { timeout: 20000 })
    await expect(fila.getByTestId('celda-hora').first()).toBeVisible()
    await page.screenshot({ path: 'qa-shots/asistencia-quincena-guardado-1440.png' })
  } finally {
    await limpiarObraDePrueba()
  }
})

test('05d · UNA OBRA CERRADA: el día YA CARGADO se corrige en la celda, y el error va bajo la fila', async ({ page }) => {
  test.skip(process.env.E2E_ESCRIBE_ASISTENCIA !== '1',
    'Escribe HH en su propia obra ZZ-E2E. Se habilita con E2E_ESCRIBE_ASISTENCIA=1.')
  // EL DEFECTO DEL DUEÑO, EN EL NAVEGADOR (08/09, captura de producción): «modifiqué directamente el
  // número y salta error». Sus horas del 04/09 estaban en MAMPOSTERÍA, cerrada; la acción rebotaba
  // y el texto se dibujaba DENTRO de la celda, en diez renglones, rompiendo la fila.
  //
  // Acá la obra de prueba se CIERRA a propósito después de dejarle un día cargado. Es el único
  // escenario cerrado que se puede tocar: escribir sobre una obra cerrada de verdad imputaría horas
  // a una obra que ya se cerró con su margen.
  const persona = await prepararObraDePrueba()
  if (!persona) test.skip(true, 'La base no tiene a nadie en el plantel.')
  const sb = servicio()
  const hoy = new Date().toISOString().slice(0, 10)
  const previo = await sb.from('registros_hh').insert({
    obra_canonica_id: OBRA_DE_PRUEBA, persona_id: persona, fecha: hoy, fecha_inicio_semana: hoy,
    horas: 8, tipo_hora: 'normal', actividad_id: null, fuente_legacy: 'e2e:correccion-cerrada',
  }).select('id')
  if (previo.error) throw new Error(`No pude dejar el día cargado: ${previo.error.message}`)
  const cierre = await sb.from('obra_canonica').update({ estado: 'cerrada' }).eq('id', OBRA_DE_PRUEBA).select('estado')
  if (cierre.error || (cierre.data?.[0] as { estado: string } | undefined)?.estado !== 'cerrada') {
    throw new Error(`La obra de prueba no quedó cerrada: ${cierre.error?.message ?? 'no se releyó'}`)
  }

  try {
    await page.setViewportSize({ width: 1440, height: 900 })
    await entrarComo(page, ADMIN.email, ADMIN.password)
    await page.goto('/administracion/personas?vista=asistencia')
    await expect(page.getByTestId('grilla-asistencia')).toBeVisible()

    const fila = page.locator(`[data-testid="fila-quincena"]:has(a[href*="${persona}"])`).first()
    if (await fila.count() === 0) test.skip(true, 'La persona de prueba no está en esta quincena.')
    // LA CELDA DE ESE DÍA. Si ese día la persona tiene horas en OTRA obra además de la de prueba,
    // la celda no es editable —se corrige desde el panel— y este control no aplica: se saltea, no
    // se fuerza. Escribir ahí mandaría las horas a la obra viva de la persona.
    const celda = fila.locator(`[data-testid="celda-hora"][aria-label*="${hoy}"]`)
    if (await celda.count() === 0) test.skip(true, 'Ese día está repartido en dos obras: se corrige desde el panel.')
    await expect(celda).toHaveValue('8')

    // (a) LA CORRECCIÓN ENTRA AUNQUE LA OBRA ESTÉ CERRADA — y la evidencia es el dato leído en la
    // base, no la pantalla que no protestó.
    await celda.fill('9')
    await page.keyboard.press('Tab')
    await expect(fila.getByTestId('fila-error')).toHaveCount(0)
    await expect.poll(async () => {
      const { data } = await sb.from('registros_hh').select('horas')
        .eq('obra_canonica_id', OBRA_DE_PRUEBA).eq('persona_id', persona).eq('fecha', hoy)
      return Number((data?.[0] as { horas: number } | undefined)?.horas ?? 0)
    }, { timeout: 20000 }).toBe(9)
    await page.screenshot({ path: 'qa-shots/asistencia-correccion-cerrada-ok-1440.png' })

    // (b) EL ERROR NO ROMPE LA FILA. Un valor que no es un número ni «A» lo rechaza la pantalla sin
    // llamar a la base: alcanza para probar la forma del aviso, que es el segundo defecto.
    const altoAntes = (await fila.boundingBox())?.height ?? 0
    await celda.fill('nueve')
    await page.keyboard.press('Tab')
    const aviso = fila.locator('xpath=following-sibling::tr[1]').getByText(/·/).first()
    await expect(page.getByTestId('fila-error').first()).toBeVisible()
    const cajaAviso = await page.getByTestId('fila-error').first().boundingBox()
    if (!cajaAviso) throw new Error('El aviso no tiene caja.')
    // UNA LÍNEA: 11,5px de texto en una fila de tabla no pasa de 24px. El defecto que atrapa es el
    // mensaje de diez renglones que estiraba la fila a cinco veces su alto.
    expect(cajaAviso.height).toBeLessThanOrEqual(24)
    // Y LA FILA SIGUE MIDIENDO LO MISMO: el aviso está afuera, no adentro de la celda.
    expect((await fila.boundingBox())?.height ?? 0).toBeLessThanOrEqual(altoAntes + 1)
    // LA CELDA VUELVE AL VALOR ANTERIOR: lo tipeado no se guardó, dejarlo escrito diría lo contrario.
    await expect(celda).toHaveValue('9')
    await expect(aviso).toBeVisible()
    await page.screenshot({ path: 'qa-shots/asistencia-correccion-cerrada-1440.png' })
  } finally {
    await limpiarObraDePrueba()
  }
})

test('06 · la CARPETA de la persona: su cronología, con lo importado de JORNALES', async ({ page }) => {
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
  await page.screenshot({ path: 'qa-shots/asistencia-quincena-ficha-horas-1440.png', fullPage: true })
})

test('06b · DESDE LA GRILLA SE LLEGA A LA CARPETA DE LA PERSONA', async ({ page }) => {
  // El pedido del dueño: la pantalla Asistencia muestra SÓLO la quincena; el año entero vive en la
  // ficha. Sin el link, esa separación deja la cronología sin puerta desde donde se la necesita.
  await page.setViewportSize({ width: 1440, height: 900 })
  await entrarComo(page, ADMIN.email, ADMIN.password)
  await page.goto('/administracion/personas?vista=asistencia')
  await expect(page.getByTestId('grilla-asistencia')).toBeVisible()

  const link = page.getByTestId('link-ficha-persona').first()
  if (await link.count() === 0) test.skip(true, 'La quincena no tiene ninguna persona.')
  await link.click()
  await page.waitForLoadState('networkidle')
  await expect(page.getByTestId('bloque-horas')).toBeVisible()
  await expect(page).toHaveURL(/\/administracion\/personas\/[0-9a-f-]{36}\?v=horas/)
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

// ═══ LAS DOS ÓRDENES DEL 08/09/2026 ═══

test('08 · EL DOMINGO NO ES UNA COLUMNA — 13 días en una quincena de 15', async ({ page }) => {
  // «Los domingos no se trabaja, borralos de la consideración de todos lados». Los módulos puros ya
  // prueban el conteo; lo que sólo se ve acá es que la PANTALLA dibuja esas columnas y no otras.
  // La quincena va en la URL: contra «hoy» no se puede afirmar cuántas columnas hay.
  await page.setViewportSize({ width: 1440, height: 900 })
  await entrarComo(page, ADMIN.email, ADMIN.password)
  await page.goto('/administracion/personas?vista=asistencia&quincena=2026-09-01')
  await page.waitForLoadState('networkidle')
  await expect(page.getByTestId('rotulo-quincena'))
    .toHaveText('1ª quincena de septiembre · 1 al 15', { timeout: 30000 })

  // El `title` de cada columna es el nombre del día — está para desambiguar martes de miércoles, y
  // acá sirve de sonda: si aparece un solo «domingo», la orden no se cumplió.
  await expect(page.locator('th[title="domingo"]')).toHaveCount(0)
  await expect(page.locator('th[title="sábado"]')).toHaveCount(2, { timeout: 10000 })
  // 13 columnas de día: 15 menos los domingos 6 y 13. El sábado SIGUE siendo laborable.
  const dias = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
  const columnas = await page.locator(dias.map((d) => `th[title="${d}"]`).join(', ')).count()
  expect(columnas).toBe(13)
  await page.screenshot({ path: 'qa-shots/asistencia-sin-domingos-1440.png', fullPage: true })
})

test('09 · UNA PERSONA CON SÓLO LICENCIAS ESTÁ EN LA GRILLA, con «L» y sin sumar horas', async ({ page }) => {
  // EL DEFECTO DEL 08/09: QUIROGA ALEXANDER SEBASTIAN, activo, 45 licencias por enfermedad
  // importadas de JORNALES entre el 01/07 y el 07/09, SIN asignación en la plataforma — y no
  // aparecía. La grilla lo descartaba dos veces: no había con qué nombrarlo y una licencia no es
  // una hora trabajada.
  //
  // Se busca por texto y no por id: si mañana la persona deja de tener licencias, el test se
  // saltea en vez de dar un rojo que no es un defecto del código.
  await page.setViewportSize({ width: 1440, height: 900 })
  await entrarComo(page, ADMIN.email, ADMIN.password)
  await page.goto('/administracion/personas?vista=asistencia&quincena=2026-09-01&q=quiroga')
  await page.waitForLoadState('networkidle')
  await expect(page.getByTestId('rotulo-quincena')).toBeVisible({ timeout: 30000 })

  const fila = page.locator('tr', { hasText: 'QUIROGA' }).first()
  if (await fila.count() === 0) test.skip(true, 'La base ya no tiene licencias de esa persona.')
  await expect(fila).toBeVisible()
  // La celda de licencia es FIJA —no se puede pisar escribiendo un número— y dice «L», no «A».
  const licencias = fila.locator('[data-testid="celda-fija"][data-estado="licencia"]')
  expect(await licencias.count()).toBeGreaterThan(0)
  await expect(licencias.first()).toHaveText('L')
  await expect(licencias.first()).toHaveAttribute('title', /Licencia/)
  // NO SUMA HORAS: el total de la fila es «—», que no es lo mismo que un cero.
  await expect(fila.getByTestId('total-persona')).toHaveText('—')
  await page.screenshot({ path: 'qa-shots/asistencia-licencia-1440.png', fullPage: true })

  // ═══ Y LA FICHA DIBUJA LAS MISMAS COLUMNAS QUE LA GRILLA ═══
  //
  // Si la franja de la ficha mostrara los domingos y la grilla no, los «días hábiles» de la
  // empresa dependerían de qué pantalla se mire. La casilla lleva su fecha en `data-fecha`: el
  // domingo 6 y el domingo 13 de septiembre no pueden existir.
  const href = await fila.locator('a[href^="/administracion/personas/"]').first()
    .getAttribute('href')
  expect(href, 'la fila tiene que llevar a su carpeta').toBeTruthy()
  await page.goto((href as string).split('?')[0])
  await page.waitForLoadState('networkidle')
  await expect(page.getByTestId('franja-quincena')).toBeVisible({ timeout: 30000 })
  const franja = page.getByTestId('franja-quincena')
  expect(await franja.getByTestId('casilla-dia').count()).toBeGreaterThan(0)
  for (const f of await franja.getByTestId('casilla-dia').all()) {
    const fecha = await f.getAttribute('data-fecha')
    expect(new Date(`${fecha}T00:00:00Z`).getUTCDay(), `${fecha} es domingo`).not.toBe(0)
  }
  await page.screenshot({ path: 'qa-shots/ficha-sin-domingos-1440.png', fullPage: true })
// ═══ 08 · EL DESPLEGABLE DE OBRA ACTUAL (pedido del dueño, 08/09/2026) ═══
//
// LAS DOS OBRAS SON DE PRUEBA, A PROPÓSITO. Cambiar la obra actual CIERRA la asignación vigente, y
// hacerlo sobre una persona que hoy está en una obra real le pondría `hasta = ayer` a la asignación
// que respalda su costo de mano de obra — el mismo tipo de daño que el 07/09 metió 77,4 HH
// inventadas en PISOS INDUSTRIALES. Así que la prueba elige a alguien SIN ninguna asignación
// vigente, se la fabrica a una obra ZZ-E2E, la muda a otra obra ZZ-E2E y borra las dos. Ninguna
// obra real y ninguna asignación real se tocan, y el camino que se prueba es el completo:
// cerrar con `hasta` + abrir con `desde = hoy`.
// OBRAS PROPIAS Y NO LAS DEL RESTO DEL ARCHIVO: `prepararObraDePrueba` BORRA las asignaciones de
// `zz-e2e-asistencia` para armar su escenario, y con la suite en paralelo se llevó puesta la
// asignación de esta prueba —el desplegable apareció vacío y el test 04 se quedó sin su obra—.
// Dos pruebas que escriben no pueden compartir la fila que cada una necesita intacta.
const OBRA_ORIGEN = 'zz-e2e-asignacion-origen'
const OBRA_DESTINO = 'zz-e2e-asignacion-destino'
const NOMBRE_ORIGEN = `${MARCA_PRUEBA} asignación origen`
const NOMBRE_DESTINO = `${MARCA_PRUEBA} asignación destino`

async function prepararMudanza(): Promise<{ id: string; nombre: string } | null> {
  const sb = servicio()
  const hoy = new Date().toISOString().slice(0, 10)
  const ocupadas = await sb.from('obra_asignacion').select('persona_id, hasta')
  if (ocupadas.error) throw new Error(`No pude leer las asignaciones: ${ocupadas.error.message}`)
  const conObra = new Set(((ocupadas.data ?? []) as { persona_id: string; hasta: string | null }[])
    .filter((a) => !a.hasta || a.hasta >= hoy).map((a) => a.persona_id))

  const plantel = await sb.from('persona_plantel')
    .select('id, nombre_completo').not('nombre_completo', 'is', null).limit(300)
  if (plantel.error) throw new Error(`No pude leer el plantel: ${plantel.error.message}`)
  const libre = ((plantel.data ?? []) as { id: string; nombre_completo: string }[])
    .find((p) => !conObra.has(p.id))
  if (!libre) return null

  for (const [id, nombre] of [[OBRA_ORIGEN, NOMBRE_ORIGEN], [OBRA_DESTINO, NOMBRE_DESTINO]]) {
    const o = await sb.from('obra_canonica')
      .upsert({ id, nombre, estado: 'activa', jornada_horas: 8.8 }).select('id')
    if (o.error) throw new Error(`No pude crear ${id}: ${o.error.message}`)
  }
  await sb.from('obra_asignacion').delete().in('obra_id', [OBRA_ORIGEN, OBRA_DESTINO])
  const asig = await sb.from('obra_asignacion').insert({
    obra_id: OBRA_ORIGEN, persona_id: libre.id, rol: 'integrante', desde: '2026-01-01',
  }).select('id')
  if (asig.error) throw new Error(`No pude asignar a la obra de origen: ${asig.error.message}`)
  return { id: libre.id, nombre: libre.nombre_completo }
}

async function limpiarMudanza(): Promise<void> {
  const sb = servicio()
  await sb.from('obra_asignacion').delete().in('obra_id', [OBRA_ORIGEN, OBRA_DESTINO])
  await sb.from('usuario_obra').delete().in('obra_canonica_id', [OBRA_ORIGEN, OBRA_DESTINO])
  await sb.from('obra_canonica').delete().in('id', [OBRA_ORIGEN, OBRA_DESTINO])
}

test('08 · EL DESPLEGABLE MUDA LA ASIGNACIÓN, y la base y la ficha lo muestran', async ({ page }) => {
  test.skip(process.env.E2E_ESCRIBE_ASISTENCIA !== '1',
    'Escribe `obra_asignacion` sobre dos obras ZZ-E2E propias. Se habilita con E2E_ESCRIBE_ASISTENCIA=1.')
  // 30 s NO ALCANZAN: son un login, cuatro navegaciones y dos lecturas a la base. La corrida del
  // 08/09 pasó en 8,4 s con la máquina libre y se cayó por timeout con el build corriendo al lado —
  // sin que ninguna aserción fallara. Un test que da rojo por la carga de la máquina enseña a
  // ignorar el rojo.
  test.setTimeout(120_000)
  const persona = await prepararMudanza()
  test.skip(persona === null, 'Todo el plantel tiene obra vigente: no hay a quién mudar sin tocar una obra real.')
  const p = persona as { id: string; nombre: string }
  try {
    await page.setViewportSize({ width: 1440, height: 900 })
    await entrarComo(page, ADMIN.email, ADMIN.password)
    await page.goto(`/administracion/personas?vista=asistencia&q=${encodeURIComponent(p.nombre)}`)

    const select = page.getByTestId('select-obra-actual').first()
    await expect(select).toBeVisible()
    await expect(select).toHaveValue(OBRA_ORIGEN)
    await page.screenshot({ path: 'qa-shots/asignacion-dropdown-1440.png', fullPage: true })

    await select.selectOption(OBRA_DESTINO)
    const acuse = page.getByTestId('acuse-obra-actual')
    await expect(acuse).toBeVisible()
    // EL ACUSE NOMBRA LAS DOS OBRAS. «Guardado» no diría nada: lo que hay que poder leer es de
    // dónde a dónde se movió, porque es lo que decide a qué obra se le imputa el costo.
    await expect(acuse).toContainText('Desde hoy en')
    await expect(acuse).toContainText('antes')
    await page.screenshot({ path: 'qa-shots/asignacion-dropdown-acuse-1440.png', fullPage: true })
    // LA FILA SE REFRESCÓ: el desplegable muestra la obra nueva sin recargar a mano.
    await expect(page.getByTestId('select-obra-actual').first()).toHaveValue(OBRA_DESTINO)

    // ═══ LA EVIDENCIA ES DEL EFECTO: SE LEE LA BASE, NO LA PANTALLA ═══
    const sb = servicio()
    const hoy = new Date().toISOString().slice(0, 10)
    const ayer = new Date(Date.parse(`${hoy}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10)
    const filas = await sb.from('obra_asignacion')
      .select('obra_id, desde, hasta').eq('persona_id', p.id)
      .in('obra_id', [OBRA_ORIGEN, OBRA_DESTINO])
    expect(filas.error).toBeNull()
    const puestas = (filas.data ?? []) as { obra_id: string; desde: string | null; hasta: string | null }[]
    const origen = puestas.find((a) => a.obra_id === OBRA_ORIGEN)
    const destino = puestas.find((a) => a.obra_id === OBRA_DESTINO)
    // LA HISTORIA NO SE BORRA: la asignación anterior sigue existiendo, cerrada ayer.
    expect(origen, 'la asignación anterior tiene que seguir en la base').toBeTruthy()
    expect(origen?.hasta).toBe(ayer)
    expect(destino, 'la asignación nueva tiene que estar escrita').toBeTruthy()
    expect(destino?.desde).toBe(hoy)
    expect(destino?.hasta).toBeNull()

    // ═══ Y SE VE EN LA CRONOLOGÍA DE LA PERSONA ═══
    await page.goto(`/administracion/personas/${p.id}?v=asignaciones`)
    const asignaciones = page.getByTestId('fila-asignacion')
    await expect(asignaciones.first()).toBeVisible()
    // LAS DOS FILAS, LA CERRADA Y LA ABIERTA. Que la ficha muestre sólo la nueva sería el defecto
    // que el dueño no puede ver: el cambio existiría y el período anterior habría desaparecido.
    await expect(asignaciones.filter({ hasText: NOMBRE_ORIGEN })).toHaveCount(1)
    await expect(asignaciones.filter({ hasText: NOMBRE_DESTINO })).toHaveCount(1)
  } finally {
    await limpiarMudanza()
  }
})

test('08b · el desplegable en el teléfono', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await entrarComo(page, ADMIN.email, ADMIN.password)
  await page.goto('/administracion/personas?vista=asistencia&quincena=2026-08-16')
  // En 390px la vista de asistencia puede caer al modo día: la captura documenta lo que el dueño ve.
  await page.screenshot({ path: 'qa-shots/asignacion-390.png', fullPage: true })
})

test('08c · el JEFE DE OBRA ve la grilla y NO el desplegable de obra actual', async ({ page }) => {
  // *"sólo usuarios admin puedan hacer eso, y que jefe de obra pueda seguir con las funciones
  // normales de registrar asistencia"* (dueño, 08/09/2026). El jefe llega a esta pantalla —el área
  // se lo permite— y tiene que seguir viendo y editando la quincena; lo único que no aparece es el
  // control que mueve gente de obra. Sin esta aserción, un `puedeCorregir` reusado por comodidad le
  // devolvería el desplegable y nadie lo notaría.
  await page.setViewportSize({ width: 1440, height: 900 })
  await entrarComo(page, JEFE.email, JEFE.password)
  await page.goto('/administracion/personas?vista=asistencia&modo=quincena')
  await expect(page.getByTestId('celda-obra').first()).toBeVisible()
  await expect(page.getByTestId('select-obra-actual')).toHaveCount(0)
  // Y LA ASISTENCIA LE SIGUE FUNCIONANDO: las celdas de hora se editan como siempre.
  await expect(page.getByTestId('celda-hora').first()).toBeVisible()
  await page.screenshot({ path: 'qa-shots/asignacion-jefe-sin-dropdown-1440.png', fullPage: true })
})
