import { test, expect } from '@playwright/test'
import { entrarComo } from './util/login'
import { ADMIN } from './util/identidades'

// LA MEDIDA DEL PEAJE — cuánto agrega la web sobre la puerta del OS.
//
// El gateway informa su propio `ms` en cada respuesta. Restándolo del tiempo total del `fetch` desde
// el navegador queda el peaje: sesión de Supabase, verificación del contexto con RLS, el túnel y la
// red. Se mide sobre una operación determinística —la más común— y no sobre un benchmark inventado.
test('el peaje de la web sobre la puerta del OS está medido', async ({ page }) => {
  test.setTimeout(120_000)
  await entrarComo(page, ADMIN.email, ADMIN.password)
  await page.goto('/xsas')

  const m = await page.evaluate(async () => {
    const medir = async (mensaje: string) => {
      const t0 = performance.now()
      const r = await fetch('/api/xsas', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mensaje, origen: '/xsas-latencia' }),
      })
      const j = await r.json()
      return { total: Math.round(performance.now() - t0), gateway: j.ms as number, llm: Boolean(j.llm?.modelo) }
    }
    await medir('que podes hacer')           // calienta el túnel y el registro
    return { capacidades: await medir('que podes hacer'), empresa: await medir('como venimos') }
  })

  console.log('LATENCIA /xsas  capacidades:', JSON.stringify(m.capacidades), ' empresa:', JSON.stringify(m.empresa))
  expect(m.capacidades.llm).toBe(false)
  expect(m.empresa.llm).toBe(false)
  // El peaje es de la web; el trabajo es del OS. Un peaje mayor al segundo sería la web estorbando.
  expect(m.capacidades.total - m.capacidades.gateway).toBeLessThan(1500)
})
