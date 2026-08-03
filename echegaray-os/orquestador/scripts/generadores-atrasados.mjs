#!/usr/bin/env node
// ¿ALGÚN GENERADOR DE SHEETS DE `main` ESTÁ ATRASADO RESPECTO DE UNA RAMA SIN MERGEAR?
//
// ═══ POR QUÉ EXISTE (03/08) ═══
//
// `jornales-pestana.mjs` en `main` no tenía UNA SOLA mención del bloque "3 · Dirección". La pestaña
// viva SÍ lo tenía, con tres retiros de $3.000.000 cargados ese mismo día. Correr el generador de
// `main` contra el Sheet real se los borraba al dueño — y no habría fallado: habría reescrito la
// grilla que él conoce, que es una grilla vieja, y habría informado que salió todo bien.
//
// Eso se descubrió DE CASUALIDAD, comparando ramas a mano antes de reactivar el pipeline. Un
// mecanismo que destruye datos y se detecta por casualidad no está controlado. Esto lo mide.
//
// ═══ POR QUÉ NO ALCANZA `git branch --merged` ═══
//
// Estos generadores no se ponen al día mergeando la rama entera: la rama maximal del linaje traía 142
// commits con toda la infraestructura de Mattermost adentro, y lo que hacía falta eran veinticuatro
// archivos. Se hace un 3-way POR ARCHIVO, y eso no deja registro en la historia: la rama sigue "sin
// mergear" para git aunque su trabajo ya esté incorporado. Contar commits daría rojo para siempre, y
// un aviso que siempre está rojo se ignora — que es como muere un control.
//
// ═══ POR QUÉ LA UNIDAD ES EL BLOB Y NO EL COMMIT ═══
//
// Un `git log -- archivo` cuenta también los MERGES de main hacia la rama, que no aportan trabajo
// nuevo. Medido acá: 30 archivos "con trabajo pendiente" de los cuales la mitad eran merges. El
// contenido no miente: el blob de un archivo en una rama o es uno que ya se miró, o no lo es.
//
// El registro (`generadores-revisados.json`) dice, por archivo, HASTA QUÉ COMMIT se revisó. Una
// versión de rama cuenta como revisada si su blob es alguno de los que ese archivo tuvo en la
// historia de ese commit. Es a la vez legible ("revisado hasta 7c7cc10") y exacto (comparación de
// contenido), y se puede auditar: `git cat-file -p <blob>` muestra qué se miró.
//
// ═══ CÓMO SE USA ═══
//
//   node orquestador/scripts/generadores-atrasados.mjs                   inventario completo
//   node orquestador/scripts/generadores-atrasados.mjs --archivo <ruta>  un solo generador
//
// Sale con código 1 mientras quede trabajo de rama sin incorporar. Es el chequeo previo a correr el
// pipeline: si esto está rojo, un generador puede borrarle datos al dueño.

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

/** Corre git. `null` cuando falló — la diferencia con `''` es la que evita dar por bueno lo que no se pudo mirar. */
const git = (args) => {
  try {
    return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024, timeout: 120000 }).trim()
  } catch { return null }
}

// LAS RUTAS SON DEL REPO, NO DEL DIRECTORIO DESDE EL QUE SE CORRE. `ls-tree` y el pathspec de `log` se
// interpretan desde el CWD; `git show rev:ruta` SIEMPRE quiere la ruta desde la raíz. Mezclar las dos
// convenciones daba "0 generadores revisados" y un ✔ que no había mirado nada.
const RAIZ_APP = git(['rev-parse', '--show-prefix']) ?? ''

/** El prefijo del orquestador, tal como lo nombra el repo desde su raíz. */
export const PREFIJO_ORQ = `${RAIZ_APP}orquestador/`

/** Quita el prefijo de la app: las rutas se informan como las escribe una persona. */
export const corto = (archivo) => (RAIZ_APP && archivo.startsWith(RAIZ_APP) ? archivo.slice(RAIZ_APP.length) : archivo)

/**
 * Las marcas de que un archivo ESCRIBE en un Sheet.
 *
 * `WRITE_SCOPES` y `escribirPreservando` están a propósito: casi ningún generador llama a la API de
 * Sheets directamente —escriben por el portón de `preservar-anotaciones.mjs`— así que un patrón que
 * sólo buscara `values.update` dejaba afuera justo a los peores. Con el patrón angosto este script
 * veía 19 escritores; con éste ve 67, y `jornales-pestana.mjs` —el caso que motivó todo— estaba
 * entre los 48 que faltaban.
 */
export const MARCAS_DE_ESCRITURA = [
  'WRITE_SCOPES', 'escribirPreservando', 'values.update', 'values.batchUpdate', 'values.append',
  'spreadsheets.batchUpdate', 'escribirRango', 'escribirValores', 'updateCells', 'deleteDimension',
]

/** ¿Este fuente escribe Sheets? Puro. */
export function escribeSheets(fuente) {
  if (typeof fuente !== 'string') return false
  return MARCAS_DE_ESCRITURA.some((m) => fuente.includes(m))
}

/** Ramas que no cuentan: worktrees efímeros de agentes y ramas de trabajo del orquestador. */
const RUIDO = /^worktree-agent-|^worktree-|^orq\/code_change\//

/** El registro de lo revisado, versionado al lado de este script. */
export const RUTA_REGISTRO = path.join(path.dirname(fileURLToPath(import.meta.url)), 'generadores-revisados.json')

/** Lee el registro. Si no se puede leer, vacío: nada revisado ⇒ todo se reporta (falla cerrado). */
export function leerRegistro(ruta = RUTA_REGISTRO) {
  try { return JSON.parse(readFileSync(ruta, 'utf8')).archivos ?? {} } catch { return {} }
}

/**
 * EL VEREDICTO. Es la única decisión del script, y por eso es pura y se prueba sola.
 *
 * `descartado` NO es "está bien": es "se miró y se decidió no traerlo, por este motivo". Sigue
 * contando como pendiente para el pipeline, porque la diferencia con main sigue existiendo. Lo que
 * cambia es que el informe dice POR QUÉ en vez de "nadie lo miró".
 *
 * `motivoRama` es la declaración por RAMA: sirve para una rama viva de otra tanda, que se conoce y no
 * se toca. Nunca convierte el hallazgo en verde — sólo le pone nombre.
 *
 * @param {{cubierto:boolean, decision?:string, motivoRama?:string|null}} h
 * @returns {'incorporado'|'descartado'|'pendiente'|'SIN REVISAR'}
 */
export function veredicto({ cubierto, decision, motivoRama }) {
  if (!cubierto) return motivoRama ? 'pendiente' : 'SIN REVISAR'
  if (decision === 'descartado') return 'descartado'
  if (decision === 'pendiente') return 'pendiente'
  return 'incorporado'
}

/** ¿El veredicto frena el pipeline? Puro. Todo lo que no se incorporó, con o sin motivo. */
export const frenaElPipeline = (v) => v !== 'incorporado'

/** ¿Y además nadie lo miró? Ése es el que no puede quedar así. Puro. */
export const nadieLoMiro = (v) => v === 'SIN REVISAR'

/** Ramas locales que NO están contenidas en `base`, sin el ruido de los worktrees de agentes. */
export function ramasSinMergear(base = 'main') {
  const todas = (git(['for-each-ref', '--format=%(refname:short)', 'refs/heads/']) ?? '').split('\n').filter(Boolean)
  return todas.filter((b) => b !== base && !RUIDO.test(b) && git(['merge-base', '--is-ancestor', b, base]) === null)
}

/** Los archivos de `orquestador/` que escriben Sheets, según el árbol de `base`. */
export function escritoresDeSheets(base = 'main', prefijo = PREFIJO_ORQ) {
  const lista = (git(['ls-tree', '-r', '--full-tree', '--name-only', base, prefijo]) ?? '').split('\n')
  return lista.filter((f) => f.endsWith('.mjs') && !f.endsWith('.test.mjs') && escribeSheets(git(['show', `${base}:${f}`])))
}

/**
 * Todos los blobs que `archivo` tuvo alguna vez en la historia de `rev`.
 *
 * `--full-history` porque la simplificación PODA commits cuyo cambio un merge posterior dejó sin
 * efecto: acá eso sería un falso negativo, y un falso negativo termina en un generador viejo
 * corriendo contra el Sheet real. `:(top)` porque el pathspec de `log`/`rev-list` es relativo al CWD
 * y estas rutas son del repo entero — sin él el recorrido daba vacío y todo parecía revisado.
 */
export function blobsEnLaHistoria(rev, archivo) {
  const commits = (git(['rev-list', '--full-history', rev, '--', `:(top)${archivo}`]) ?? '').split('\n').filter(Boolean)
  const blobs = new Set()
  for (const c of commits) { const b = git(['rev-parse', `${c}:${archivo}`]); if (b) blobs.add(b) }
  return blobs
}

/** ¿La rama tiene algún commit que toque `archivo` y que `base` no tenga? */
export function ramaTieneTrabajo(base, rama, archivo) {
  return Boolean(git(['log', '--full-history', '-1', '--format=%H', `${base}..${rama}`, '--', `:(top)${archivo}`]))
}

/**
 * Compara un archivo contra todas las ramas. Hay hallazgo cuando se cumplen LAS DOS condiciones:
 *
 *   · el CONTENIDO difiere del de `base` — si coincide, ese trabajo ya está; y
 *   · la rama tiene COMMITS sobre el archivo que `base` no tiene.
 *
 * Hacen falta las dos, y cada una tapa el ruido de la otra. Sólo contenido: entran los 12 archivos
 * donde el que avanzó fue MAIN y la rama quedó vieja — ahí no hay nada que traer. Sólo commits:
 * entran los merges de main hacia la rama, que "tocan" el archivo sin aportar una línea.
 */
export function revisarArchivo(archivo, ramas, base = 'main', registro = leerRegistro()) {
  const enBase = git(['rev-parse', `${base}:${archivo}`])
  const distintas = ramas
    .map((rama) => ({ rama, blob: git(['rev-parse', `${rama}:${archivo}`]) }))
    .filter((x) => x.blob && x.blob !== enBase && ramaTieneTrabajo(base, x.rama, archivo))
  if (!distintas.length) return []
  const entrada = registro[corto(archivo)] ?? {}
  // `revisadoHasta` admite varios puntos: un archivo puede haberse revisado contra más de un linaje.
  const puntos = [entrada.revisadoHasta].flat().filter(Boolean)
  const revisados = new Set(puntos.flatMap((p) => [...blobsEnLaHistoria(p, archivo)]))
  return distintas.map(({ rama, blob }) => {
    const motivoRama = entrada.pendientes?.[rama] ?? null
    const v = veredicto({ cubierto: revisados.has(blob), decision: entrada.decision, motivoRama })
    return { archivo: corto(archivo), rama, blob: blob.slice(0, 7), veredicto: v, motivo: motivoRama ?? entrada.motivo ?? null }
  })
}

/** El inventario completo. `soloArchivo` limita a un generador (chequeo previo a correrlo). */
export function revisar({ base = 'main', soloArchivo = null, registro = leerRegistro() } = {}) {
  const ramas = ramasSinMergear(base)
  let archivos = escritoresDeSheets(base)
  if (soloArchivo) {
    const buscado = soloArchivo.replace(/^\.?\//, '')
    archivos = archivos.filter((f) => f.endsWith(buscado))
  }
  return { ramas, archivos, hallazgos: archivos.flatMap((f) => revisarArchivo(f, ramas, base, registro)) }
}

/** Agrupa por archivo. Manda el peor veredicto de sus ramas: lo que nadie miró tapa a lo declarado. */
export function resumir(hallazgos) {
  const porArchivo = new Map()
  for (const h of hallazgos) {
    if (!porArchivo.has(h.archivo)) porArchivo.set(h.archivo, [])
    porArchivo.get(h.archivo).push(h)
  }
  return [...porArchivo.entries()].map(([archivo, hs]) => {
    const crudos = hs.filter((h) => nadieLoMiro(h.veredicto))
    const frenan = hs.filter((h) => frenaElPipeline(h.veredicto))
    const elegidos = crudos.length ? crudos : (frenan.length ? frenan : hs)
    return { archivo, veredicto: elegidos[0].veredicto, ramas: elegidos.map((h) => h.rama), motivo: elegidos[0].motivo }
  }).sort((a, b) => a.archivo.localeCompare(b.archivo))
}

const MARCA = { 'SIN REVISAR': '✖', descartado: '📝', pendiente: '⏳' }

function informar(resumen) {
  const frenan = resumen.filter((r) => frenaElPipeline(r.veredicto))
  for (const r of frenan) {
    console.log(`\n${MARCA[r.veredicto] ?? '·'} ${r.veredicto}  ${r.archivo}`)
    console.log(`   ramas: ${r.ramas.slice(0, 6).join(', ')}${r.ramas.length > 6 ? ` (+${r.ramas.length - 6})` : ''}`)
    if (r.motivo && r.veredicto !== 'SIN REVISAR') console.log(`   ${r.motivo}`)
  }
  const crudos = frenan.filter((r) => nadieLoMiro(r.veredicto)).length
  console.log(`\nincorporados: ${resumen.length - frenan.length} · declarados con motivo: ${frenan.length - crudos} · SIN REVISAR: ${crudos}`)
  return frenan.length
}

function main() {
  const argv = process.argv.slice(2)
  const i = argv.indexOf('--archivo')
  const { ramas, archivos, hallazgos } = revisar({ soloArchivo: i >= 0 ? argv[i + 1] : null })
  console.log(`generadores de Sheets revisados: ${archivos.length} · ramas sin mergear: ${ramas.length}`)
  if (!archivos.length) { console.error('✖ no encontré ningún generador: el prefijo o la rama base están mal. No afirmo nada.'); return 1 }
  if (!hallazgos.length) { console.log('\n✔ ninguna rama sin mergear difiere de main en un generador de Sheets.'); return 0 }

  if (!informar(resumir(hallazgos))) { console.log('\n✔ todo el trabajo de rama está incorporado. El pipeline puede correr.'); return 0 }
  console.log('\n  NO corras el pipeline contra el Sheet real hasta resolverlo: un generador viejo reescribe')
  console.log('  la grilla que él conoce y borra lo que se agregó después, sin fallar y sin avisar.')
  console.log(`  Cuando lo resuelvas —lo traigas o decidas no traerlo— anotalo en ${corto(RUTA_REGISTRO)}.`)
  return 1
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main())
}
