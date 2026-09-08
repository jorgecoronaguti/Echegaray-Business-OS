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

    // ── 4 · LOS DÍAS EMPIEZAN CERCA DEL NOMBRE ───────────────────────────────
    const primerDia = await fila.getByTestId('celda-hora').first().boundingBox()
    expect(primerDia!.x, 'la quincena no puede arrancar a mitad de pantalla').toBeLessThan(640)

    await page.screenshot({ path: `tests/qa-shots/asistencia-grilla-${ancho}.png`, fullPage: false })
  })
}
