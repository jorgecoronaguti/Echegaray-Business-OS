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

/** El render del servidor. Objetivo del pedido: en frío por debajo de 3 s. Medido en main: 0,6-0,8 s. */
const TOPE_DOC_MS = Number(process.env.PERF_TOPE_DOC_MS ?? 3_000)
/**
 * Hasta que la red queda quieta — el número que se disparó a 120 s. Medido en main: 2,7 s. El tope
 * es holgado a propósito: lo que tiene que atrapar es un orden de magnitud (una precarga que vuelve,
 * una lectura externa metida en el render), no medio segundo de varianza de una VM compartida.
 */
const TOPE_IDLE_MS = Number(process.env.PERF_TOPE_IDLE_MS ?? 20_000)

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
})
