import { defineConfig } from '@playwright/test'
import { readFileSync, existsSync } from 'node:fs'

// El proceso de Playwright (a diferencia de `next dev`) no carga .env.local solo --
// algunos tests (ej. recalculo-frescura-fuentes) necesitan las mismas credenciales
// públicas que ya usa el cliente para hablar con Supabase directamente.
const envPath = '.env.local'
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/)
    // LAS COMILLAS SE SACAN (23/07). `vercel env pull` escribe los valores entre comillas dobles.
    // Este parser las dejaba adentro, y como estas variables se heredan al `next dev` que Playwright
    // levanta, el servidor arrancaba con la URL de Supabase literalmente entrecomillada y moría en el
    // middleware con "Invalid supabaseUrl". No fallaba un test: no arrancaba NINGUNO. Por eso el QA
    // por navegador no se podía hacer.
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^"([\s\S]*)"$/, '$1')
  }
}

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3000',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
