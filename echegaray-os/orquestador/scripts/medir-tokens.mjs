#!/usr/bin/env node
// CUÁNTOS TOKENS SE GASTARON, DÓNDE Y EN QUÉ MODELO — sólo lectura, cero llamadas a un LLM.
//
// El dueño (26/09/2026): «optimizá al máximo los tokens sin perder rendimiento». La medición de ese
// día (sesión d50fb332: ~7.300 M de entrada, 60 % en subagentes Opus, peor agente 967 k de
// contexto) se hizo con un python suelto que no quedó en ningún lado. Sin medidor, «ahorramos» es
// una opinión. Esto lo vuelve a medir igual cada vez, sobre los transcripts de Claude Code.
//
// Lee `usage` de cada respuesta del asistente (input + cache_read + cache_creation = lo que el
// modelo tuvo que leer; output aparte). El «contexto» de una vuelta es esa suma; el promedio y el
// máximo por agente dicen quién se infló. No estima precios: cuenta tokens.
//
//   node orquestador/scripts/medir-tokens.mjs                 # la sesión más reciente del proyecto
//   node orquestador/scripts/medir-tokens.mjs <id-de-sesión>  # una sesión puntual (prefijo alcanza)
//   node orquestador/scripts/medir-tokens.mjs --desde 2026-09-26T20:00  # sólo vueltas desde esa hora
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const PROYECTOS = join(homedir(), '.claude/projects')

/** Suma el usage de un transcript .jsonl. Pura sobre el texto, para poder probarla. */
export function sumarTranscript(texto, { desde = null } = {}) {
  const r = { vueltas: 0, entrada: 0, salida: 0, maxCtx: 0, porModelo: {} }
  const vistos = new Set()
  for (const l of texto.split('\n')) {
    if (!l.trim()) continue
    let x
    try { x = JSON.parse(l) } catch { continue }
    if (x.type !== 'assistant' || !x.message?.usage) continue
    if (desde && x.timestamp && x.timestamp < desde) continue
    // Una respuesta con varios bloques se escribe en varias líneas con el mismo id y el mismo usage.
    const id = x.message.id ?? x.uuid
    if (vistos.has(id)) continue
    vistos.add(id)
    const u = x.message.usage
    const ctx = (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0)
    const m = String(x.message.model ?? '?').replace(/^claude-/, '')
    r.vueltas += 1
    r.entrada += ctx
    r.salida += u.output_tokens ?? 0
    r.maxCtx = Math.max(r.maxCtx, ctx)
    r.porModelo[m] = (r.porModelo[m] ?? 0) + ctx
  }
  return r
}

const M = (n) => `${(n / 1e6).toFixed(1)} M`
const K = (n) => `${Math.round(n / 1e3)} k`

function sesionMasReciente() {
  let mejor = null
  for (const p of readdirSync(PROYECTOS)) {
    const dir = join(PROYECTOS, p)
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.jsonl')) continue
      const t = statSync(join(dir, f)).mtimeMs
      if (!mejor || t > mejor.t) mejor = { t, dir, id: f.replace(/\.jsonl$/, '') }
    }
  }
  return mejor
}

function ubicar(prefijo) {
  for (const p of readdirSync(PROYECTOS)) {
    const dir = join(PROYECTOS, p)
    const f = readdirSync(dir).find((x) => x.startsWith(prefijo) && x.endsWith('.jsonl'))
    if (f) return { dir, id: f.replace(/\.jsonl$/, '') }
  }
  return null
}

function main() {
  const args = process.argv.slice(2)
  const desde = args.includes('--desde') ? new Date(args[args.indexOf('--desde') + 1]).toISOString() : null
  const pedido = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--desde')
  const s = pedido ? ubicar(pedido) : sesionMasReciente()
  if (!s) { console.error(`medir-tokens: no encuentro la sesión ${pedido ?? ''}`); process.exit(2) }

  const principal = sumarTranscript(readFileSync(join(s.dir, `${s.id}.jsonl`), 'utf8'), { desde })
  const dirSub = join(s.dir, s.id, 'subagents')
  const agentes = existsSync(dirSub)
    ? readdirSync(dirSub).filter((f) => f.endsWith('.jsonl')).map((f) => {
        const txt = readFileSync(join(dirSub, f), 'utf8')
        const primera = txt.slice(0, 20000).split('\n').map((l) => { try { return JSON.parse(l) } catch { return null } }).find((x) => x?.type === 'user')
        const c = primera?.message?.content
        const desc = (typeof c === 'string' ? c : (c ?? []).map((b) => b.text ?? '').join(' ')).replace(/\s+/g, ' ').slice(0, 60)
        return { f, desc, ...sumarTranscript(txt, { desde }) }
      }).filter((a) => a.vueltas > 0)
    : []
  const sub = agentes.reduce((t, a) => {
    t.entrada += a.entrada; t.salida += a.salida
    for (const [m, n] of Object.entries(a.porModelo)) t.porModelo[m] = (t.porModelo[m] ?? 0) + n
    return t
  }, { entrada: 0, salida: 0, porModelo: {} })

  const total = principal.entrada + sub.entrada
  console.log(`SESIÓN ${s.id.slice(0, 8)}${desde ? ` desde ${desde}` : ''}`)
  console.log(`total entrada ${M(total)} · salida ${M(principal.salida + sub.salida)}`)
  console.log(`principal ${M(principal.entrada)} en ${principal.vueltas} vueltas · contexto medio ${K(principal.entrada / Math.max(1, principal.vueltas))} · máx ${K(principal.maxCtx)}`)
  console.log(`subagentes ${M(sub.entrada)} en ${agentes.length} agentes (${total ? Math.round((100 * sub.entrada) / total) : 0} %)`)
  const modelos = {}
  for (const [m, n] of [...Object.entries(principal.porModelo), ...Object.entries(sub.porModelo)]) modelos[m] = (modelos[m] ?? 0) + n
  console.log(`por modelo: ${Object.entries(modelos).sort((a, b) => b[1] - a[1]).map(([m, n]) => `${m} ${M(n)}`).join(' · ')}`)
  for (const a of agentes.sort((x, y) => y.entrada - x.entrada).slice(0, 8)) {
    console.log(`  ${M(a.entrada).padStart(8)} · ${String(a.vueltas).padStart(4)} vueltas · máx ${K(a.maxCtx).padStart(6)} · ${Object.keys(a.porModelo).join('/')} · ${a.desc}`)
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main()
