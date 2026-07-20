#!/usr/bin/env node
// GUARDIÁN DEL ZIP DE LA EXTENSIÓN — que lo que el dueño descarga sea lo que dice ser.
//
// Este bug pasó DOS VECES. La primera, el zip descargable estaba 4 versiones atrás (0.8.2 vs 0.8.6)
// y todas las mejoras de la extensión nunca le llegaron. La segunda, peor: yo "verifiqué" el zip
// equivocado. Hay DOS archivos —`extension.zip` en la raíz (el que sirve el servidor del OS, que es
// de donde el dueño descarga de verdad) y `public/echegaray-os-extension.zip` (el de la web)— y yo
// revisé sólo el segundo y le dije que estaba al día. Le descargaba la 0.8.5.
//
// Regla: los DOS zips tienen que existir, tener la MISMA versión que extension/manifest.json y el
// MISMO contenido byte a byte que el código fuente. Corre en orq:test — si alguien toca extension/
// y no regenera, la suite falla antes de que el dueño se lleve una versión vieja.
//
// Uso:  node orquestador/scripts/verificar-extension-zip.mjs
//       node orquestador/scripts/verificar-extension-zip.mjs --fix   (regenera ambos)
import { execFileSync } from 'node:child_process'
import { readFileSync, existsSync, readdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const SRC = path.join(REPO, 'extension')
// El primero es el que sirve el servidor del OS: es el que el dueño descarga de verdad.
const ZIPS = [path.join(REPO, 'extension.zip'), path.join(REPO, 'public/echegaray-os-extension.zip')]
const FIX = process.argv.includes('--fix')

const versionDe = (dir) => JSON.parse(readFileSync(path.join(dir, 'manifest.json'), 'utf8')).version

function regenerar() {
  execFileSync('zip', ['-qr', ZIPS[0], '.', '-x', '*.DS_Store'], { cwd: SRC })
  execFileSync('cp', [ZIPS[0], ZIPS[1]])
}

const esperada = versionDe(SRC)
if (FIX) { regenerar(); console.log(`extension.zip regenerado en ${esperada} (ambas copias)`) }

let fallas = 0
const mal = (m) => { fallas++; console.error(`  ✖ ${m}`) }

for (const zip of ZIPS) {
  const rel = path.relative(REPO, zip)
  if (!existsSync(zip)) { mal(`${rel}: NO EXISTE`); continue }
  const tmp = mkdtempSync(path.join(tmpdir(), 'extzip-'))
  try {
    execFileSync('unzip', ['-oq', zip, '-d', tmp])
    const v = versionDe(tmp)
    if (v !== esperada) { mal(`${rel}: versión ${v} pero el código fuente está en ${esperada}`); continue }
    const distintos = readdirSync(SRC).filter((f) => {
      const a = path.join(SRC, f), b = path.join(tmp, f)
      if (!existsSync(b)) return true
      return !readFileSync(a).equals(readFileSync(b))
    })
    if (distintos.length) { mal(`${rel}: difiere del código fuente en ${distintos.join(', ')}`); continue }
    console.log(`  ✔ ${rel} — v${v}, idéntico al código fuente`)
  } finally { rmSync(tmp, { recursive: true, force: true }) }
}

if (fallas) {
  console.error(`\nverificar-extension-zip: ${fallas} FALLA(S). Corré:  node orquestador/scripts/verificar-extension-zip.mjs --fix`)
  process.exit(1)
}
console.log(`verificar-extension-zip: OK (v${esperada} en las 2 copias)`)
