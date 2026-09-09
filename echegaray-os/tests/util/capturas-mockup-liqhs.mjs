// REGENERA LAS CAPTURAS DEL MOCKUP para comparar contra las de la app:
//   LD_LIBRARY_PATH=/home/jorge/.local/lib/pw-libs node tests/util/capturas-mockup-liqhs.mjs
// Las de la app las deja `tests/liquidacion-fidelidad.spec.ts` en test-results/liquidacion-fidelidad/.
// Las secciones se piden por ÍNDICE porque el .dc.html no les pone id: el índice es el número de
// pantalla menos uno, y el script imprime el título de cada una para acusar si se corrió.

import { chromium } from '@playwright/test'
const RUTA = 'file:///home/jorge/liqhs/design_handoff_liquidacion_v2/design/Liquidaci%C3%B3n%20de%20horas%20v2.dc.html'
const SALIDA = '/home/jorge/echegaray-os/worktrees/wt-fidelidad2/echegaray-os/capturas-mockup-liqhs'
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 1440, height: 1200 } })
await p.goto(RUTA, { waitUntil: 'networkidle' }).catch(() => {})
await p.waitForTimeout(2500)
const secciones = await p.$$('body section')
const quiero = { 4: 'mockup-5-costo-hora', 5: 'mockup-6-costo-obra', 10: 'mockup-11-quincena-cerrada' }
for (const [i, nombre] of Object.entries(quiero)) {
  const s = secciones[Number(i)]
  if (!s) { console.log('falta', nombre); continue }
  await s.screenshot({ path: `${SALIDA}/${nombre}.png` })
  console.log(nombre, (await s.innerText()).slice(0, 60).replace(/\n/g, ' · '))
}
await b.close()
