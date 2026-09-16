#!/usr/bin/env node
/**
 * LA PRUEBA DE FUEGO. Corre una tarea real del OS con `CLAUDE_UNAVAILABLE=1`.
 *
 * Uso: CLAUDE_UNAVAILABLE=1 node orquestador/dev-router/correr-tarea-real.mjs [modelo...]
 *
 * Deja la evidencia en `.claude/estado/dev-router.jsonl` y la imprime resumida. No decide nada
 * sobre el mérito del modelo: imprime qué pasó, incluido el rojo.
 */
import { execFileSync } from 'node:child_process'
import { correrTarea } from './router.mjs'
import { claudeDisponible } from './ejecutores.mjs'
import { tarea } from './tareas/spec-liquidacion-al-dia.mjs'

const RAIZ = process.cwd()
const MODELOS = process.argv.slice(2).length ? process.argv.slice(2) : [
  'Qwen/Qwen3-Coder-480B-A35B-Instruct',
  'moonshotai/Kimi-K2.7-Code',
  'openai/gpt-oss-120b',
]

const limpio = () => execFileSync('git', ['checkout', '--', 'tests/liquidacion-fidelidad.spec.ts'], { cwd: RAIZ })

console.log(`CLAUDE DISPONIBLE: ${claudeDisponible()}  (CLAUDE_UNAVAILABLE=${process.env.CLAUDE_UNAVAILABLE ?? '<sin definir>'})`)
if (claudeDisponible()) {
  console.error('ABORTA: la prueba de fuego se corre con CLAUDE_UNAVAILABLE=1, si no no prueba nada.')
  process.exit(2)
}

const filas = []
for (const modelo of MODELOS) {
  limpio()
  const t = tarea(RAIZ, { modelo })
  console.log(`\n══ ${modelo} ══  contexto entregado ≈ ${t.contextoTokens} tokens`)
  const tz = await correrTarea(RAIZ, t, { maxReparaciones: 2 })
  const hf = tz.pasos.filter((p) => p.ejecutor === 'hf')
  const uso = hf.reduce((s, p) => s + ((p.uso?.prompt_tokens || 0) + (p.uso?.completion_tokens || 0)), 0)
  filas.push({ modelo, estado: tz.estado, riesgo: tz.riesgo, intentos: hf.length, reparaciones: tz.reparaciones ?? null,
    ms: tz.ms, costoUsd: tz.costoUsd, tokensHF: uso, proveedor: hf.at(-1)?.proveedor ?? null })
  for (const p of tz.pasos) {
    if (p.saltado) { console.log(`   · ${p.ejecutor}: saltado (${p.saltado})`); continue }
    if (p.bloqueado) { console.log(`   · claude: BLOQUEADO — ${p.bloqueado}`); continue }
    console.log(`   · hf intento ${p.reparacion} → ok=${p.ok} ${p.ms}ms prov=${p.proveedor ?? '?'} ${p.porQue}`)
    for (const v of p.verificacion ?? []) console.log(`       ${v.verde ? 'VERDE' : 'ROJO '} ${v.nombre} (${v.ms}ms)${v.verde ? '' : `\n         ${String(v.cola).split('\n').filter((l) => /Assertion|rótulos|columnas|SyntaxError|✖/.test(l)).slice(0, 3).join('\n         ')}`}`)
  }
  console.log(`   ⇒ ${tz.estado}${tz.ejecutorQueLaHizo ? ` por ${tz.ejecutorQueLaHizo}/${tz.modelo}` : ''} en ${tz.ms}ms, US$ ${tz.costoUsd.toFixed(6)}`)
  if (tz.estado === 'aceptada' || tz.estado === 'reparada') { console.log('   (se deja el trabajo aplicado y se corta acá)'); break }
}

console.log('\nRESUMEN');
console.table(filas)
