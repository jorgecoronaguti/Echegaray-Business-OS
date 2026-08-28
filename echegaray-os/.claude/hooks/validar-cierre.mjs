#!/usr/bin/env node
// HOOK DE CIERRE — una tarea no puede terminar en un estado inválido.
//
// Corre en `Stop` (cuando termino de responder) y en `SubagentStop` (cuando termina un agente del
// backlog, dentro de su worktree). Bloquea el cierre si una validación obligatoria falla, y dice
// exactamente qué hay que arreglar.
//
// ═══ LAS TRES COSAS QUE LO HACEN USABLE ═══
//
// 1. SÓLO VALIDA LO QUE CAMBIÓ, Y SÓLO LO QUE APLICA. Si en la sesión no se tocó código, no corre
//    nada: preguntar "¿cómo viene la caja?" no tiene por qué esperar 8 segundos. Si se tocaron .mjs
//    del orquestador corre la suite; si se tocaron .ts/.tsx corre el typecheck; eslint se corre sólo
//    sobre los archivos cambiados. Un hook que exige validaciones irrelevantes se termina desactivando,
//    y entonces no sirve el día que importa.
//
// 2. NO SE REPITE AL PEDO. Guarda la huella de lo validado (archivo + mtime + tamaño). Si nada cambió
//    desde la última corrida verde, sale en milisegundos. Sin esto, cada respuesta de una conversación
//    larga volvería a correr los mismos 8 segundos sobre el mismo diff.
//
// 3. NO ENTRA EN BUCLE. `Stop` con `decision: block` hace que yo siga trabajando… y al terminar vuelve
//    a disparar `Stop`. La documentación NO define un `stop_hook_active`, así que la recursión se
//    corta acá: se registra el bloqueo y no se vuelve a bloquear por LA MISMA huella. Si arreglo el
//    problema, la huella cambia y el control vuelve a estar activo; si no lo arreglo, no quedo
//    encerrado sin poder decírtelo.
//
// LO QUE NUNCA HACE: no modifica código, no commitea, no pushea, no corre migraciones, no toca datos
// productivos, no llama a ninguna API externa. Es un portero, no un reparador.

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync, statSync, existsSync } from 'node:fs'
import { join, dirname, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const PROY = process.env.CLAUDE_PROJECT_DIR || resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

/**
 * DÓNDE VALIDAR: el worktree en el que se está trabajando, no el proyecto de origen.
 *
 * Es el caso que este sistema existe para soportar. Un agente de /backlog corre dentro de su propio
 * worktree; si el hook mirara siempre `CLAUDE_PROJECT_DIR`, validaría los cambios del proyecto
 * principal —o ninguno— y daría por buena una tarea que ni siquiera revisó. Peor: dos agentes en
 * paralelo se pisarían la caché entre sí.
 *
 * Se toma el `cwd` que trae el evento, y sólo si de verdad es una copia del proyecto (tiene su
 * package.json). Si no, se cae al proyecto de origen.
 */
function baseDeTrabajo(cwd) {
  // EL SUBDIRECTORIO NO SOBRA. En los worktrees de este repo la raíz del worktree NO tiene
  // `package.json` ni `.claude`: el proyecto cuelga un nivel más abajo, en `echegaray-os/`. Sin
  // este segundo intento el hook caía a `CLAUDE_PROJECT_DIR` y validaba el árbol principal —
  // exactamente el caso que este sistema existe para soportar, dando por buena una tarea de un
  // agente que ni siquiera miró.
  for (const c of [cwd, cwd && join(cwd, 'echegaray-os')]) {
    if (c && existsSync(join(c, 'package.json')) && existsSync(join(c, '.claude'))) return c
  }
  return PROY
}

/** Sale sin bloquear. `additionalContext` es informativo: no interrumpe. */
const pasar = (msg) => {
  if (msg) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'Stop', additionalContext: msg } }))
  process.exit(0)
}
/** Bloquea el cierre. `decision: block` me obliga a seguir trabajando en vez de dar por terminado. */
const bloquear = (razon) => {
  process.stdout.write(JSON.stringify({ decision: 'block', reason: razon }))
  process.exit(0)
}

const git = (args, cwd) => {
  try { return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }) } catch { return '' }
}

/**
 * Los archivos que cambiaron en el árbol de trabajo, relativos a la raíz del repositorio.
 * Incluye lo no rastreado: un archivo nuevo sin agregar es tan parte del cambio como uno modificado.
 */
function cambiados(base) {
  const raiz = git(['rev-parse', '--show-toplevel'], base).trim()
  if (!raiz) return { raiz: null, archivos: [] }
  const salida = git(['status', '--porcelain', '--untracked-files=all'], raiz)
  const archivos = salida.split('\n').map((l) => l.slice(3).trim()).filter(Boolean)
    // Un rename viene como "viejo -> nuevo": nos interesa el destino.
    .map((p) => (p.includes(' -> ') ? p.split(' -> ')[1] : p))
    .map((p) => join(raiz, p.replace(/^"|"$/g, '')))
    .filter((p) => existsSync(p))
  return { raiz, archivos }
}

/** Huella del conjunto: si no cambió, no hay nada nuevo que validar. */
/**
 * EL COMMIT ENTRA EN LA HUELLA (28/08/2026) — SIN ESTO, MERGEAR ES INVISIBLE.
 *
 * La huella se calculaba SÓLO con el contenido de los archivos sin commitear. El 28/08 el árbol pasó
 * por ocho merges —nómina, cash flow, candado de tests— y el único archivo sin commitear no se tocó
 * en todo el día: la huella no cambió NUNCA, así que el veredicto rojo guardado se sirvió otra vez en
 * cada cierre, byte por byte idéntico (mismos PIDs, mismos 16844.034634 ms), mientras la suite real
 * corría en verde. Seis avisos seguidos de un fallo que ya no existía.
 *
 * Un veredicto sobre el código tiene que caducar cuando el código cambia, y `HEAD` es lo que dice que
 * cambió. Si no hay git, la huella sigue siendo la de antes: se degrada, no se rompe.
 */
export function huella(archivos, base) {
  let head = ''
  try { head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: base, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() } catch { /* sin git, sólo los archivos */ }
  const files = archivos.map((f) => { try { const s = statSync(f); return `${f}:${s.mtimeMs}:${s.size}` } catch { return `${f}:0` } }).sort().join('|')
  return head ? `${head}|${files}` : files
}

/**
 * ¿EL ROJO ES DEL CÓDIGO O DEL AMBIENTE? Un deadlock de Postgres (40P01) entre dos corridas de tests
 * que atacan la misma base NO es un veredicto sobre el código: el mismo archivo pasa solo. Cachearlo
 * como si lo fuera es lo que convierte un choque de dos minutos en seis avisos de un fallo inexistente.
 *
 * No se ignora —el aviso igual sale— pero no se GUARDA: la próxima vez se vuelve a correr en vez de
 * repetir la foto. Desde que `orq:test` toma un candado por máquina esto debería ser raro; si vuelve
 * a pasar, que cueste una corrida y no una jornada de ruido.
 */
export function esRojoDelAmbiente(salida) {
  return /deadlock detected|40P01|ECONNREFUSED|ETIMEDOUT|too many clients/i.test(String(salida ?? ''))
}

/** Corre un comando y devuelve {ok, salida}. Nunca tira. */
function correr(cmd, args, base) {
  try {
    // EL TOPE INTERNO TIENE QUE SER MENOR QUE EL DEL HOOK, NO AL REVÉS. Con 300 s acá y 420 s en
    // `settings.json`, una suite lenta moría por este `timeout`, `correr()` devolvía `ok:false` y el
    // cierre se bloqueaba por un ROJO FALSO — un test que nunca falló. Hoy: 600 s acá, 900 s allá.
    execFileSync(cmd, args, { cwd: base, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 600000 })
    return { ok: true, salida: '' }
  } catch (e) {
    const txt = `${e.stdout ?? ''}${e.stderr ?? ''}`.trim()
    return { ok: false, salida: txt.split('\n').slice(-25).join('\n') }
  }
}

async function main() {
  const entrada = await new Promise((r) => { let s = ''; process.stdin.on('data', (d) => (s += d)).on('end', () => r(s)) })
  let evento = {}
  try { evento = JSON.parse(entrada || '{}') } catch { /* sin JSON se sigue igual: el control importa más que el metadato */ }

  const BASE = baseDeTrabajo(evento.cwd)
  // La caché cuelga de la base: dos agentes en worktrees distintos no se pisan la huella.
  const CACHE = join(BASE, '.claude', '.cache')
  const HUELLA = join(CACHE, 'ultima-validacion.json')
  const leerHuella = () => { try { return JSON.parse(readFileSync(HUELLA, 'utf8')) } catch { return {} } }
  const guardarHuella = (o) => { try { mkdirSync(CACHE, { recursive: true }); writeFileSync(HUELLA, JSON.stringify(o)) } catch { /* la caché es una optimización, no un requisito */ } }

  const { raiz, archivos } = cambiados(BASE)
  if (!raiz) pasar()

  // ── Sólo el código de ESTA copia del proyecto. ──
  //
  // EL SEPARADOR NO SOBRA: sin él, `startsWith('/…/echegaray-os')` también matchea un directorio
  // hermano llamado `echegaray-os-viejo`, y el hook validaría archivos de otro proyecto.
  const propios = archivos.filter((f) => f === BASE || f.startsWith(BASE + sep))
  const codigo = propios.filter((f) => /\.(mjs|js|cjs|ts|tsx)$/.test(f))
  const sql = propios.filter((f) => /\.sql$/.test(f))
  if (!codigo.length && !sql.length) pasar()

  const h = huella([...codigo, ...sql], BASE)
  const previo = leerHuella()
  // Ya validado y verde con exactamente este contenido: no se repite.
  if (previo.ok && previo.huella === h) pasar()
  // ANTIRRECURSIÓN: ya bloqueé por esta misma huella y no cambió nada. Si volviera a bloquear
  // quedaríamos girando sin que yo pueda contarte qué pasa. Se deja pasar con el aviso.
  if (!previo.ok && previo.huella === h) {
    pasar(`Las validaciones seguían fallando y no cambió nada desde el último intento:\n${previo.detalle ?? ''}\nLo dejo pasar para no quedar en bucle, pero el cambio NO está validado.`)
  }

  // ── Qué corresponde correr, según lo que se tocó ──
  const hayOrq = codigo.some((f) => f.startsWith(join(BASE, 'orquestador') + sep))
  const hayTs = codigo.some((f) => /\.tsx?$/.test(f))
  const fallas = []

  if (hayOrq) {
    const r = correr('npm', ['run', 'orq:test'], BASE)
    if (!r.ok) fallas.push(`✗ npm run orq:test\n${r.salida}`)
  }
  if (hayTs) {
    const r = correr('npm', ['run', 'typecheck'], BASE)
    if (!r.ok) fallas.push(`✗ npm run typecheck\n${r.salida}`)
  }
  if (codigo.length) {
    // eslint SÓLO sobre lo cambiado: sobre el proyecto entero son varios segundos que no aportan nada
    // nuevo sobre archivos que nadie tocó. `--max-warnings` no se fuerza: este repo tiene 38 warnings
    // preexistentes y bloquear por ellos sería castigar a quien no los creó.
    const r = correr('npx', ['eslint', ...codigo], BASE)
    if (!r.ok) fallas.push(`✗ eslint (archivos cambiados)\n${r.salida}`)
  }
  if (sql.length) {
    // Una migración no se APLICA acá — eso toca datos productivos. Sólo se verifica que no esté vacía.
    for (const f of sql) {
      if (!readFileSync(f, 'utf8').trim()) fallas.push(`✗ migración vacía: ${f}`)
    }
  }

  if (!fallas.length) {
    guardarHuella({ ok: true, huella: h, cuando: new Date().toISOString() })
    pasar()
  }

  const detalle = fallas.join('\n\n')
  // Un rojo del ambiente se avisa pero NO se guarda: la próxima vez se vuelve a correr en vez de
  // repetir la foto de un choque que ya pasó. Ver `esRojoDelAmbiente`.
  if (!esRojoDelAmbiente(detalle)) guardarHuella({ ok: false, huella: h, detalle, cuando: new Date().toISOString() })
  bloquear(
    `No puedo dar esto por terminado: hay validaciones que fallan sobre lo que se cambió en esta sesión.\n\n${detalle}\n\n`
    + 'Arreglá esto antes de cerrar. No commitees ni pushees con las validaciones en rojo. '
    + `(evento: ${evento.hook_event_name ?? 'Stop'} · ${codigo.length} archivo(s) cambiados en ${BASE})`,
  )
}

// GUARDA DE PUNTO DE ENTRADA: sin esto, importar el módulo para probarlo CORRE el hook y se queda
// esperando stdin para siempre. `pathToFileURL` y no `new URL(import.meta.url).pathname`, que no
// decodifica los espacios de una ruta — trampa ya pagada en este repo.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => process.exit(0)) // Un hook roto NUNCA puede trabar la sesión.
}
