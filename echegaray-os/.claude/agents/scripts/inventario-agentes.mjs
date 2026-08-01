#!/usr/bin/env node
// INVENTARIO DE AGENTES — la lista sale del filesystem, no de un README.
//
// Las listas escritas a mano mueren. Ya pasó con las skills: el README decía "12 total" con 30 en
// disco, y nadie se enteró hasta que alguien fue a contar. Esto lee los archivos.
//
// Uso:
//   node .claude/agents/scripts/inventario-agentes.mjs             qué hay
//   node .claude/agents/scripts/inventario-agentes.mjs --validar   exit 1 si alguno está mal declarado

import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..')
const MODELOS = new Set(['haiku', 'sonnet', 'opus', 'inherit'])

/** Las que escriben. Un agente que las tenga sin decir por qué es un accidente esperando. */
const PELIGROSAS = new Set(['Write', 'Edit', 'NotebookEdit'])

/** Frontmatter YAML mínimo: sólo las claves que este inventario necesita. */
function frontmatter(texto) {
  const m = texto.match(/^---\n([\s\S]*?)\n---/)
  if (!m) return null
  const out = {}
  for (const linea of m[1].split('\n')) {
    const i = linea.indexOf(':')
    if (i < 1 || /^\s/.test(linea)) continue
    out[linea.slice(0, i).trim()] = linea.slice(i + 1).trim()
  }
  return out
}

const agentes = readdirSync(DIR)
  .filter((f) => f.endsWith('.md') && f !== 'README.md')
  .map((f) => {
    const fm = frontmatter(readFileSync(join(DIR, f), 'utf8')) ?? {}
    const tools = (fm.tools ?? '').split(',').map((t) => t.trim()).filter(Boolean)
    return { archivo: f, esperado: basename(f, '.md'), ...fm, tools }
  })
  .sort((a, b) => a.esperado.localeCompare(b.esperado))

const problemas = []
for (const a of agentes) {
  const donde = a.archivo
  if (!a.name) problemas.push(`${donde}: falta 'name'`)
  else if (a.name !== a.esperado) problemas.push(`${donde}: 'name' es "${a.name}" y el archivo se llama "${a.esperado}"`)
  if (!a.description) problemas.push(`${donde}: falta 'description' — sin eso nunca se lo va a llamar solo`)
  else if (a.description.length < 60) problemas.push(`${donde}: 'description' muy corta: tiene que decir CUÁNDO usarlo y cuándo no`)
  // `tools` omitido hereda TODO, incluida la escritura. Casi nunca es lo que se quiere.
  if (!a.tools.length) problemas.push(`${donde}: sin 'tools' — hereda todas las herramientas, incluida Write`)
  if (!a.model) problemas.push(`${donde}: falta 'model' — el costo se elige, no se hereda por descuido`)
  else if (!MODELOS.has(a.model)) problemas.push(`${donde}: model "${a.model}" no es ${[...MODELOS].join('|')}`)
}

const escribe = (a) => a.tools.some((t) => PELIGROSAS.has(t))

console.log(`\n${agentes.length} agente(s) en .claude/agents/\n`)
for (const a of agentes) {
  console.log(`  ${escribe(a) ? '✎' : '👁'}  ${(a.name ?? a.esperado).padEnd(26)} ${(a.model ?? '—').padEnd(8)} ${a.tools.join(', ') || '(TODAS)'}`)
}
console.log(`\n  ✎ = edita archivos del repo · 👁 = no los edita`)
// BASH ES UN VECTOR DE ESCRITURA Y ESTE ÍCONO NO LO MUESTRA.
// `mantenedor-flujo-de-fondos` figura como 👁 y sin embargo reescribe pestañas del Sheet real: lo
// hace corriendo el pipeline, no editando archivos. Decir "sólo lectura" ahí sería mentir en el
// único lugar donde la mentira sale cara.
console.log('  Ojo: todos tienen Bash. El alcance real de cada uno lo fija su prompt, no esta columna.\n')

if (process.argv.includes('--validar')) {
  if (!problemas.length) {
    console.log('✓ todos bien declarados\n')
    process.exit(0)
  }
  console.log('Problemas:\n')
  for (const p of problemas) console.log(`  ✗ ${p}`)
  console.log('')
  process.exit(1)
}
