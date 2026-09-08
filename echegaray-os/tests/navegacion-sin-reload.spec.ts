import { test, expect, type Page } from '@playwright/test'
import { ADMIN } from './util/identidades'

// ═══ NAVEGAR NO PUEDE SER RECARGAR (08/09/2026) ═══
//
// El dueño, textual: *«cada vez que cambio de sección o de módulo vuelve a hacer reload de toda la
// página, eso no es óptimo y hace todo lento»*.
//
// El instrumento no mira tiempos —un tiempo alto puede ser una consulta lenta— sino la MARCA: se
// escribe `window.__marca` una vez, y toda navegación de cliente la conserva porque el documento es
// el mismo. Si el navegador rehace el documento, el objeto `window` se tira y la marca desaparece.
// Es la única señal que no se puede confundir con «tardó».
//
// El segundo testigo es `performance.getEntriesByType('navigation')`: hay UNA entrada por documento
// cargado. Dos entradas = dos documentos = recarga dura, aunque la marca sobreviviera por azar.
declare global {
  interface Window { __marca?: number }
}

const CLICKS = [
  // Nivel 1 — el header global.
  { testid: 'nav-obras', espera: /\/obras/ },
  { testid: 'nav-presupuestos', espera: /\/presupuestos/ },
  { testid: 'nav-administracion', espera: /\/administracion/ },
  // Nivel 2 — la barra del área.
  { testid: 'ir-clientes', espera: /\/clientes/ },
  { testid: 'ir-personas', espera: /\/administracion\/personas/ },
  { testid: 'ir-proveedores', espera: /\/administracion\/proveedores/ },
  { testid: 'ir-compras', espera: /\/administracion\/compras/ },
  // Nivel 3 — las sub-vistas de Personal.
  { testid: 'vista-asistencia', espera: /vista=asistencia/, desde: '/administracion/personas' },
  { testid: 'vista-personal', espera: /\/administracion\/personas/ },
  // Un control de navegación que NO es una solapa: «Limpiar filtros» de Compras. Es el mismo
  // gesto —cambiar lo que la pantalla muestra— y hasta hoy era un `<a href>` crudo, o sea el
  // navegador tirando el documento entero y volviéndolo a pedir.
  { testid: 'f-limpiar', espera: /\/administracion\/compras(\?|$)/, desde: '/administracion/compras?d=2026-01-01' },
]

async function entrar(page: Page) {
  await page.goto('/login')
  await page.fill('input[name="email"]', ADMIN.email)
  await page.fill('input[name="password"]', ADMIN.password)
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/(obras|clientes|administracion|flujo-caja)/, { timeout: 120_000 })
}

test('cambiar de sección o de módulo no recarga el documento', async ({ page }) => {
  test.setTimeout(600_000)
  await entrar(page)
  await page.goto('/administracion')
  await page.waitForSelector('[data-testid="nav-admin-secciones"]')
  await page.evaluate(() => { window.__marca = Date.now() })

  const recargaron: string[] = []
  const tiempos: string[] = []

  for (const c of CLICKS) {
    if (c.desde && !page.url().includes(c.desde)) {
      await page.goto(c.desde)
      await page.waitForSelector(`[data-testid="${c.testid}"]`)
      await page.evaluate(() => { window.__marca = Date.now() })
    }
    const enlace = page.locator(`[data-testid="${c.testid}"]`).first()
    await enlace.waitFor({ state: 'visible', timeout: 60_000 })
    const t0 = Date.now()
    await enlace.click()
    // `commit`: el instrumento mide NAVEGAR, no esperar a que cierre el último stream de la
    // pantalla. Con el default (`load`) una pantalla que deja una petición abierta cuelga la
    // medición y esconde el dato que se busca.
    await page.waitForURL(c.espera, { timeout: 150_000, waitUntil: 'commit' })
    await page.waitForSelector('[data-testid="app-header"]', { timeout: 150_000 })
    const ms = Date.now() - t0
    const marca = await page.evaluate(() => window.__marca)
    const documentos = await page.evaluate(() => performance.getEntriesByType('navigation').length)
    console.log(`###	${c.testid}	${ms} ms	marca=${marca === undefined ? 'PERDIDA' : 'viva'}	documentos=${documentos}`)
    tiempos.push(`${c.testid}\t${ms} ms\tmarca=${marca === undefined ? 'PERDIDA' : 'viva'}\tdocumentos=${documentos}`)
    if (marca === undefined || documentos !== 1) recargaron.push(`${c.testid} (documentos=${documentos}, marca=${marca === undefined ? 'perdida' : 'viva'})`)
    // La marca se repone: sin esto, la primera recarga contamina a todos los clicks que siguen y el
    // reporte no dice CUÁL enlace recarga.
    if (marca === undefined) await page.evaluate(() => { window.__marca = Date.now() })
  }

  console.log('### navegación\n' + tiempos.join('\n'))
  expect(recargaron, `enlaces que recargan el documento entero: ${recargaron.join(' · ')}`).toEqual([])
})
