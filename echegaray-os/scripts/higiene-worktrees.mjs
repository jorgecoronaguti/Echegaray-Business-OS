#!/usr/bin/env node
// HIGIENE DE WORKTREES — inventario y limpieza que no puede perder trabajo.
//
// POR QUÉ EXISTE. El repo llegó a 75 worktrees y 4,25 GB sin que nadie lo notara, porque
// `.claude/worktrees/` está excluido vía `.git/info/exclude` —un archivo LOCAL y no versionado— así
// que `git status` nunca los mostró. La regla "el worktree se elimina al terminar" existía escrita
// desde el principio; lo que faltaba era algo que la midiera.
//
// ═══ LA REGLA DE SEGURIDAD ═══
//
// Sólo se elimina un worktree que cumple LAS DOS condiciones a la vez:
//   1. no tiene ningún cambio sin commitear, y
//   2. su rama ya está mergeada a `main`.
// Con las dos, no hay nada que perder: cada commit vive en `main` y el worktree es una copia.
//
// Todo lo demás se reporta y NO se toca. En particular, un worktree con trabajo sin commitear no se
// borra ni con `--ejecutar`: no hay flag para eso, a propósito. La auditoría encontró 13 así, uno
// con un conflicto de merge a medio resolver de hacía seis días.
//
// LAS RAMAS NUNCA SE BORRAN. Quitar el worktree deja el trabajo intacto en su rama; borrar la rama
// sería la operación irreversible. Este script no la hace.
//
// DOS NIVELES, LOS DOS SEGUROS:
//   nivel 1 (por defecto)     limpio + rama ya en `main`. No hay nada que perder por ningún lado.
//   nivel 2 (--incluir-sin-mergear)  limpio, rama sin mergear. Tampoco se pierde nada: los commits
//                             viven en el ref de la rama, que no se toca. Pero hay que pedirlo.
//
// Uso:
//   node scripts/higiene-worktrees.mjs                            # inventario, no toca nada
//   node scripts/higiene-worktrees.mjs --ejecutar                 # nivel 1
//   node scripts/higiene-worktrees.mjs --ejecutar --incluir-sin-mergear   # nivel 1 + 2

import { execFileSync } from 'node:child_process'

const EJECUTAR = process.argv.includes('--ejecutar')
const AMPLIO = process.argv.includes('--incluir-sin-mergear')

/**
 * Corre git. Devuelve `null` cuando FALLÓ, string cuando funcionó.
 *
 * LA DIFERENCIA ENTRE `null` Y `''` ES LA QUE PROTEGE EL TRABAJO DEL DUEÑO. Antes esto devolvía
 * `''` en los dos casos, así que un worktree que NO SE PUDO VERIFICAR (permisos, lock, timeout,
 * directorio corrupto) quedaba indistinguible de uno CONFIRMADO LIMPIO — y por lo tanto elegible
 * para borrar. Reproducido: un worktree con cambios sin commitear y permisos revocados se
 * clasificaba como limpio.
 *
 * No perdía datos por casualidad —`git worktree remove` sin `--force` tiene su propio candado y se
 * negaba igual— pero era una bomba esperando a que alguien agregara `--force` "para que no falle
 * en silencio". Un control que depende de que otro control lo salve no es un control.
 */
const git = (args, cwd) => {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 30000 }).trim()
  } catch { return null }
}

/** `git worktree list --porcelain` → [{ruta, rama, commit}] */
export function parsearWorktrees(salida) {
  const wts = []
  let actual = null
  for (const linea of salida.split('\n')) {
    if (linea.startsWith('worktree ')) {
      if (actual) wts.push(actual)
      actual = { ruta: linea.slice(9), rama: null, commit: null, detached: false }
    } else if (linea.startsWith('HEAD ') && actual) actual.commit = linea.slice(5, 12)
    else if (linea.startsWith('branch ') && actual) actual.rama = linea.slice(7).replace('refs/heads/', '')
    else if (linea === 'detached' && actual) actual.detached = true
  }
  if (actual) wts.push(actual)
  return wts
}

/**
 * Clasifica. Es la única decisión del script, y se separa acá para poder probarla sin worktrees
 * reales: es la función que decide si algo se borra.
 */
export function clasificar({ esPrincipal, sucios, mergeada }) {
  if (esPrincipal) return 'PRINCIPAL'
  // FALLA CERRADO: `null` es "no pude verificarlo", y eso pesa igual que tener trabajo sin guardar.
  // Lo que no se pudo mirar no se borra.
  if (sucios === null || sucios === undefined) return 'NO SE PUDO VERIFICAR'
  if (sucios > 0) return 'CON TRABAJO SIN GUARDAR'
  if (mergeada) return 'SEGURO DE ELIMINAR'
  return 'LIMPIO, RAMA SIN MERGEAR'
}

/**
 * Ramas mergeadas a `main`, según `git branch --merged main`.
 *
 * EL `+` NO SOBRA. git marca con `*` la rama actual y con `+` las que están checkeadas en OTRO
 * worktree — que es, por definición, el caso de TODOS los worktrees vinculados. Sacando sólo el
 * `*`, el nombre quedaba como `+feat/algo` y no matcheaba nunca: la categoría "SEGURO DE ELIMINAR"
 * era código muerto y el modo por defecto no tenía jamás nada para limpiar.
 *
 * Peor: la comprobación que hice a mano para "verificar" esto usaba un `sed` que sólo saca `*` y
 * espacios — exactamente el mismo defecto. Confirmé el código con un control que compartía su bug.
 */
export function ramasMergeadas(salida) {
  if (!salida) return new Set()
  return new Set(salida.split('\n').map((s) => s.replace(/^[*+]?\s*/, '').trim()).filter(Boolean))
}

// TODO LO QUE TOCA EL MUNDO VIVE ACÁ ADENTRO.
// Sin este envoltorio, importar el módulo desde el test corría `git` de verdad y llamaba a
// `process.exit(0)`: la suite moría después del primer test y los otros cinco figuraban como
// inexistentes en vez de como fallados. Un test que no corre no avisa que no corrió.
function main() {
  const RAIZ = git(['rev-parse', '--show-toplevel'], process.cwd())
  if (!RAIZ) { console.error('no estoy dentro de un repositorio git'); process.exit(1) }

  const mergeadas = ramasMergeadas(git(['branch', '--merged', 'main'], RAIZ))

  const wts = parsearWorktrees(git(['worktree', 'list', '--porcelain'], RAIZ))
  const filas = []
  for (const wt of wts) {
    const esPrincipal = wt.ruta === RAIZ
    const salida = esPrincipal ? '' : git(['status', '--porcelain'], wt.ruta)
    // `null` (git falló) se propaga como `null`: no se convierte en 0 por el camino.
    const sucios = salida === null ? null : salida.split('\n').filter(Boolean).length
    const mergeada = !!wt.rama && mergeadas.has(wt.rama)
    filas.push({ ...wt, sucios, mergeada, clase: clasificar({ esPrincipal, sucios, mergeada }) })
  }

  const porClase = (c) => filas.filter((f) => f.clase === c)
  const seguros = porClase('SEGURO DE ELIMINAR')
  const conTrabajo = porClase('CON TRABAJO SIN GUARDAR')
  const sinMergear = porClase('LIMPIO, RAMA SIN MERGEAR')
  const opacos = porClase('NO SE PUDO VERIFICAR')

  console.log(`\nworktrees: ${filas.length}   (repositorio: ${RAIZ})\n`)
  console.log(`  SEGURO DE ELIMINAR        ${String(seguros.length).padStart(3)}   limpios y ya en main`)
  console.log(`  LIMPIO, RAMA SIN MERGEAR  ${String(sinMergear.length).padStart(3)}   el trabajo vive en su rama; se conserva`)
  console.log(`  CON TRABAJO SIN GUARDAR   ${String(conTrabajo.length).padStart(3)}   NO SE TOCAN`)
  if (opacos.length) {
    console.log(`  NO SE PUDO VERIFICAR      ${String(opacos.length).padStart(3)}   git falló al mirarlos: NO SE TOCAN`)
    for (const f of opacos) console.log(`      ${f.rama ?? '(detached)'}  ${f.ruta}`)
  }

  if (conTrabajo.length) {
    console.log('\n── con trabajo sin commitear (revisalos a mano) ──')
    for (const f of conTrabajo.sort((a, b) => b.sucios - a.sucios)) {
      console.log(`  ${String(f.sucios).padStart(3)} archivo(s)  ${f.rama ?? '(detached)'}  ${f.ruta}`)
    }
  }

  const aBorrar = AMPLIO ? [...seguros, ...sinMergear] : seguros

  if (!aBorrar.length) {
    console.log('\nNada que eliminar en este nivel.')
    if (sinMergear.length) {
      console.log(`Hay ${sinMergear.length} limpios con rama sin mergear: también son seguros`)
      console.log('(los commits viven en su rama, que no se toca). Para incluirlos:')
      console.log('  node scripts/higiene-worktrees.mjs --ejecutar --incluir-sin-mergear')
    }
    process.exit(0)
  }

  console.log(`\n── se eliminarían (${aBorrar.length}) ──`)
  for (const f of aBorrar) console.log(`  ${f.rama ?? '(detached)'}  ${f.ruta}`)

  if (!EJECUTAR) {
    console.log('\nEsto fue un inventario: no se tocó nada.')
    console.log('Para eliminarlos:  node scripts/higiene-worktrees.mjs --ejecutar' + (AMPLIO ? ' --incluir-sin-mergear' : ''))
    console.log('(las ramas NO se borran nunca — el trabajo queda accesible en cada una)')
    process.exit(0)
  }

  let ok = 0; let falla = 0
  for (const f of aBorrar) {
    try {
      execFileSync('git', ['worktree', 'remove', f.ruta], { cwd: RAIZ, stdio: 'ignore', timeout: 60000 })
      ok++
    } catch { console.log(`  no pude eliminar ${f.ruta} — lo dejo como está`); falla++ }
  }
  execFileSync('git', ['worktree', 'prune'], { cwd: RAIZ, stdio: 'ignore' })
  console.log(`\neliminados: ${ok}${falla ? ` · quedaron ${falla}` : ''}. Ramas intactas.`)

}

if (process.argv[1] && process.argv[1].endsWith('higiene-worktrees.mjs')) main()
