import { test, expect } from '@playwright/test'
import { appendFileSync } from 'node:fs'
import { ADMIN } from './util/identidades'

// MEDIDOR DE CARGA DE LA PLATAFORMA — no es un test, es el instrumento.
//
// Produce dos números por pantalla:
//   doc    `responseEnd − responseStart` del documento: el servidor esperando a la base, con el
//          streaming ya contado. Es el número que el dueño siente como «no responde».
//   total  `loadEventEnd − startTime`: hasta que el navegador terminó de cargar todo.
//
// Y deja en `VENTANAS` el instante de arranque y fin de cada navegación, para poder repartir por
// pantalla las líneas `PERFQ` que escribe el servidor (ver `src/lib/supabase/traza.ts`).
//
// Se corre contra un `next start` propio, NUNCA contra `next dev`: en dev el primer golpe compila y
// el número mide al compilador, no a la aplicación.
//
//   PERF_TRAZA=1 npm run build && PERF_TRAZA=1 npx next start --hostname 127.0.0.1 -p 3457
//   E2E_BASE_URL=http://127.0.0.1:3457 npx playwright test tests/_medicion-plataforma.spec.ts
//
// `127.0.0.1` y no `localhost` a propósito: con «localhost» la config levanta su propio `next dev`.
const RUTAS = (process.env.PERF_RUTAS ?? [
  '/obras', '/obras/gantt', '/administracion/compras', '/clientes',
  '/administracion/personas', '/administracion', '/documentos',
].join(',')).split(',')
const CALENTAR = Number(process.env.PERF_CALENTAR ?? 2)
const MEDIDAS = Number(process.env.PERF_MEDIDAS ?? 5)
const VENTANAS = process.env.PERF_VENTANAS ?? '/tmp/perf-ventanas.tsv'

const mediana = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]

test('medir la carga de la plataforma', async ({ page }) => {
  test.setTimeout(1_800_000)
  await page.goto('/login')
  await page.fill('input[name="email"]', ADMIN.email)
  await page.fill('input[name="password"]', ADMIN.password)
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/(obras|clientes|flujo-caja|hoy|administracion)/, { timeout: 180_000 })

  const filas: string[] = []
  for (const ruta of RUTAS) {
    const doc: number[] = []
    const total: number[] = []
    for (let i = 0; i < CALENTAR + MEDIDAS; i++) {
      const desde = Date.now()
      await page.goto(ruta, { waitUntil: 'load', timeout: 180_000 })
      const t = await page.evaluate(() => {
        const n = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming
        return { doc: n.responseEnd - n.responseStart, total: n.loadEventEnd - n.startTime }
      })
      if (i >= CALENTAR) {
        doc.push(Math.round(t.doc)); total.push(Math.round(t.total))
        appendFileSync(VENTANAS, `${ruta}\t${desde}\t${Date.now()}\n`)
      }
    }
    filas.push(`MEDIDA\t${ruta}\tdoc=${mediana(doc)}\ttotal=${mediana(total)}\tdocs=${doc.join(',')}`)
    console.log(filas.at(-1))
  }
  console.log('\n' + filas.join('\n'))
  expect(filas).toHaveLength(RUTAS.length)
})
