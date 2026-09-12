import { test, expect } from '@playwright/test'
import { entrar } from './util/obras-e2e'

// ═══ DOS DEFECTOS DE ANCHO MEDIDOS EN PRODUCCIÓN (QA, 12/09/2026) ═══
//
// 1 · LA CARA COBRANZAS A 400px SE LLEVABA LA PÁGINA DE COSTADO: `document.body.scrollWidth` = 481
//     contra 400 de pantalla. Trabajos a 400 estaba bien —su tabla se desplaza adentro suyo—, así
//     que no era la ficha: eran los dos bloques que Cobranzas absorbió el 12/09, la cuenta corriente
//     y el esquema de pago. Tres causas, las tres medidas:
//       · `-mx-4 lg:-mx-10` sobre un marco que NO tiene padding lateral (el gutter de la ficha son
//         los 20px de cada bloque): el bloque arrancaba en −16 y terminaba en 416.
//       · la leyenda de antigüedad, cinco ítems de 74px + cuatro huecos de 14 = 426, sin `wrap`.
//       · la leyenda + el conmutador del esquema, 191px con `marginLeft:auto` y sin `wrap`.
//     Cuando la página se va de costado se van con ella el header y la navegación: la fila que se
//     está leyendo queda sin dueño y sin salida. Es la misma familia que `compras-390-scroll`.
//
// 2 · LA SUB-PANTALLA DEL PORTAL A 1280px quedaba en una columna angosta a la izquierda con el resto
//     en blanco, y encima corrida 40px fuera de la pantalla (documento de 1320): el mismo margen
//     negativo, más un mínimo de 958px en la columna de la tabla que a 1280 no entra al lado del
//     panel de alta y lo mandaba abajo con `flex-wrap`.
//
// ═══ QUÉ SE EXIGE, Y POR QUÉ ASÍ ═══
//
// No alcanza con «la página no se desplaza»: eso se puede conseguir MAL, tapando el desborde con
// `overflow: hidden` —y ahí el dato queda cortado sin barra que lo delate—. Por eso cada bloque
// ancho se mide aparte: si adentro le sobra ancho, tiene que poder desplazarse. Y en el portal se
// exige la GRILLA: contenido + costado en la misma línea, que es lo que se pidió.
//
// Es de LECTURA: no escribe en la base ni en el Sheet.

const TELEFONO = { width: 400, height: 900 }
const ESCRITORIO = { width: 1280, height: 1000 }

/** Lo que mide el desborde de la página, con el mensaje que dice cuánto y contra qué. */
async function paginaQuieta(page: import('@playwright/test').Page, donde: string) {
  const m = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
    win: window.innerWidth,
  }))
  expect(
    m.doc,
    `${donde}: la página se desplaza de costado (${m.doc}px de documento y ${m.body} de body en una pantalla de ${m.win}px)`,
  ).toBeLessThanOrEqual(m.win)
  expect(m.body, `${donde}: el body mide ${m.body} en una pantalla de ${m.win}px`).toBeLessThanOrEqual(m.win)
}

for (const cliente of ['quattropani', 'messina']) {
  test(`Cobranzas de ${cliente} a 400px no se lleva la página de costado`, async ({ page }) => {
    test.setTimeout(240000)
    await entrar(page)
    await page.setViewportSize(TELEFONO)
    await page.goto(`/clientes/${cliente}?vista=cobranzas`)
    await expect(page.getByTestId('cifras-cobranzas')).toBeVisible({ timeout: 90000 })
    // Los dos bloques que absorbió la cara tienen que estar dibujados: si la cuenta corriente o el
    // esquema no llegaran a renderizarse, la página no se desplazaría por no tener qué desplazar y
    // el verde no probaría nada.
    await expect(page.getByTestId('vista-cuenta-corriente')).toBeVisible()
    await expect(page.getByTestId('vista-esquema-pago').or(page.getByTestId('esquema-vacio'))).toBeVisible()

    await paginaQuieta(page, `${cliente} a 400px`)

    // Y EL DATO NO SE RECORTA: lo que sobra de ancho adentro de una tabla se desplaza adentro suyo,
    // como en Trabajos. Un `overflow: hidden` en la CINTA sería esconder la columna, no arreglarla.
    //
    // Se mira la cinta —el hijo directo del bloque— y no todo lo que haya adentro: las celdas de
    // texto sí recortan con `hidden` + `…` a propósito, y su `title` completa lo que se cortó.
    const cintas = await page.evaluate(() => {
      const out: { tid: string; dentro: number; visible: number; ox: string }[] = []
      for (const tid of ['certificados', 'listado-esquema']) {
        for (const raiz of document.querySelectorAll(`[data-testid="${tid}"]`)) {
          for (const c of raiz.children) {
            if (c.scrollWidth <= c.clientWidth + 1) continue
            out.push({ tid, dentro: c.scrollWidth, visible: c.clientWidth, ox: getComputedStyle(c).overflowX })
          }
        }
      }
      return out
    })
    for (const a of cintas) {
      expect(
        a.ox,
        `en «${a.tid}» sobran ${a.dentro - a.visible}px que no se pueden desplazar: el dato se está recortando`,
      ).toMatch(/auto|scroll/)
    }

    await page.screenshot({ path: `tests/capturas/cliente-cobranzas-400-${cliente}.png`, fullPage: false })
  })
}

test('la sub-pantalla del portal usa el ancho de la ficha: contenido + costado en la misma línea', async ({ page }) => {
  test.setTimeout(240000)
  await entrar(page)
  await page.setViewportSize(ESCRITORIO)
  await page.goto('/clientes/messina?portal=1')
  await expect(page.getByTestId('vista-accesos-portal')).toBeVisible({ timeout: 90000 })

  await paginaQuieta(page, 'el portal a 1280px')

  const grilla = await page.getByTestId('vista-accesos-portal').evaluate((v) => {
    const hijos = [...v.children].map((c) => {
      const r = c.getBoundingClientRect()
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width) }
    })
    const r = v.getBoundingClientRect()
    return { x: Math.round(r.x), w: Math.round(r.width), hijos, win: window.innerWidth }
  })

  // 1 · EL BLOQUE EMPIEZA DONDE EMPIEZA LA FICHA. Con el margen negativo arrancaba en −40 y se comía
  //     el rótulo «MAIL HABILITADO» de la primera columna.
  expect(grilla.x, `el portal arranca en ${grilla.x}px: volvió el margen negativo`).toBe(0)
  expect(grilla.w).toBe(grilla.win)

  // 2 · LA TABLA Y EL PANEL DE ALTA, EN LA MISMA LÍNEA. Si el panel se va abajo, a la derecha de la
  //     tabla vacía queda media pantalla en blanco: ése era el defecto reportado.
  expect(grilla.hijos.length, 'el portal dejó de tener contenido + costado').toBe(2)
  const [contenido, costado] = grilla.hijos
  expect(
    costado.y,
    `el panel de alta bajó a otra línea (tabla en y=${contenido.y}, panel en y=${costado.y}): la cara queda en una columna angosta`,
  ).toBe(contenido.y)
  expect(costado.x).toBeGreaterThan(contenido.x + contenido.w - 1)
  // El costado termina en el gutter de la ficha: 20px, como el resto de los bloques.
  expect(grilla.win - (costado.x + costado.w)).toBe(20)

  // 3 · Y LA TABLA ENTRA EN SU COLUMNA. Las pistas rígidas del handoff (974px con la sangría) sólo
  //     se dibujan donde la columna las mide; acá tiene que estar la variante elástica.
  const fila = await page.getByTestId('accesos').locator('div.grid').first()
    .evaluate((el) => ({ dentro: el.scrollWidth, visible: el.clientWidth }))
  expect(
    fila.dentro,
    `la fila de accesos pide ${fila.dentro}px en una columna de ${fila.visible}: las pistas rígidas se dibujan donde no entran`,
  ).toBeLessThanOrEqual(fila.visible + 1)

  await page.screenshot({ path: 'tests/capturas/cliente-portal-1280.png', fullPage: false })
})
