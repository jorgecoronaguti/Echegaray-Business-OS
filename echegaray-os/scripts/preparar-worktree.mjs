#!/usr/bin/env node
// DEJA UN WORKTREE EN CONDICIONES DE LEVANTAR LA APP.
//
//   node scripts/preparar-worktree.mjs [ruta-del-worktree]
//
// ═══ EL DEFECTO QUE CIERRA (21/08/2026) ═══
//
// La regla del repo es que un worktree comparte `node_modules` con el árbol principal por un
// SYMLINK: no hace falta `npm install` y no se duplican 900 MB. Funciona para los tests, para el
// typecheck y para el lint.
//
// **No funciona para `next dev` ni para `next build`.** Turbopack rechaza el enlace:
//
//     Symlink [project]/node_modules is invalid, it points out of the filesystem root
//
// Consecuencia medida hoy, en dos frentes distintos: ningún agente trabajando en un worktree podía
// levantar la aplicación, así que **ninguno podía MIRAR la pantalla que estaba construyendo**. Un
// contrato de diseño que se verifica leyendo el HTML del mockup y no viendo el resultado no está
// verificado — y este repo ya pagó por dar por buena una pantalla sin mirarla.
//
// La salida no es `npm install` en cada worktree (minutos y disco por cada uno) sino **enlaces
// duros**: `cp -al` crea la estructura de directorios de verdad y apunta cada ARCHIVO al mismo
// inodo que el original. Cuesta segundos, no ocupa espacio, y Turbopack lo acepta porque no hay un
// enlace que salga de la raíz.
//
// El costo real y por qué se paga igual: los enlaces duros comparten contenido, así que `npm
// install` en el árbol principal puede ver archivos con más de una referencia. npm reemplaza
// archivos en vez de editarlos in situ, de modo que reinstalar rompe el vínculo en lugar de
// corromper al otro lado; el worktree queda con la copia vieja hasta que se vuelva a preparar. Es
// aceptable para un worktree, que es temporal por definición.
import { existsSync, lstatSync, rmSync, symlinkSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, resolve } from 'node:path'

const PRINCIPAL = '/home/jorge/echegaray-os/app/echegaray-os'

function esSymlink(p) {
  try { return lstatSync(p).isSymbolicLink() } catch { return false }
}

export function loQueFalta(destino, { existe = existsSync, symlink = esSymlink } = {}) {
  const falta = []
  const nm = join(destino, 'node_modules')
  if (!existe(nm)) falta.push({ que: 'node_modules', motivo: 'no está' })
  else if (symlink(nm)) falta.push({ que: 'node_modules', motivo: 'es un symlink y Turbopack lo rechaza' })
  if (!existe(join(destino, '.env.local'))) falta.push({ que: '.env.local', motivo: 'no está' })
  return falta
}

function main() {
  const destino = resolve(process.argv[2] || process.cwd())
  if (destino === PRINCIPAL) {
    console.log('éste es el árbol principal: no hay nada que preparar.')
    return
  }
  const falta = loQueFalta(destino)
  if (!falta.length) { console.log('el worktree ya está listo.'); return }

  for (const f of falta) console.log(`  · ${f.que}: ${f.motivo}`)

  const nm = join(destino, 'node_modules')
  if (falta.some((f) => f.que === 'node_modules')) {
    if (existsSync(nm)) rmSync(nm, { recursive: true, force: true })
    console.log('  enlazando node_modules con enlaces duros (segundos, sin ocupar disco)…')
    execFileSync('cp', ['-al', join(PRINCIPAL, 'node_modules'), nm], { stdio: 'inherit' })
  }
  if (falta.some((f) => f.que === '.env.local')) {
    symlinkSync(join(PRINCIPAL, '.env.local'), join(destino, '.env.local'))
    console.log('  .env.local enlazado')
  }
  console.log('✓ listo: `npm run dev` y `npm run build` ya funcionan acá.')
}

if (import.meta.url === `file://${process.argv[1]}`) main()
