#!/usr/bin/env node
// Intento de alta automática en app.afipsdk.com para obtener el access token.
// Si el flujo exige verificación de email / captcha / método de pago, se detiene
// y deja captura en out/ para saber exactamente en qué paso quedó.
import { chromium } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const DIR = dirname(fileURLToPath(import.meta.url))
const OUT = join(DIR, 'out')
mkdirSync(OUT, { recursive: true })

const EMAIL = 'jorge.o.corona@gmail.com'
// Modo 1 (sin args): pide el email -> Afip SDK manda un link mágico al inbox.
// Modo 2 (con el link como arg): abre el link, extrae el access_token y lo guarda
//   en credentials/afipsdk-token.txt. Es el "reenviame el link y yo hago el resto".
const magicLink = process.argv[2]

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ locale: 'es-AR' })
try {
  if (magicLink) {
    await page.goto(magicLink, { waitUntil: 'networkidle', timeout: 45000 })
    await page.waitForTimeout(4000)
    await page.screenshot({ path: join(OUT, 'sdk-token.png'), fullPage: true })
    // El token suele quedar en localStorage y/o visible en el dashboard.
    const ls = await page.evaluate(() => JSON.stringify(Object.fromEntries(Object.entries(localStorage))))
    const bodyTxt = (await page.textContent('body')) || ''
    const tokenLS = JSON.parse(ls)
    const candidato =
      Object.entries(tokenLS).find(([k]) => /token|access/i.test(k))?.[1] ||
      bodyTxt.match(/[A-Za-z0-9._-]{40,}/)?.[0]
    if (candidato) {
      writeFileSync(join(dirname(fileURLToPath(import.meta.url)), 'credentials/afipsdk-token.txt'), `ACCESS_TOKEN=${candidato}\n`)
      console.log('access_token extraído y guardado en credentials/afipsdk-token.txt')
    } else {
      console.log('No encontré el token automáticamente. localStorage:', ls.slice(0, 400))
      console.log('Ver out/sdk-token.png para copiarlo a mano a credentials/afipsdk-token.txt')
    }
    await browser.close()
    process.exit(0)
  }

  await page.goto('https://app.afipsdk.com/login', { waitUntil: 'domcontentloaded', timeout: 45000 })
  await page.waitForTimeout(2000)
  await page.locator('input[type="email"]').fill(EMAIL)
  await page.getByText('Continuar con Email').click()
  await page.waitForTimeout(4000)
  await page.screenshot({ path: join(OUT, 'sdk-email-enviado.png'), fullPage: true })
  const txt = (await page.textContent('body'))?.replace(/\s+/g, ' ').slice(0, 400)
  console.log(`Link mágico solicitado para ${EMAIL}. Estado en pantalla:`, txt)
  console.log('-> Reenviar el link del email; correr: node scripts/arca/afipsdk-signup.mjs "<LINK>"')
} catch (e) {
  await page.screenshot({ path: join(OUT, 'sdk-99-error.png'), fullPage: true }).catch(() => {})
  console.error('ERROR:', e instanceof Error ? e.message : String(e))
  process.exitCode = 1
} finally {
  await browser.close()
}
