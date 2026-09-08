import { test, expect } from '@playwright/test'
import { entrarComo } from './util/login'
import { ADMIN } from './util/identidades'

// EL DISEÑO DE LA GRILLA DE QUINCENA, MEDIDO EN EL NAVEGADOR (dueño, 08/09/2026: «está roto el
// diseño en la sección de asistencia»). Sólo LECTURA: no escribe una celda ni toca la base. El
// guión bajo del nombre lo deja fuera de la suite de regresión; se corre cuando cambia la grilla.
//
// Lo que mide, defecto por defecto:
//   · el número de horas en el MISMO eje vertical que el total de su fila (antes 7 px más abajo);
//   · ningún total de persona en rojo (horas = cantidad, sin color de estado);
//   · ninguna celda de HOY con marco punteado de «sin cargar»;
//   · la primera columna de día no arranca a mitad de pantalla.

const RUTA = '/administracion/personas?vista=asistencia'
const ROJO = /rgb\(180, 35, 24\)/

async function abrir(page: import('@playwright/test').Page, w: number, h: number) {
  await page.setViewportSize({ width: w, height: h })
  await entrarComo(page, ADMIN.email, ADMIN.password)
  await page.goto(RUTA)
  await expect(page.getByTestId('grilla-asistencia')).toBeVisible({ timeout: 30000 })
}

/** El centro vertical de un elemento. Comparar centros y no bordes: los altos son distintos. */
const centro = (c: { y: number; height: number } | null) => (c ? c.y + c.height / 2 : NaN)

for (const [ancho, alto] of [[1440, 900], [2000, 1250]] as const) {
  test(`la grilla en ${ancho}: número, total y «corregir» en la misma línea, y los días cerca del nombre`, async ({ page }) => {
    await abrir(page, ancho, alto)

    // ── 1 · EL NÚMERO ESTÁ EN EL EJE DE SU FILA ──────────────────────────────
    const fila = page.getByTestId('fila-quincena').filter({ has: page.getByTestId('celda-hora') }).first()
    const input = fila.getByTestId('celda-hora').first()
    const total = fila.getByTestId('total-persona')
    const desvio = Math.abs(centro(await input.boundingBox()) - centro(await total.boundingBox()))
    expect(desvio, 'el número de horas y el total de la fila comparten eje vertical').toBeLessThan(3)

    // LA COLUMNA PERSONA SON DOS RENGLONES (nombre y nota) y lo que se centra es el BLOQUE, no
    // cada línea: se mide su eje, que es lo que el ojo lee como «la fila».
    const nombre = await fila.getByTestId('link-ficha-persona').boundingBox()
    const nota = await fila.getByTestId('nota-persona').count()
      ? await fila.getByTestId('nota-persona').boundingBox()
      : null
    const ejePersona = nota ? (nombre!.y + nota.y + nota.height) / 2 : centro(nombre)
    expect(Math.abs(centro(await input.boundingBox()) - ejePersona),
      'el número y el bloque de la persona comparten eje vertical').toBeLessThan(3)

    // El desplegable de obra, en el mismo eje que el número que le pertenece.
    const select = fila.getByTestId('select-obra-actual')
    if (await select.count()) {
      expect(Math.abs(centro(await input.boundingBox()) - centro(await select.boundingBox())),
        'el desplegable de obra y el número comparten eje vertical').toBeLessThan(3)
    }

    // ── 2 · NINGÚN TOTAL DE PERSONA EN ROJO ──────────────────────────────────
    for (const t of await page.getByTestId('total-persona').all()) {
      const color = await t.evaluate((el) => getComputedStyle(el).color)
      expect(color, 'las horas son una cantidad: nunca llevan el rojo de un problema').not.toMatch(ROJO)
    }

    // ── 3 · HOY NO SE RECLAMA ────────────────────────────────────────────────
    // La columna del día en curso salía entera en cajitas punteadas a las 14:52.
    const hoy = new Date().toISOString().slice(0, 10)
    const deHoy = page.locator(`[aria-label$="${hoy}"][data-testid="celda-hora"]`)
    for (const c of await deHoy.all()) {
      const celda = c.locator('xpath=ancestor::span[@data-testid="celda-dia" or @data-testid="celda-fija"][1]')
      await expect(celda, 'hoy no lleva el marco punteado de «sin cargar»').not.toHaveAttribute('data-sin-cargar', 'si')
    }

    // ── 4 · LA TABLA OCUPA EL ANCHO ENTERO ───────────────────────────────────
    // El dueño rechazó la versión al ancho del contenido: *«no sé por qué achicaste el margen»*.
    // Con 550 px muertos a la derecha, el total de cada fila caía por la mitad de la pantalla.
    const tabla = await page.getByTestId('grilla-asistencia').boundingBox()
    const disponible = await page.getByTestId('grilla-asistencia')
      .evaluate((el) => (el.parentElement as HTMLElement).clientWidth)
    expect(tabla!.width / disponible, 'la tabla ocupa el ancho que tiene').toBeGreaterThan(0.98)

    // ── 5 · LA «A» Y LA «L» SOLAS VAN EN EL EJE DE LOS NÚMEROS ───────────────
    // Arriba en el borde de su celda se leían corridas contra los números de las filas vecinas.
    const centrada = page.locator('[data-capa="presencia"][data-centrado="si"]').first()
    if (await centrada.count()) {
      const suFila = centrada.locator('xpath=ancestor::tr[1]')
      const vecino = suFila.getByTestId('celda-hora').first()
      const eje = await vecino.count()
        ? centro(await vecino.boundingBox())
        : centro(await suFila.getByTestId('total-persona').boundingBox())
      expect(Math.abs(centro(await centrada.boundingBox()) - eje),
        'el símbolo solo se lee a la altura de los números de su fila').toBeLessThan(3)
    }

    await page.screenshot({ path: `tests/qa-shots/asistencia-grilla-${ancho}.png`, fullPage: false })
  })
}

// ═══ LA PANTALLA ANGOSTA (dueño, 08/09/2026: la tabla se corría de costado sin ningún indicio) ═══
//
// Dieciséis columnas no entran en 390 px y nunca van a entrar: la tabla se desplaza. Lo que estaba
// roto no era el desplazamiento sino que fuera INVISIBLE —la quincena parecía terminar donde
// terminaba la pantalla— y que al llegar a los días del final ya no se supiera de quién eran esas
// horas. Se mide lo único que importa: el nombre sigue a la vista después de correr la tabla, hay
// un indicio mientras quede contenido, y la página entera no se corre de costado.
for (const [ancho, alto] of [[390, 844], [768, 1024]] as const) {
  test(`la grilla en ${ancho}: la persona no se va con el scroll y el desplazamiento se anuncia`, async ({ page }) => {
    await abrir(page, ancho, alto)
    const cinta = page.getByTestId('cinta-grilla')

    // ── 1 · LA PÁGINA NO SE CORRE DE COSTADO ─────────────────────────────────
    // El que scrollea es el contenedor de la tabla, no el documento: un `body` más ancho que la
    // pantalla se lleva el menú y el encabezado con él.
    const desborde = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(desborde, 'el documento no puede desplazarse de costado').toBeLessThanOrEqual(1)

    // ── 2 · HAY MÁS TABLA Y SE DICE ──────────────────────────────────────────
    const hayMas = await cinta.evaluate((el) => el.scrollWidth > el.clientWidth + 1)
    expect(hayMas, `en ${ancho} px la tabla tiene que seguir a la derecha`).toBe(true)
    await expect(page.getByTestId('hay-mas-grilla')).toBeVisible()

    // ── 3 · LA COLUMNA PERSONA SE QUEDA ──────────────────────────────────────
    const nombre = page.getByTestId('link-ficha-persona').first()
    const antes = await nombre.boundingBox()
    await cinta.evaluate((el) => { el.scrollLeft = el.scrollWidth })
    await page.waitForTimeout(150)
    const despues = await nombre.boundingBox()
    expect(despues, 'el nombre sigue dibujado después de correr la tabla').not.toBeNull()
    expect(Math.abs(despues!.x - antes!.x), 'la columna Persona no se corre con el scroll').toBeLessThan(2)
    expect(despues!.x, 'la columna Persona sigue dentro de la pantalla').toBeGreaterThanOrEqual(0)
    expect(despues!.x + despues!.width, 'y no la tapa el borde derecho').toBeLessThanOrEqual(ancho)

    // ── 4 · EL INDICIO SE APAGA EN EL FINAL ──────────────────────────────────
    // Una sombra que queda encendida siempre deja de significar «hay más».
    await expect(page.getByTestId('hay-mas-grilla')).toHaveCount(0)

    // ── 5 · Y EL CONTROL PUEDE DAR ROJO ──────────────────────────────────────
    // Una medición que pasa igual con y sin la corrección no mide nada: se le saca el `sticky` a la
    // columna en vivo y se exige que el nombre SÍ se corra. Si esta parte deja de fallar es que la
    // de arriba dejó de significar algo.
    await page.evaluate(() => {
      document.querySelectorAll<HTMLElement>('td, th').forEach((c) => {
        if (getComputedStyle(c).position === 'sticky') c.style.position = 'static'
      })
    })
    await page.waitForTimeout(100)
    const sinPegar = await nombre.boundingBox()
    expect(Math.abs(sinPegar!.x - antes!.x), 'sin `sticky` el nombre TIENE que irse con el scroll')
      .toBeGreaterThan(2)
    await page.reload()
    await expect(page.getByTestId('grilla-asistencia')).toBeVisible({ timeout: 30000 })

    if (ancho === 390) {
      await cinta.evaluate((el) => { el.scrollLeft = el.scrollWidth / 2 })
      await page.waitForTimeout(150)
      await page.screenshot({ path: 'tests/qa-shots/grilla-angosta-390.png' })
    }
  })
}
