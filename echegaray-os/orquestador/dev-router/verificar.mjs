/**
 * verificar.mjs — EL VERIFICADOR INDEPENDIENTE.
 *
 * Ninguna tarea se acepta porque el modelo diga que terminó. El modelo propone; acá se prueba.
 * La evidencia es del EFECTO: el comando, su código de salida y su cola. Que el modelo diga
 * «listo» no es evidencia de nada.
 *
 * PIRÁMIDE, y se sube sólo lo que el riesgo pida (regla del repo):
 *   mientras se itera  → el test del archivo tocado (`node --test`, segundos)
 *   antes de dar por hecho → typecheck y el lint del área
 *   antes de mergear  → la suite del dominio
 * `npm run orq:test` completo y `build` NO se corren acá: tumban Postgres y el dueño opera.
 * Que eso sea una limitación declarada, no un silencio.
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
const ejecutar = promisify(execFile)

const COLA = 25

async function correr(cmd, args, { cwd, timeoutMs = 300_000, nombre }) {
  const t0 = Date.now()
  try {
    const { stdout, stderr } = await ejecutar(cmd, args, { cwd, timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024, encoding: 'utf8' })
    return { nombre, verde: true, codigo: 0, ms: Date.now() - t0, cola: cola(stdout, stderr), comando: `${cmd} ${args.join(' ')}` }
  } catch (e) {
    return { nombre, verde: false, codigo: e.code ?? -1, ms: Date.now() - t0, cola: cola(e.stdout, e.stderr), comando: `${cmd} ${args.join(' ')}` }
  }
}

/** La COLA de la salida, no la salida: una salida cruda entra al contexto entera y se queda. */
function cola(out = '', err = '') {
  const t = `${out || ''}${err ? `\n[stderr]\n${err}` : ''}`.trimEnd()
  const l = t.split('\n')
  return l.length <= COLA ? t : `…(${l.length - COLA} líneas antes)…\n${l.slice(-COLA).join('\n')}`
}

/** El diff de lo que se cambió. Es la primera evidencia y la más barata. */
export const diff = (cwd) => correr('git', ['diff', '--stat', '--'], { cwd, nombre: 'diff' })
export const diffCompleto = (cwd) => correr('git', ['diff', '--'], { cwd, nombre: 'diff-completo', timeoutMs: 60_000 })

/** Tests DIRIGIDOS por archivo. Nunca la suite entera. */
export const tests = (cwd, archivos) =>
  correr('node', ['--test', '--test-reporter=dot', ...archivos], { cwd, nombre: `tests(${archivos.length})` })

export const typecheck = (cwd) => correr('npm', ['run', '--silent', 'typecheck'], { cwd, nombre: 'typecheck' })

/** Lint del ÁREA, no del repo: `eslint .` son 33 s y no agrega certeza sobre un archivo. */
export const lint = (cwd, archivos) =>
  correr('npx', ['--no-install', 'eslint', '--no-warn-ignored', ...archivos], { cwd, nombre: `lint(${archivos.length})` })

/**
 * Corre el plan de verificación de una tarea y devuelve el veredicto.
 * Corta en el primer rojo: el feedback concreto del primer fallo es lo que sirve para reparar;
 * acumular seis rojos derivados del mismo error es ruido.
 */
export async function verificar(cwd, plan = []) {
  const pasos = []
  for (const p of plan) {
    const r = await p()
    pasos.push(r)
    if (!r.verde) return { verde: false, pasos, fallo: r }
  }
  return { verde: true, pasos, fallo: null }
}

/** El plan estándar de una tarea que toca código con tests propios. */
export function planEstandar(cwd, { archivosTest = [], archivosLint = [], conTypecheck = true } = {}) {
  const plan = []
  if (archivosTest.length) plan.push(() => tests(cwd, archivosTest))
  if (conTypecheck) plan.push(() => typecheck(cwd))
  if (archivosLint.length) plan.push(() => lint(cwd, archivosLint))
  return plan
}

/**
 * SINTAXIS DE UN .ts SIN node_modules.
 *
 * Node 24 hace strip de tipos nativo, así que ejecutar el archivo distingue lo que importa:
 * si el archivo está roto sale `SyntaxError`; si está sano y sólo le faltan sus dependencias
 * sale `ERR_MODULE_NOT_FOUND`. Es un typecheck pobre —no verifica TIPOS— y por eso no se
 * presenta como typecheck: verifica que el archivo siga siendo código válido.
 * Cuando hay node_modules, el que manda es `typecheck()`.
 */
export async function sintaxisTS(cwd, archivo) {
  const t0 = Date.now()
  const r = await correr('node', [archivo], { cwd, nombre: `sintaxis(${archivo})`, timeoutMs: 60_000 })
  const roto = /SyntaxError|TypeError: Unexpected|Unexpected token/.test(r.cola)
  return { nombre: `sintaxis(${archivo})`, verde: !roto, codigo: roto ? 1 : 0, ms: Date.now() - t0,
    comando: `node ${archivo}`, cola: roto ? r.cola : 'sin SyntaxError (las dependencias faltantes no cuentan)' }
}
