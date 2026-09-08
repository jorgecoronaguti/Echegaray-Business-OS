import { test, expect, devices } from '@playwright/test'
import { entrarComo } from './util/login'
import { ADMIN } from './util/identidades'

// LA CARGA DE ASISTENCIA DESDE EL TELÉFONO, CON UN USUARIO DE ADENTRO — 08/09/2026.
//
// ═══ EL DEFECTO QUE ATRAPA, TEXTUAL DEL DUEÑO ═══
//
// *«probé el diseño del registro de la asistencia por el celular con mi usuario admin y es la misma
// pantalla que muestra la computadora»*. La experiencia de teléfono existía en `/campo/asistencia`
// y ningún rol de adentro llegaba a ella. Si `modoDeAsistencia` vuelve a devolver `quincena` para
// un teléfono, o si el bloque deja de renderizar, estos casos se ponen rojos.
//
// ═══ POR QUÉ UN DISPOSITIVO Y NO SÓLO `viewport: 390` (medido, no supuesto) ═══
//
// La elección móvil/escritorio se toma en el SERVIDOR con `sec-ch-ua-mobile`, así que el navegador
// tiene que mandar la pista de verdad. Medido con una sonda contra un servidor propio el 08/09:
//
//     default              ch=?0   ua-móvil=no
//     viewport 390x844     ch=?0   ua-móvil=no     ← un viewport chico NO es un teléfono
//     isMobile: true       ch=?0   ua-móvil=no     ← ni `isMobile` solo
//     devices['Pixel 5']   ch=?1   ua-móvil=sí     ← la pista sale del User-Agent emulado
//
// Por eso se parte de `devices['Pixel 5']` y se le fija el viewport en 390: el ANCHO que pidió el
// dueño con la IDENTIDAD de un teléfono real. Un test con `viewport: 390` a secas habría probado el
// camino de escritorio creyendo que probaba el del teléfono — y habría dado verde con el bug puesto.
//
// `defaultBrowserType` se deja AFUERA a propósito: Playwright rechaza un `test.use` de describe que
// cambie de navegador («forces a new worker»). Lo que hace falta de ese dispositivo es el
// User-Agent —de ahí sale la pista— y el tacto, no el motor.
const TELEFONO = {
  userAgent: devices['Pixel 5'].userAgent,
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: devices['Pixel 5'].deviceScaleFactor,
  isMobile: true,
  hasTouch: true,
}

// NADA DE ESTO ESCRIBE. Se abre la lista, se toca una obra y se mira que el formulario esté; las
// casillas nacen vacías y no se toca «Guardar el día». Escribir sobre una obra real fabricaría
// horas que nadie trabajó — es lo que ya pasó con las 77,4 HH de PISOS INDUSTRIALES.

test.describe('en el teléfono, Administración carga la asistencia del día', () => {
  test.use(TELEFONO)

  test('01 · la lista de obras, y tocar una abre el formulario de la jornada', async ({ page }) => {
    await entrarComo(page, ADMIN.email, ADMIN.password)
    await page.goto('/administracion/personas?vista=asistencia')

    // PASO 1 · LAS OBRAS. Sin `?modo=`: el teléfono lo tiene que decidir SOLO, que es todo el punto.
    await expect(page.getByTestId('asistencia-dia')).toBeVisible()
    await expect(page.getByTestId('obras-para-asistencia')).toBeVisible()
    // Y LA GRILLA DE ESCRITORIO NO SE DIBUJÓ. No está tapada con CSS: no se renderizó, así que el
    // teléfono no pagó la lectura de la quincena entera.
    await expect(page.getByTestId('grilla-asistencia')).toHaveCount(0)
    await page.screenshot({ path: 'qa-shots/asistencia-admin-390-obras.png', fullPage: true })

    const obras = page.getByTestId('obra-para-asistencia')
    const cuantas = await obras.count()
    if (cuantas === 0) test.skip(true, 'No hay obras activas en la base.')

    // ═══ EL CONTEO DE GENTE TIENE QUE SER UN NÚMERO EN ALGUNA OBRA ═══
    //
    // EL DEFECTO QUE ATRAPA, y que esta prueba encontró de verdad el 08/09: la lectura pedía
    // `obra_canonica_id` y esa columna en `obra_asignacion` se llama `obra_id`. PostgREST devolvía
    // error, el conteo caía a `null` y las nueve obras decían «sin conteo». El fallback fue honesto
    // —no publicó 0— pero el dato que decide cuál obra tocar no estaba. Si vuelve a romperse, acá
    // no queda ni una obra con un número y esto se pone rojo.
    const rotulos = await obras.getByTestId('asignados').allInnerTexts()
    const conGente = rotulos.findIndex((t) => /^[1-9]\d* persona/.test(t))
    expect(rotulos.some((t) => t !== 'sin conteo'),
      `Ninguna obra pudo contar su gente: ${rotulos.join(' | ')}`).toBe(true)
    if (conGente === -1) test.skip(true, 'Ninguna obra activa tiene gente asignada hoy.')

    // PASO 2 · EL DÍA Y LA CUADRILLA. Se toca la obra QUE TIENE GENTE: tocar la primera de la lista
    // hacía que la captura del formulario fuera en realidad la del aviso «nadie está asignado».
    await obras.nth(conGente).click()
    await expect(page.getByTestId('obra-de-la-jornada')).toBeVisible()
    await expect(page.getByTestId('elegir-dia')).toBeVisible()
    await expect(page.getByTestId('dia-anterior')).toBeVisible()
    await expect(page.getByTestId('dia-siguiente')).toBeVisible()

    await expect(page.getByTestId('form-asistencia')).toBeVisible()
    await expect(page.getByTestId('poner-jornada')).toBeVisible()
    await expect(page.getByTestId('guardar-dia')).toBeVisible()
    // LA CASILLA NACE VACÍA. Es el control que costó un revert: si nace con la jornada puesta, un
    // toque en Guardar escribe horas que nadie midió. NO se toca «Guardar»: esta es una obra real.
    await expect(page.getByTestId('horas').first()).toHaveValue('')
    await page.screenshot({ path: 'qa-shots/asistencia-admin-390-form.png', fullPage: true })
  })

  test('02 · «Ver la quincena completa» es la salida, y vuelve', async ({ page }) => {
    await entrarComo(page, ADMIN.email, ADMIN.password)
    await page.goto('/administracion/personas?vista=asistencia')
    await expect(page.getByTestId('asistencia-dia')).toBeVisible()

    // EL DEFECTO QUE ATRAPA: que el enlace no fuerce `modo=quincena` y devuelva la misma pantalla
    // de la que se quiso salir. Es el lazo que ya dejó `/campo/asistencia` girando sobre sí mismo
    // con el `?dia=…?obra=…`.
    await page.getByTestId('ver-quincena').click()
    await expect(page.getByTestId('grilla-asistencia')).toBeVisible()

    // Y LA VUELTA EXISTE: quien forzó la grilla en el teléfono no queda encerrado en ella.
    await page.getByTestId('ver-carga-del-dia').click()
    await expect(page.getByTestId('asistencia-dia')).toBeVisible()
  })

  test('03 · «Cargar asistencia» está en el menú de la cuenta, a un toque', async ({ page }) => {
    // EL DEFECTO QUE ATRAPA: la pantalla móvil existe y sigue sin haber cómo llegar. Es exactamente
    // la mitad del problema que reportó el dueño — la otra mitad la cubre el caso 01.
    await entrarComo(page, ADMIN.email, ADMIN.password)
    await page.goto('/administracion')
    await page.getByTestId('avatar-usuario').click()
    const ir = page.getByTestId('ir-cargar-asistencia')
    await expect(ir).toBeVisible()
    // ≥44px: se toca parado, en obra, con una mano.
    const caja = await ir.boundingBox()
    if (!caja) throw new Error('El atajo no tiene caja: no está renderizado.')
    expect(caja.height).toBeGreaterThanOrEqual(44)
    await ir.click()
    await expect(page.getByTestId('asistencia-dia')).toBeVisible()
  })
})

test.describe('en escritorio no cambia nada', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('04 · la quincena sigue siendo lo que se abre en 1440', async ({ page }) => {
    await entrarComo(page, ADMIN.email, ADMIN.password)
    await page.goto('/administracion/personas?vista=asistencia')
    await expect(page.getByTestId('grilla-asistencia')).toBeVisible()
    // Y NO SE COLÓ LA VISTA DEL TELÉFONO: si las dos se dibujaran, ésta sería la prueba de que se
    // están pagando las dos lecturas en cada carga.
    await expect(page.getByTestId('asistencia-dia')).toHaveCount(0)
    // El atajo del menú NO se le ofrece a quien tiene la grilla entera a la vista.
    await expect(page.getByTestId('ver-carga-del-dia')).toBeHidden()
    await page.screenshot({ path: 'qa-shots/asistencia-admin-1440-quincena.png', fullPage: true })
  })
})
