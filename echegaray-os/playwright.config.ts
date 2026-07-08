import { defineConfig } from '@playwright/test'
import { readFileSync, existsSync } from 'node:fs'

// El proceso de Playwright (a diferencia de `next dev`) no carga .env.local solo --
// algunos tests (ej. recalculo-frescura-fuentes) necesitan las mismas credenciales
// públicas que ya usa el cliente para hablar con Supabase directamente.
const envPath = '.env.local'
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2]
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
