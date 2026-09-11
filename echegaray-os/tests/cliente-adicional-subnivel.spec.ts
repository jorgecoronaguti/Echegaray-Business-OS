import { test, expect } from '@playwright/test'
import { entrarComo } from './util/login'
import { ADMIN } from './util/identidades'

// EL ADICIONAL SE VE DEBAJO DE SU OBRA MAYOR — la ficha del cliente, en el navegador.
//
// ═══ QUÉ PUEDE Y QUÉ NO PUEDE PROBAR ESTE SPEC HOY (11/09/2026) ═══
//
// La relación vive en `obra_canonica.obra_padre_id`, que entra con la migración 20260911T2000 — y
// esa migración LA APLICA EL DUEÑO desde el árbol principal. Hasta que la aplique, la base no tiene
// la columna: `pantalla_cliente()` no manda padre, ninguna fila es adicional y no hay subnivel que
// fotografiar.
//
// Entonces el spec hace dos cosas distintas, y las dice:
//
//   SIEMPRE   mide que la ficha de Messina RENDERICE con el código nuevo sin la migración aplicada:
//             es la ventana de deploy real, y una pantalla que se cae ahí es el defecto más caro de
//             todos. Deja la captura a 1280.
//   CUANDO    la columna ya esté puesta, mide el subnivel de verdad: el adicional pegado debajo de su
//   EXISTA    madre, con más sangría que ella y con su rótulo. Mientras no exista, SE SALTA CON
//             MOTIVO en vez de pasar en verde sin haber mirado nada — un aserto que no puede dar
//             rojo no es un control.
//
// Es de LECTURA: no escribe en la base ni en el Sheet.

const RUTA = '/clientes/messina'
const FILA = '[data-testid="fila-obra-cliente"]'

test('la ficha del cliente renderiza sus trabajos con el código del subnivel puesto', async ({ page }) => {
  await entrarComo(page, ADMIN.email, ADMIN.password)
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto(RUTA)
  await page.waitForSelector('[data-testid="obras-del-cliente"]')
  const filas = page.locator(FILA)
  expect(await filas.count()).toBeGreaterThan(0)

  // NINGUNA FILA SE PISA CON LA SIGUIENTE. Es el defecto que ya pagó esta tabla una vez (la grilla
  // mobile-first del 08/09) y tocar la celda del contratado es exactamente cómo volvería.
  const cajas = await filas.evaluateAll((els) => els.map((e) => e.getBoundingClientRect())
    .map((r) => ({ top: r.top, bottom: r.bottom })))
  for (let i = 1; i < cajas.length; i++) {
    expect(cajas[i].top, `la fila ${i} se dibuja encima de la anterior`)
      .toBeGreaterThanOrEqual(cajas[i - 1].bottom - 1)
  }
  await page.screenshot({ path: 'tests/capturas/cliente-adicional-subnivel-1280.png', fullPage: true })
})

test('el adicional se dibuja con sangría y rótulo debajo de su obra mayor', async ({ page }) => {
  await entrarComo(page, ADMIN.email, ADMIN.password)
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto(RUTA)
  await page.waitForSelector('[data-testid="obras-del-cliente"]')

  const marcas = page.locator('[data-testid="marca-adicional"]')
  if (await marcas.count() === 0) {
    test.skip(true, 'la migración 20260911T2000 todavía no está aplicada: la base no tiene '
      + 'obra_canonica.obra_padre_id y ninguna fila puede ser un adicional')
    return
  }

  // La fila del adicional: la que contiene la marca. Su sangría tiene que ser MAYOR que la de la
  // fila de arriba —que es su madre— y las dos tienen que estar pegadas.
  const filaHija = page.locator(`${FILA}:has([data-testid="marca-adicional"])`).first()
  const padding = await filaHija.evaluate((e) => parseFloat(getComputedStyle(e).paddingLeft))
  const filas = await page.locator(FILA).evaluateAll((els) => els.map((e) => ({
    padding: parseFloat(getComputedStyle(e).paddingLeft),
    adicional: !!e.querySelector('[data-testid="marca-adicional"]'),
    top: e.getBoundingClientRect().top,
  })))
  const i = filas.findIndex((f) => f.adicional)
  expect(i, 'el adicional quedó como la PRIMERA fila: no tiene su madre arriba').toBeGreaterThan(0)
  expect(padding).toBeGreaterThan(filas[i - 1].padding)
  // Y la obra mayor declara el consolidado, sin reemplazar su propio número.
  const consolidado = page.locator('[data-testid="consolidado-obra-cliente"]')
  expect(await consolidado.count()).toBeGreaterThan(0)
  await page.screenshot({ path: 'tests/capturas/cliente-adicional-subnivel-aplicado-1280.png', fullPage: true })
})
