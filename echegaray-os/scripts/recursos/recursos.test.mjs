// Pruebas LIVIANAS del portero: clasificación de comandos y de procesos. No levantan nada pesado.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { readdirSync } from 'node:fs'
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

test('el separador de tuberías entre comillas es un argumento, no un tramo', () => {
  // El caso que lo delató: el `\|` de una alternancia de grep partía el comando y el segundo pedazo
  // empezaba con `eslint"`, así que el hook frenaba una lectura. Lo de abajo es lo que se escribe acá
  // todos los días buscando en el propio repositorio.
  for (const c of [
    'grep -n "eslintConfig\\|eslint" package.json',
    'grep "eslint" archivo',
    "grep -rn 'next dev' src/",
    'echo "npx playwright test"',
    'rg "tsc --noEmit"',
    'grep -rn "npm run build || npm run dev" docs/',
    "rg 'playwright test;npx tsc' .",
    'grep -n "(npx eslint .)" notas.md',
  ]) assert.equal(frena(c), false, `no debía frenar: ${c}`)

  // Una comilla DOBLE sin cerrar no tira, y cae al particionado conservador: frena. Es el precio
  // aceptado —bash mismo rechaza esa línea— para que una comilla suelta no apague el análisis.
  assert.doesNotThrow(() => hook('grep -n "eslintConfig\\|eslint package.json'))
  assert.equal(frena('grep -n "eslintConfig\\|eslint package.json'), true)

  // Y la puerta no se abre al revés: lo pesado DESPUÉS de una tubería real se sigue frenando.
  for (const c of [
    'cat x | npx tsc',
    'grep -rn "hola" src/ | npx eslint .',
    'echo "buscando" && npx playwright test',
    "grep 'x' f || npm run typecheck",
    'cat "un archivo.txt" | npx tsc --noEmit',
  ]) assert.equal(frena(c), true, `debía frenar: ${c}`)
})

test('auditoría 18/09: una comilla sin cerrar no puede apagar el análisis del resto del comando', () => {
  // Los cinco que la primera versión del partidor dejaba pasar y `main` frenaba (o que nunca se miraron).
  for (const c of [
    "echo hola  # no anduvo, don't\nnpx tsc --noEmit",           // el apóstrofo de un comentario
    "$'no\\'anduvo'; npx tsc --noEmit",                            // la barra escapa en $'…'
    'bash -c "echo \\"corriendo\\" && npm run typecheck"',          // comillas escapadas en bash -c
    'eval "cd app; npm run typecheck"',                              // eval lleva un comando adentro
    'eval "npx tsc"',
  ]) assert.equal(frena(c), true, `debía frenar: ${JSON.stringify(c)}`)

  // Agujeros que ya estaban en main, cerrados donde fue barato.
  for (const c of [
    'echo `npx tsc --noEmit`',
    'echo "$(npx tsc --noEmit)"',
    'X=$(npm run typecheck 2>&1)',
    "find . -name '*.ts' | xargs npx tsc",
    'find . | xargs -0 -n1 npx eslint',
  ]) assert.equal(frena(c), true, `debía frenar: ${JSON.stringify(c)}`)

  // Y lo ganado no se pierde: comillas balanceadas, texto entre simples, otra máquina.
  for (const c of [
    'grep -n "eslintConfig\\|eslint" package.json',
    'grep -n "eslintConfig\\|eslint" package.json  # don\'t',   // apóstrofo suelto, pero las dobles cierran
    "grep -n 'usar `npx tsc` acá' README.md",
    "rg '$(npx tsc)' docs/",
    'ssh vm "cd app; npm run typecheck"',                          // corre en OTRA máquina: no es de esta VM
    'echo $((3 + 4))',
  ]) assert.equal(frena(c), false, `no debía frenar: ${JSON.stringify(c)}`)
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

// ════════════════════════════════════════════════════════════════════════════════════════════════
// BLOQUEO MUTUO — la prueba del 18/09/2026. Son procesos `ecos` REALES sobre cupos REALES; lo único
// simulado es el trabajo (`sleep`, `touch`), porque el defecto no estaba en Next ni en Playwright:
// estaba en el reparto de turnos. Corre sobre un ECOS_DIR propio para no tocar los cupos de nadie.
// ════════════════════════════════════════════════════════════════════════════════════════════════
import { spawn, execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, mkdirSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'

const ECOS = join(AQUI, 'ecos')
const POLITICA_DE_PRUEBA = [
  // Los cupos siguen siendo los reales (1 y 1 y 1): el bloqueo se reproduce CON los cupos del dueño.
  'ECOS_MAX_NEXT=1', 'ECOS_MAX_BROWSER=1', 'ECOS_MAX_VALIDACION=1',
  // La máquina no debe intervenir: lo que se prueba es el turno, no la memoria de hoy.
  'ECOS_MIN_MB_NEXT=0', 'ECOS_MIN_MB_BROWSER=0', 'ECOS_MIN_MB_VALIDACION=0',
  'ECOS_MAX_SWAP_PCT=100', 'ECOS_MAX_CARGA=999', 'ECOS_EMERGENCIA_MB=0', 'ECOS_EMERGENCIA_SWAP_PCT=100',
  'ECOS_ESPERA_MAX=25', 'ECOS_AVISO_CADA=2',
].join('\n') + '\n'

function banco() {
  const dir = mkdtempSync(join(tmpdir(), 'ecos-prueba-'))
  for (const s of ['slots', 'cola', 'registro', 'log']) mkdirSync(join(dir, s), { recursive: true })
  writeFileSync(join(dir, 'politica.env'), POLITICA_DE_PRUEBA)
  return dir
}
// Cada `dueno` distinto es una sesión distinta (un agente distinto). Sin esto los tres procesos de la
// prueba comparten la cadena de padres y serían la misma sesión, que no es el caso real.
// `ECOS_CLASES`/`ECOS_ACTIVO` se BORRAN: esta misma suite suele correr dentro de un `ecos validacion`,
// y por reentrancia los `ecos` de la prueba no pedirían ningún cupo — no probarían nada.
function lanzar(dir, dueno, args) {
  const env = { ...process.env, ECOS_DIR: dir, ECOS_RAIZ: join(dir, 'raiz'), ECOS_DUENO: String(dueno) }
  delete env.ECOS_CLASES; delete env.ECOS_ACTIVO; delete env.ECOS_TEST_CONCURRENCIA
  return spawn(ECOS, args, { env, stdio: ['ignore', 'pipe', 'pipe'] })
}
const dormir = (ms) => new Promise((r) => setTimeout(r, ms))
async function hasta(cond, limiteMs) {
  const t0 = Date.now()
  while (Date.now() - t0 < limiteMs) { if (cond()) return true; await dormir(120) }
  return false
}
const candadoLibre = (f) => { try { execFileSync('flock', ['-n', f, 'true'], { stdio: 'ignore' }); return true } catch { return false } }
const matar = (...ps) => { for (const p of ps) { try { p.kill('SIGKILL') } catch { /* ya murió */ } } }

test('espera circular: un navegador no queda atrapado detrás de un e2e que espera el servidor de MI sesión', async (t) => {
  const dir = banco(); t.after(() => rmSync(dir, { recursive: true, force: true }))
  const marca = join(dir, 'corrio')
  const SESION_A = process.pid, SESION_B = 1

  // A (sesión A): servidor de desarrollo de vida larga. Toma `next` y no lo suelta.
  const a = lanzar(dir, SESION_A, ['next', '--', 'sleep', '60'])
  assert.ok(await hasta(() => !candadoLibre(join(dir, 'slots', 'next.1.lock')), 12000), 'A no llegó a tomar el cupo next')

  // B (otra sesión): pide e2e = next + browser. Su ticket queda PRIMERO en la cola y no puede arrancar,
  // porque `next` lo retiene A.
  const b = lanzar(dir, SESION_B, ['e2e', '--', 'sleep', '1'])
  assert.ok(await hasta(() => readdirSync(join(dir, 'cola')).length >= 1, 12000), 'B no llegó a hacer cola')

  // C (sesión A, la misma que tiene el servidor): pide el navegador. Antes del arreglo cedía el turno
  // al ticket de B —comparten `browser`— y se cerraba el ciclo: los tres esperando, la VM ociosa.
  const c = lanzar(dir, SESION_A, ['browser', '--', 'touch', marca])
  let salidaC = ''; c.stderr.on('data', (d) => (salidaC += d))
  const corrio = await hasta(() => existsSync(marca), 10000)
  matar(a, b, c)
  assert.ok(corrio, `el navegador NO corrió en 10s: sigue la espera circular.\n${salidaC}`)
})

test('un intento que devuelve el cupo no deja sello: el panel no puede decir que lo tiene quien está en la cola', async (t) => {
  const dir = banco(); t.after(() => rmSync(dir, { recursive: true, force: true }))
  const a = lanzar(dir, 1, ['next', '--', 'sleep', '60'])
  assert.ok(await hasta(() => !candadoLibre(join(dir, 'slots', 'next.1.lock')), 12000), 'A no tomó next')
  // Este pide browser+next: consigue el candado de `browser`, no consigue `next`, y lo devuelve.
  const b = lanzar(dir, 2, ['e2e', '--', 'sleep', '1'])
  assert.ok(await hasta(() => readdirSync(join(dir, 'cola')).length >= 1, 12000), 'B no hizo cola')
  await dormir(1500)

  assert.equal(candadoLibre(join(dir, 'slots', 'browser.1.lock')), true, 'el candado de browser debería estar libre')
  const panel = execFileSync('node', [join(AQUI, 'estado.mjs')], { env: { ...process.env, ECOS_DIR: dir }, encoding: 'utf8' })
  matar(a, b)
  const lineaBrowser = panel.split('\n').find((l) => l.startsWith('cupo browser'))
  assert.match(lineaBrowser, /^cupo browser\s+0\/1/, `el panel informa tomado un cupo que está libre:\n${panel}`)
  assert.ok(!existsSync(join(dir, 'slots', 'browser.1.quien')), 'quedó un sello de un cupo que se devolvió')
})

test('el diagnóstico al agotar la espera nombra a quien retiene el cupo, no inventa falta de recursos', async (t) => {
  const dir = banco(); t.after(() => rmSync(dir, { recursive: true, force: true }))
  writeFileSync(join(dir, 'politica.env'), POLITICA_DE_PRUEBA.replace('ECOS_ESPERA_MAX=25', 'ECOS_ESPERA_MAX=4'))
  const a = lanzar(dir, 1, ['validacion', '--', 'sleep', '60'])
  assert.ok(await hasta(() => !candadoLibre(join(dir, 'slots', 'validacion.1.lock')), 12000), 'A no tomó validacion')
  const b = lanzar(dir, 2, ['validacion', '--', 'true'])
  let err = ''; b.stderr.on('data', (d) => (err += d))
  const codigo = await new Promise((r) => b.on('exit', r))
  matar(a)
  assert.equal(codigo, 75)
  assert.match(err, /lo retiene pid \d+/, `el diagnóstico no dice quién tiene el cupo:\n${err}`)
  assert.match(err, new RegExp(`lo retiene pid ${a.pid}`), `no nombra al retenedor real (pid ${a.pid}):\n${err}`)
  assert.match(err, /la máquina: libre \d+ MB/, `no muestra que la máquina no era el problema:\n${err}`)
})

test('un cupo cuyo dueño muere de golpe queda libre, y el sello huérfano no engaña al panel ni sobrevive al barrido', async (t) => {
  const dir = banco(); t.after(() => rmSync(dir, { recursive: true, force: true }))
  const a = lanzar(dir, 1, ['validacion', '--', 'sleep', '30'])
  const lock = join(dir, 'slots', 'validacion.1.lock')
  assert.ok(await hasta(() => !candadoLibre(lock), 12000), 'A no tomó validacion')
  a.kill('SIGKILL')                                   // sin trap, sin limpieza: el peor caso
  assert.ok(await hasta(() => candadoLibre(lock), 5000), 'el candado no se soltó al morir su dueño')
  assert.ok(existsSync(join(dir, 'slots', 'validacion.1.quien')), 'el caso a probar es justamente que quede el sello')

  const panel = execFileSync('node', [join(AQUI, 'estado.mjs')], { env: { ...process.env, ECOS_DIR: dir }, encoding: 'utf8' })
  assert.match(panel.split('\n').find((l) => l.startsWith('cupo validacion')), /0\/1/, `el panel cree en un sello sin candado:\n${panel}`)

  execFileSync('node', [join(AQUI, 'barrer.mjs'), '--motivo', 'prueba'], { env: { ...process.env, ECOS_DIR: dir }, encoding: 'utf8' })
  assert.ok(!existsSync(join(dir, 'slots', 'validacion.1.quien')), 'el barrido no limpió el sello huérfano')

  // Y el cupo se puede volver a tomar: es lo que prueba que quedó libre de verdad.
  const marca = join(dir, 'ok')
  const b = lanzar(dir, 2, ['validacion', '--', 'touch', marca])
  assert.ok(await hasta(() => existsSync(marca), 10000), 'el cupo no se pudo volver a tomar')
  matar(b)
})

test('el ticket de un proceso muerto no le quita el turno a nadie', async (t) => {
  const dir = banco(); t.after(() => rmSync(dir, { recursive: true, force: true }))
  // Un ticket viejísimo de un pid que no existe, pidiendo la misma clase.
  const fantasma = join(dir, 'cola', `1000000000000000000-validacion-4194303`)
  writeFileSync(fantasma, '')
  const marca = join(dir, 'ok')
  const b = lanzar(dir, 2, ['validacion', '--', 'touch', marca])
  assert.ok(await hasta(() => existsSync(marca), 10000), 'un ticket de un muerto trabó el turno')
  matar(b)
  assert.ok(!existsSync(fantasma), 'el ticket del muerto no se limpió')
})

test('cuatro pedidos simultáneos de la misma clase no se pisan: el cupo de uno es de uno', async (t) => {
  const dir = banco(); t.after(() => rmSync(dir, { recursive: true, force: true }))
  const bitacora = join(dir, 'bitacora')
  // Arrancan a la vez, a propósito: si el ticket o el candado tuvieran una carrera, dos entrarían juntos.
  const ps = [1, 2, 3, 4].map((n) => lanzar(dir, n, ['validacion', '--', 'sh', '-c', `echo entra-${n} >> ${bitacora}; sleep 0.4; echo sale-${n} >> ${bitacora}`]))
  await Promise.all(ps.map((p) => new Promise((r) => p.on('exit', r))))
  const pasos = readFileSync(bitacora, 'utf8').trim().split('\n')
  assert.equal(pasos.length, 8, `no corrieron los cuatro: ${pasos.join(' ')}`)
  for (let i = 0; i < pasos.length; i += 2) {
    assert.match(pasos[i], /^entra-/, `dos tareas adentro a la vez: ${pasos.join(' ')}`)
    assert.equal(pasos[i + 1], pasos[i].replace('entra-', 'sale-'), `una tarea entró antes de que saliera la anterior: ${pasos.join(' ')}`)
  }
})
