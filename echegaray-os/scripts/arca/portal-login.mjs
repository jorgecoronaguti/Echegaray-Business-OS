#!/usr/bin/env node
// Paso 1 de la automatización del portal ARCA: login con clave fiscal y
// verificación de a qué llegamos (servicios habilitados, WSASS, CAPTCHA/2FA).
// Capturas en scripts/arca/out/ para diagnóstico. No imprime la clave.
//
// Uso: node scripts/arca/portal-login.mjs

import { chromium } from '@playwright/test'
import { readFileSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const DIR = dirname(fileURLToPath(import.meta.url))
const OUT = join(DIR, 'out')
mkdirSync(OUT, { recursive: true })

const cred = Object.fromEntries(
  readFileSync(join(DIR, 'credentials/clave-fiscal.txt'), 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => l.split('=', 2)),
)

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({
  locale: 'es-AR',
  userAgent:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
})
const page = await ctx.newPage()

try {
  await page.goto('https://auth.afip.gob.ar/contribuyente_/login.xhtml', { waitUntil: 'domcontentloaded', timeout: 45000 })
  await page.screenshot({ path: join(OUT, '01-login.png') })
  console.log('título login:', await page.title())

  // Paso CUIT
  const cuitInput = page.locator('#F1\\:username')
  await cuitInput.waitFor({ timeout: 15000 })
  await cuitInput.click()
  await cuitInput.pressSequentially(cred.CUIT, { delay: 90 })
  await page.waitForTimeout(600)
  await page.locator('#F1\\:btnSiguiente').click()

  // Paso clave
  const passInput = page.locator('#F1\\:password')
  await passInput.waitFor({ timeout: 15000 })
  await passInput.fill(cred.CLAVE)
  await page.screenshot({ path: join(OUT, '02-clave.png') })
  await page.locator('#F1\\:btnIngresar').click()

  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(4000)
  await page.screenshot({ path: join(OUT, '03-post-login.png'), fullPage: true })
  console.log('post-login URL:', page.url())
  console.log('post-login título:', await page.title())

  const cuerpo = (await page.textContent('body'))?.slice(0, 600)
  console.log('extracto:', cuerpo?.replace(/\s+/g, ' ').slice(0, 400))
} catch (e) {
  await page.screenshot({ path: join(OUT, '99-error.png'), fullPage: true }).catch(() => {})
  console.error('ERROR:', e instanceof Error ? e.message : String(e))
  process.exitCode = 1
} finally {
  await browser.close()
}
