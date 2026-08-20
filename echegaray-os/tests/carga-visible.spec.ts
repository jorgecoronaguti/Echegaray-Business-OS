import { test, expect } from '@playwright/test'
import { entrar } from './util/obras-e2e'

// EL DEFECTO QUE ATRAPA ESTE RECORRIDO, EN LAS PALABRAS DEL DUEÑO (19/08/2026):
// *"al acceder al «obras» la app no responde, no se mueve, nada"* · *"necesito un timer, una ruedita
// o algo q me indique q esta cargando"*.
//
// No era una impresión. Cada pantalla del grupo `(main)` es `force-dynamic`: el clic dispara un
// render de servidor completo y, hasta que ese render no vuelve, el navegador deja la pantalla
// ANTERIOR intacta. Medido contra producción ese mismo día, `/obras` autenticada tardaba **95 s** en
// contestar. Noventa y cinco segundos sin una sola señal de vida.
//
// Son dos mecanismos distintos y por eso son dos pruebas distintas:
//   · NAVEGANDO  el indicador global y el esqueleto tienen que aparecer con el clic.
//   · ENTRANDO   el documento tiene que salir por streaming: marco y esqueleto en los primeros
//                bytes, datos después. Antes el documento entero esperaba a la última consulta.

const DEMORA_MS = 3000

test('al navegar a Obras aparecen el indicador y el esqueleto ANTES que los datos', async ({ page }) => {
  await entrar(page)

  // SE DEMORA LA NAVEGACIÓN, NO EL PREFETCH — la distinción es el mecanismo entero.
  //
  // Con `loading.tsx`, Next manda en el prefetch la cáscara estática de la ruta (el esqueleto) y se
  // queda con ella; al hacer clic la pinta al instante y recién entonces espera los datos. Demorar
  // también el prefetch daría un rojo que no es del arreglo sino del test — el mismo modo de falla
  // que ya costó caro acá: un rojo que manda a arreglar código que está bien.
  //
  // En un servidor rápido la espera hay que FABRICARLA: sin la demora el test pasaría igual con el
  // arreglo revertido, porque no habría estado intermedio que mirar.
  await page.route(/\/obras(\?|$)/, async (route) => {
    if (!route.request().headers()['next-router-prefetch']) {
      await new Promise((r) => setTimeout(r, DEMORA_MS))
    }
    await route.continue()
  })

  await page.goto('/os')
  await page.locator('a[href="/obras"]').first().click()

  const indicador = page.locator('[data-testid="indicador-navegacion"]')
  const esqueleto = page.locator('[data-testid="esqueleto-carga"]')

  // ═══ SE EXIGE «ALGUNA SEÑAL», Y NO UNA EN PARTICULAR ═══
  //
  // Son dos mecanismos que se pasan la posta, y CUÁL de los dos aparece no lo decide este código:
  // lo decide si el prefetch del link ya volvió cuando se hace clic. Medido sobre el build de
  // producción, corriendo este mismo recorrido varias veces: con el prefetch en mano, el esqueleto
  // monta en menos de 120 ms y la barra no llega a verse; sin él —el caso de producción lenta, que
  // es justamente el que reportó el dueño— el router NO monta el `loading.tsx` y la barra es lo
  // único que hay. Las dos cosas pasan de verdad, alternadas, en el mismo servidor.
  //
  // Exigir una de las dos en particular es un test que da rojo sin que nadie haya roto nada, y este
  // repositorio ya pagó ese error. Lo que el dueño pidió —y lo único que hace falta que sea cierto
  // siempre— es que al hacer clic SE MUEVA ALGO.
  await expect(indicador.or(esqueleto).first()).toBeVisible({ timeout: 1000 })

  // Y la prueba de que es un ESTADO DE CARGA y no una pantalla más: cuando llegan los datos, se van
  // los dos. Un indicador que queda prendido enseña a no mirarlo.
  await expect(page.locator('[data-testid="portafolio-tabla"]')).toBeVisible({ timeout: 60000 })
  await expect(esqueleto).toHaveCount(0)
  await expect(indicador).toHaveCount(0)
})

test('entrando por la URL, el marco y el esqueleto viajan ANTES que los datos', async ({ page }) => {
  await entrar(page)

  // Se mide sobre el HTML crudo y no sobre la pantalla a propósito: el orden de los bytes es un
  // hecho, no depende de cuán rápido esté hoy el servidor, y es exactamente lo que cambió. Con el
  // layout `async` de antes, `portafolio-tabla` no podía salir después del esqueleto porque el
  // esqueleto no existía: el documento salía entero, al final, o no salía.
  const html = await (await page.request.get('/obras')).text()
  const esqueletoTabla = html.indexOf('esqueleto-tabla')
  const headerEsqueleto = html.indexOf('app-header-esqueleto')
  const tablaReal = html.indexOf('portafolio-tabla')

  expect(headerEsqueleto, 'el header no se pinta antes de saber quién entró').toBeGreaterThan(-1)
  expect(esqueletoTabla, 'la pantalla de Obras no manda su esqueleto').toBeGreaterThan(-1)
  expect(tablaReal, 'no llegaron los datos').toBeGreaterThan(-1)
  expect(headerEsqueleto).toBeLessThan(tablaReal)
  expect(esqueletoTabla).toBeLessThan(tablaReal)
})
