import { chromium } from '@playwright/test'

const BASE = 'http://localhost:3277'
const DIR = '/home/jorge/echegaray-os/app/.claude/worktrees/prov-ficha-docs/echegaray-os/capturas'
const CUENTA = process.env.QA_ROL === 'jefe'
  ? { email: 'qa.jefe.obra@ecsas.com.ar', clave: 'TestJefe123!', pre: 'jefe' }
  : { email: 'jorge.o.corona+direccion-test-1783513222134@gmail.com', clave: 'TestPassword123!', pre: 'admin' }

const navegador = await chromium.launch()
const ctx = await navegador.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
page.on('pageerror', (e) => console.log('  PAGEERROR:', String(e).slice(0, 200)))
page.on('console', (m) => { if (m.type() === 'error') console.log('  CONSOLE:', m.text().slice(0, 200)) })

await page.goto(`${BASE}/login`)
await page.getByLabel(/correo|email/i).fill(CUENTA.email)
await page.getByLabel(/contraseña|clave/i).fill(CUENTA.clave)
await page.getByRole('button', { name: /ingresar|entrar|iniciar/i }).click()
await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000 })
console.log('sesión:', CUENTA.pre, '→', page.url())

for (const [nombre, ruta] of JSON.parse(process.env.RUTAS)) {
  const t0 = Date.now()
  try {
    await page.goto(`${BASE}${ruta}`, { timeout: 120000, waitUntil: 'networkidle' })
  } catch (e) { console.log(`  ${nombre}: TIMEOUT`, String(e).slice(0, 120)) }
  const archivo = `${DIR}/${CUENTA.pre}-${nombre}.png`
  await page.screenshot({ path: archivo, fullPage: true })
  console.log(`${nombre.padEnd(28)} ${page.url().replace(BASE, '')}  ${Date.now() - t0}ms`)
}
await navegador.close()
