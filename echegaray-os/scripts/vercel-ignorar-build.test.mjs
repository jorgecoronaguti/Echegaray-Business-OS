import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, execSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const GUION = fileURLToPath(new URL('./vercel-ignorar-build.sh', import.meta.url))

/**
 * Arma un repo de mentira con DOS commits y devuelve qué decidió el script sobre el segundo.
 * El script se copia adentro, en `scripts/`, porque se ubica solo por su propia ruta: probar una
 * copia en otro lado probaría otra cosa.
 * @returns {number} el código de salida: 0 = saltar el build, 1 = construir.
 */
function decisionSobre(archivosDelSegundoCommit) {
  const repo = mkdtempSync(join(tmpdir(), 'ignorar-build-'))
  const app = join(repo, 'echegaray-os')
  mkdirSync(join(app, 'scripts'), { recursive: true })
  const copia = join(app, 'scripts', 'vercel-ignorar-build.sh')
  copyFileSync(GUION, copia)
  chmodSync(copia, 0o755)
  const git = (...a) => execFileSync('git', ['-C', repo, ...a], { stdio: 'pipe' })
  git('init', '-q')
  git('config', 'user.email', 't@t')
  git('config', 'user.name', 't')
  mkdirSync(join(app, 'src'), { recursive: true })
  writeFileSync(join(app, 'src', 'base.ts'), 'export const x = 1\n')
  git('add', '-A')
  git('commit', '-qm', 'base')

  for (const [ruta, texto] of Object.entries(archivosDelSegundoCommit)) {
    const destino = join(app, ruta)
    mkdirSync(dirname(destino), { recursive: true })
    writeFileSync(destino, texto)
  }
  git('add', '-A')
  git('commit', '-qm', 'segundo')

  try {
    execSync('bash scripts/vercel-ignorar-build.sh', { cwd: app, stdio: 'pipe' })
    return 0
  } catch (e) {
    return e.status
  }
}

// El contrato de Vercel: 0 salta, 1 construye. Si alguien invierte los `exit`, estos dos se ponen
// rojos y ninguna otra cosa lo detectaría: en Vercel el síntoma sería "la web no se actualiza".
test('un commit que sólo toca tests/ no despliega', () => {
  assert.equal(decisionSobre({ 'tests/algo.spec.ts': 'x\n' }), 0)
})

test('un commit que toca src/ SÍ despliega', () => {
  assert.equal(decisionSobre({ 'src/pantalla.tsx': 'export default () => null\n' }), 1)
})

test('capturas, documentación, migraciones y .md juntas siguen sin desplegar', () => {
  assert.equal(
    decisionSobre({
      'qa-shots/captura.png': 'PNG',
      'docs/engineering/NOTA.md': '# nota\n',
      'supabase/migrations/20260909_x.sql': 'select 1;\n',
      'README.md': 'hola\n',
      'src/features/x/servicio.test.ts': 'test\n',
    }),
    0,
  )
})

// La trampa que paga este test: `orquestador/` parece backend puro, pero 23 archivos de `src/` lo
// importan. Si alguien lo agrega a la lista de exclusiones, el cambio deja de publicarse y la web
// se queda con código viejo sin ningún error a la vista.
test('orquestador/ despliega: src lo importa y entra al bundle', () => {
  assert.equal(decisionSobre({ 'orquestador/lib/obra-operacion.mjs': 'export const y = 2\n' }), 1)
})

test('un cambio mezclado —captura MÁS código— despliega', () => {
  assert.equal(decisionSobre({ 'qa-shots/c.png': 'PNG', 'src/pantalla.tsx': 'export default null\n' }), 1)
})

// Una ruta que la lista no conoce tiene que construir. Es la diferencia entre esta implementación y
// la de lista blanca: ahí, lo desconocido se saltaba en silencio.
test('una ruta desconocida construye, no se salta', () => {
  assert.equal(decisionSobre({ 'middleware.ts': 'export function middleware() {}\n' }), 1)
})
