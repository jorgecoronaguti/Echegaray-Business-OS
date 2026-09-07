import { test } from '@playwright/test'
import { ADMIN } from './util/identidades'

// CUÁNTOS RENDERS DE SERVIDOR PIDE EL NAVEGADOR POR ABRIR UNA PANTALLA — el instrumento del
// defecto que cuida `src/shared/components/prefetch-en-listas.test.ts`.
//
// Next precarga cada `<Link>` que entra en pantalla. Cuando el destino es `force-dynamic` —y en
// este OS lo son todas— esa precarga NO es un archivo cacheado: es un render completo del servidor,
// con sus consultas y su pasada por el middleware, cuyo payload además no se reusa al hacer clic.
// Una pantalla con pastillas de filtro o una tabla larga se pide a sí misma decenas de veces.
//
// El número que importa es `prefetch_rsc`: cuántos de esos renders no los pidió nadie. El objetivo
// es CERO en las pantallas de lista.
//
//   PERF_TRAZA=1 npm run build && npx next start --hostname 127.0.0.1 -p 3457
//   E2E_BASE_URL=http://127.0.0.1:3457 npx playwright test tests/_medicion-prefetch.spec.ts
const RUTAS = (process.env.PERF_RUTAS ?? [
  '/documentos', '/obras', '/obras/gantt', '/administracion/compras', '/clientes',
  '/administracion/personas', '/administracion', '/mi-cuenta', '/aprobaciones',
  '/presupuestos', '/reportes', '/calendario-financiero',
].join(',')).split(',')

test('qué pide el navegador por abrir una pantalla', async ({ page }) => {
  test.setTimeout(600_000)
  await page.goto('/login')
  await page.fill('input[name="email"]', ADMIN.email)
  await page.fill('input[name="password"]', ADMIN.password)
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/(obras|clientes|administracion)/, { timeout: 120_000 })

  for (const ruta of RUTAS) {
    const pedidos: string[] = []
    // Los estáticos no cuentan: los sirve el CDN y no tocan la base ni el middleware.
    page.on('request', (r) => {
      if (!r.url().includes('/_next/static')) pedidos.push(new URL(r.url()).pathname + new URL(r.url()).search)
    })
    await page.goto(ruta, { waitUntil: 'load' })
    // La precarga arranca DESPUÉS de pintar: sin esta espera el instrumento no la ve y da un cero
    // que no es el de una pantalla sana, sino el de un medidor que miró antes de tiempo.
    await page.waitForTimeout(4000)
    page.removeAllListeners('request')
    const rsc = pedidos.filter((p) => p.includes('_rsc=')).length
    console.log(`### ${ruta}\tpedidos=${pedidos.length}\tprefetch_rsc=${rsc}`)
  }
})
