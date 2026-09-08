import { test, expect } from '@playwright/test'
import { ADMIN } from './util/identidades'

// ═══ QUÉ DEFECTO ATRAPA ═══
//
// El 08/09/2026 se reportó que `/administracion/compras` tardaba 120.181 ms y 120.184 ms en dos
// corridas contra un build local, y 2.378 ms con todo caliente. Dos veces el mismo número con 3 ms
// de diferencia no es varianza: es un techo. Y el techo era el del INSTRUMENTO —esperar a que la
// red quede quieta, con corte a los 120 s—, no el del render: el documento nunca tardó eso.
//
// Lo que impedía que la red quedara quieta era la PRECARGA. Esta pantalla dibuja un `<Link>` por
// fila y otro por pastilla de filtro; todos entran en viewport, y cada uno dispara un render de
// servidor COMPLETO del destino —que es `force-dynamic`, así que el payload ni se reusa al hacer
// clic—. Medido el 07/09 (f8d5c392): una visita a esta pantalla pedía 14 cosas, 11 de precarga,
// con la página pesando 1.010 KB. Con eso corriendo, «la red quieta» no llega nunca.
//
// `prefetch-en-listas.test.ts` ya cuida la CAUSA de forma estructural y sin lista a mano. Lo que
// faltaba —y es lo que hay acá— es un número: cuánto tarda esta pantalla EN FRÍO, medido como lo
// mide una persona. Sin él, la próxima regresión vuelve a aparecer como «hace todo lento».
//
// ═══ CÓMO SE CORRE, Y POR QUÉ SE SALTEA SOLA ═══
//
//   NEXT_TURBOPACK_ROOT=… npm run build && npx next start --hostname 127.0.0.1 -p 3291
//   E2E_BASE_URL=http://127.0.0.1:3291 E2E_PORT=3291 npx playwright test tests/_medicion-compras.spec.ts
//
// Sin `E2E_BASE_URL` la config levanta un `next dev`, donde el primer golpe COMPILA y el número
// mide al compilador. Un umbral medido ahí sería rojo por algo que no es la aplicación, así que en
// esa condición esto no mide: se saltea y lo dice. Un instrumento que no puede confiar en su propia
// lectura no tiene que opinar.
const BASE = process.env.E2E_BASE_URL ?? ''

/**
 * EL RENDER DEL SERVIDOR. El objetivo del pedido es 3 s; el TOPE es 10 s, y la diferencia no es
 * pereza.
 *
 * Medido el 08/09 sobre `next start` en esta VM, seis corridas en frío con el servidor reiniciado:
 * 619, 657, 750, 765, 1.255 y **3.046 ms** — la última, apenas terminado un `npm run build`, con
 * los cuatro núcleos todavía ocupados y el disco frío. O sea que la mediana está en 0,7 s y la cola
 * pasa los 3 s por la máquina, no por la pantalla. Un umbral de 3 s se pone rojo por ruido, y un
 * control que grita sin defecto se termina ignorando: el próximo rojo de verdad no lo mira nadie.
 *
 * Diez segundos no es «casi cualquier cosa»: los 120 s reportados, un timeout de fetch, una lectura
 * a Drive metida en el render o una consulta sin índice caen todos del otro lado. Lo que este número
 * no puede atrapar es medio segundo de regresión — para eso está el conteo de precargas de abajo,
 * que no depende del reloj.
 */
const TOPE_DOC_MS = Number(process.env.PERF_TOPE_DOC_MS ?? 10_000)
/**
 * Hasta que la red queda quieta — el número que se disparó a 120 s. Medido en main: 2,7 s. El tope
 * es holgado a propósito: lo que tiene que atrapar es un orden de magnitud (una precarga que vuelve,
 * una lectura externa metida en el render), no medio segundo de varianza de una VM compartida.
 */
const TOPE_IDLE_MS = Number(process.env.PERF_TOPE_IDLE_MS ?? 20_000)
/**
 * CUÁNTOS RENDERS DE SERVIDOR PIDE ABRIR LA PANTALLA UNA VEZ.
 *
 * Éste es el número que sí se mueve cuando el defecto vuelve, y por eso está: con el
 * `prefetch={false}` sacado de la fila y de la pastilla —y todo lo demás igual— esta pantalla pasó
 * de 2 pedidos `_rsc` a 11 (medido el 08/09 sobre el build mutado). El reloj casi no se movió en
 * esta VM contra esta base: 750 ms de documento y 2.037 ms hasta la red quieta. O sea que un umbral
 * de TIEMPO, solo, deja pasar el defecto — mide bien el síntoma que reportó el dueño y no la causa.
 * El conteo lo agarra siempre, porque es el trabajo pedido, no lo que la máquina llegó a tardar.
 *
 * El tope es 3 y no 2: la navegación de verdad (la marca, las áreas del header) precarga a
 * propósito y son pocos. Once no es varianza de eso: es un render por fila dibujada.
 */
const TOPE_PRECARGAS = Number(process.env.PERF_TOPE_PRECARGAS ?? 3)

test('/administracion/compras abre en frío por debajo del tope', async ({ page }) => {
  test.skip(!BASE, 'sin E2E_BASE_URL esto correría contra `next dev` y mediría al compilador')
  test.setTimeout(400_000)

  await page.goto('/login')
  await page.fill('input[name="email"]', ADMIN.email)
  await page.fill('input[name="password"]', ADMIN.password)
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/(obras|clientes|flujo-caja|hoy|administracion)/, { timeout: 180_000 })

  const pedidos: string[] = []
  page.on('request', (r) => pedidos.push(r.url()))

  const t0 = Date.now()
  await page.goto('/administracion/compras', { waitUntil: 'load', timeout: 300_000 })
  const doc = await page.evaluate(() => {
    const n = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming
    return Math.round(n.responseEnd - n.responseStart)
  })
  // Se mide el corte por tiempo y no `waitForLoadState('networkidle')`: si la red no se aquieta, el
  // helper tira un timeout y el error diría «Timeout exceeded», que es exactamente el mensaje que
  // escondió este defecto durante una jornada. Acá el número sale igual y el fallo dice cuántos
  // pedidos había abiertos.
  let idle = -1
  try {
    await page.waitForLoadState('networkidle', { timeout: TOPE_IDLE_MS + 5_000 })
    idle = Date.now() - t0
  } catch { /* queda en -1: la red nunca se aquietó */ }

  const precargas = pedidos.filter((u) => u.includes('_rsc=')).length
  console.log(`MEDIDA\t/administracion/compras\tdoc=${doc}\tidle=${idle}\tpedidos=${pedidos.length}\tprecargas=${precargas}`)

  // Que la pantalla haya cargado de verdad: un cero de tiempo sobre una pantalla vacía sería el
  // mejor número posible y no probaría nada.
  await expect(page.getByTestId('tabla-compras-sheet')).toBeVisible({ timeout: 30_000 })

  expect(doc, `el render del servidor tardó ${doc} ms (tope ${TOPE_DOC_MS} ms)`)
    .toBeLessThan(TOPE_DOC_MS)
  expect(
    idle,
    idle < 0
      ? `la red nunca quedó quieta en ${TOPE_IDLE_MS + 5_000} ms: ${pedidos.length} pedidos, ${precargas} de precarga`
      : `la pantalla terminó de cargar recién a los ${idle} ms (tope ${TOPE_IDLE_MS} ms), con ${precargas} precargas`,
  ).toBeGreaterThan(0)
  expect(idle).toBeLessThan(TOPE_IDLE_MS)
  expect(
    precargas,
    `abrir la pantalla una vez pidió ${precargas} renders de servidor de precarga (tope ${TOPE_PRECARGAS}). `
    + 'Cada uno es un render completo de un destino force-dynamic, con sus consultas y su pasada por '
    + 'el middleware, cuyo payload ni siquiera se reusa al hacer clic. Falta un prefetch={false} en un '
    + '<Link> que se dibuja uno por fila o uno por filtro.',
  ).toBeLessThanOrEqual(TOPE_PRECARGAS)
})
