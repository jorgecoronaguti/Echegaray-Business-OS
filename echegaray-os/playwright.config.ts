import { defineConfig } from '@playwright/test'
import { readFileSync, existsSync, lstatSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

// ═══ LAS DOS COSAS QUE HACEN QUE EL E2E NO ARRANQUE EN ESTA VM, Y NO SON UN DEFECTO DEL CÓDIGO ═══
//
// Las dos cuestan una corrida entera cada una, y el rojo que producen no señala nada de lo que se estaba
// probando. Por eso se resuelven acá y no en la cabeza del que venga (18/09/2026).
//
// 1. CHROMIUM NECESITA LIBRERÍAS QUE LA VM NO TIENE INSTALADAS. `npx playwright install-deps` pide root.
//    Están bajadas sin root en `~/.local/lib/pw-libs` (ver la memoria `qa-visual-sin-root`). Sin ellas el
//    navegador muere con `libatk-1.0.so.0: cannot open shared object file` y TODOS los tests fallan en
//    milisegundos, como si el spec estuviera roto. Se agrega solo si el directorio existe.
// 2. UN WORKTREE CON `node_modules` COMO SYMLINK NO LEVANTA: Turbopack corta con «Symlink [project]/
//    node_modules is invalid, it points out of the filesystem root» y Playwright informa «webServer was not
//    able to start». La regla del repo es enlaces DUROS (`scripts/preparar-worktree.mjs`, que ya lo explica);
//    acá sólo se avisa con el comando exacto, porque el mensaje de Turbopack no dice qué hacer.
const libsDeChromium = join(homedir(), '.local/lib/pw-libs')
if (existsSync(libsDeChromium) && !(process.env.LD_LIBRARY_PATH ?? '').includes(libsDeChromium)) {
  process.env.LD_LIBRARY_PATH = `${libsDeChromium}:${process.env.LD_LIBRARY_PATH ?? ''}`
}
if (existsSync('node_modules') && lstatSync('node_modules').isSymbolicLink()) {
  console.warn(
    '\n  ⚠ `node_modules` es un symlink y Turbopack lo rechaza: el servidor no va a arrancar.\n' +
    '    Arreglalo con enlaces duros (segundos, sin ocupar disco):\n' +
    '      rm node_modules && cp -al ../../echegaray-os/node_modules node_modules\n' +
    '    o `node scripts/preparar-worktree.mjs`, que hace eso y el `.env.local`.\n',
  )
}

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

// EL MISMO RECORRIDO SE PUEDE CORRER CONTRA PRODUCCIÓN.
//
// `E2E_BASE_URL=https://app.ecsas.com.ar npx playwright test` apunta los specs al sitio real y no
// levanta ningún servidor local. Es el smoke test de después de un deploy: los tests que importan
// —que sin sesión no se vea nada, que las pantallas abran con sesión real— sólo prueban algo si se
// corren contra lo que el dueño abre en su teléfono. Con localhost, un permiso faltante en la base
// de producción no se ve.
// ═══ UN SERVIDOR AJENO SE REUSABA COMO SI FUERA EL PROPIO (19/08/2026) ═══
//
// `reuseExistingServer` mira SÓLO si el puerto contesta; no le pregunta desde qué directorio. Con
// varios agentes trabajando en worktrees, uno tenía su `next dev` levantado en el 3000 — y la suite
// del árbol principal se enganchó a ÉL. Tres tests fallaron y ninguno tenía un defecto: Economía
// mostraba la versión anterior del componente y Documentos no existía todavía en ese worktree.
//
// El modo de falla es el peor de todos: la suite corre, informa rojo, y manda a arreglar código que
// ya está bien. Es la misma familia que "un control nunca se valida contra la información que
// produce" — acá el test no medía el árbol que decía medir.
//
// `E2E_PORT` levanta el servidor en un puerto propio y APAGA el reuso: lo que se prueba sale, sí o
// sí, del directorio desde el que se corrió el comando.
//
//     E2E_PORT=3210 npx playwright test        ← servidor propio, nunca reusa
//     npx playwright test                      ← 3000, reusa si ya hay uno (rápido para iterar)
const PORT = process.env.E2E_PORT || '3000'
const BASE = process.env.E2E_BASE_URL || `http://localhost:${PORT}`
const esLocal = BASE.includes('localhost')

export default defineConfig({
  testDir: './tests',
  // UN SOLO WORKER, A PROPÓSITO (17/09). Sin `workers`, Playwright abre un Chromium por núcleo: cuatro
  // navegadores de ~600 MB más el `next dev` de ~2 GB, en una VM de 7 GB que además corre el OS
  // productivo. Ese día la máquina se quedó sin RAM ni swap. El navegador es un cupo de `ecos`
  // (scripts/recursos/), y el cupo es de uno.
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: BASE,
    screenshot: 'only-on-failure',
  },
  ...(esLocal
    ? {
        webServer: {
          // `npm run dev` ya pasa por el portero (ecos next); dentro de `ecos e2e` no vuelve a pedir turno.
          command: `npm run dev -- --port ${PORT}`,
          url: BASE,
          // Con puerto propio NUNCA se reusa: reusar es exactamente lo que hizo que la suite midiera
          // el worktree de otro agente.
          reuseExistingServer: !process.env.CI && !process.env.E2E_PORT,
          timeout: 60_000,
        },
      }
    : {}),
})
