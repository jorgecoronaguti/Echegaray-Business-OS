// Pruebas LIVIANAS del portero: clasificación de comandos y de procesos. No levantan nada pesado.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { clasificar, PROTEGIDOS_CMD } from './comun.mjs'

const AQUI = dirname(fileURLToPath(import.meta.url))
const hook = (command, cwd = '/tmp') => execFileSync('node', [join(AQUI, 'hook-bash.mjs')], {
  input: JSON.stringify({ tool_name: 'Bash', tool_input: { command }, cwd }), encoding: 'utf8', env: { ...process.env, ECOS_ACTIVO: '' },
})
const frena = (cmd, cwd) => { const r = hook(cmd, cwd); return r.includes('"deny"') }

test('el hook frena lo pesado pelado y deja pasar lo gobernado y lo liviano', () => {
  for (const c of ['npx tsc --noEmit', 'npx playwright test', 'next dev', 'npm run typecheck', 'node --test "orquestador/**/*.test.mjs"', 'cd /tmp && npx eslint .'])
    assert.equal(frena(c), true, `debía frenar: ${c}`)
  for (const c of ['git status', 'ecos validacion -- npm run typecheck', 'scripts/recursos/ecos next -- next dev', 'node --test orquestador/lib/x.test.mjs', 'ecos estado', 'node --check a.mjs'])
    assert.equal(frena(c), false, `no debía frenar: ${c}`)
})

test('texto que menciona comandos pesados no es un comando pesado', () => {
  for (const c of [
    "sed -i 's/next dev --turbopack/next dev --webpack/' prueba.sh",
    'echo "npx tsc --noEmit" >> README.md',
    "cat > x.md <<'EOF'\nnpm run typecheck\nnext dev\nEOF\necho listo",
    "python3 - <<'PY'\ns = s.replace('npm run lint', 'x')\nPY",
    'grep -rn "playwright test" docs/',
  ]) assert.equal(frena(c), false, `no debía frenar: ${c}`)
  for (const c of ['timeout 60 npx next dev --port 3799', 'LD_LIBRARY_PATH=/x nohup npx playwright test &', 'bash -c "npx tsc --noEmit"', 'cd a && npx eslint . | tail'])
    assert.equal(frena(c), true, `debía frenar: ${c}`)
})

test('un npm run cuyo script ya pasa por ecos no se frena en ESE directorio', () => {
  const raiz = join(AQUI, '..', '..') // el package.json de este proyecto ya está gobernado
  assert.equal(frena('npm run typecheck', raiz), false)
  assert.equal(frena('npm run typecheck', '/tmp'), true)
})

test('clasificar: desarrollo vs protegido', () => {
  const p = (cmd, cgroup = '/user.slice/user-1001.slice/session-1.scope') => clasificar({ cmd, cgroup })
  assert.equal(p('next-server (v16.2.10)').clase, 'next')
  assert.equal(p('/home/x/.cache/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell --headless').clase, 'browser')
  assert.equal(p('node /x/node_modules/.bin/tsc --noEmit').clase, 'validacion')
  assert.equal(p('node --test orquestador/**/*.test.mjs').clase, 'validacion')
  assert.equal(p('/usr/lib/chromium/chromium --user-data-dir=/profile/chrome-balanz').protegido, true)
  assert.equal(p('node orquestador/worker.mjs').protegido, true)
  assert.equal(p('/mattermost/bin/mattermost').protegido, true)
  assert.equal(p('node /x/.bin/next start').protegido, true)
  assert.equal(p('next-server (v16)', '/user.slice/user-1001.slice/user@1001.service/app.slice/echegaray-xsas-gateway.service').protegido, true)
  assert.equal(p('sleep 5'), null)
  assert.ok(PROTEGIDOS_CMD.length > 10)
})
