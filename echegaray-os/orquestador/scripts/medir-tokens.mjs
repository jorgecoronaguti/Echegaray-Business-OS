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
//   … --breve  (una línea, para traspasos y hooks)  ·  … --json  (para comparar antes/después)
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const PROYECTOS = join(homedir(), '.claude/projects')

/**
 * Suma el usage de un transcript .jsonl. Pura sobre el texto, para poder probarla.
 *
 * Deduplicación por id de respuesta (29/09): Claude Code escribe una respuesta con varios bloques en
 * varias líneas con el MISMO message.id, y el usage de esas líneas NO es igual: la entrada se repite y
 * `output_tokens` va creciendo (hay líneas en 0). Quedarse con la primera subcontaba la salida ~2,6×
 * (medido sobre las 15 sesiones del 26–29/09: 9,2 M contra 24,2 M). Se toma el máximo de cada campo
 * por id. `vistos` (opcional, compartido entre archivos) evita contar dos veces una respuesta copiada
 * en otro transcript (agente retomado).
 *
 * Separa lo que el modelo leyó en: `nueva` (input sin caché), `cacheLectura`, `cacheEscritura`; su
 * suma es el contexto de la vuelta (`entrada`). La salida va aparte.
 */
export function sumarTranscript(texto, { desde = null, vistos = null } = {}) {
  const porId = new Map()
  for (const l of texto.split('\n')) {
    if (!l.trim()) continue
    let x
    try { x = JSON.parse(l) } catch { continue }
    if (x.type !== 'assistant' || !x.message?.usage) continue
    if (desde && x.timestamp && x.timestamp < desde) continue
    const id = x.message.id ?? x.uuid
    const u = x.message.usage
    const f = [u.input_tokens ?? 0, u.cache_read_input_tokens ?? 0, u.cache_creation_input_tokens ?? 0, u.output_tokens ?? 0]
    const prev = porId.get(id)
    if (prev) prev.f = prev.f.map((v, i) => Math.max(v, f[i]))
    else porId.set(id, { f, m: String(x.message.model ?? '?').replace(/^claude-/, '') })
  }
  const r = { vueltas: 0, nueva: 0, cacheLectura: 0, cacheEscritura: 0, entrada: 0, salida: 0, maxCtx: 0, porModelo: {} }
  for (const [id, { f, m }] of porId) {
    if (vistos) { if (vistos.has(id)) continue; vistos.add(id) }
    const [nueva, lee, escribe, sal] = f
    const ctx = nueva + lee + escribe
    if (ctx === 0 && sal === 0) continue // línea sintética sin consumo
    r.vueltas += 1
    r.nueva += nueva; r.cacheLectura += lee; r.cacheEscritura += escribe
    r.entrada += ctx
    r.salida += sal
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

/** Mide una sesión entera (principal + subagentes) desde disco. Exportada para el hook de traspaso. */
export function medirSesion(s, { desde = null } = {}) {
  const vistos = new Set()
  const principal = sumarTranscript(readFileSync(join(s.dir, `${s.id}.jsonl`), 'utf8'), { desde, vistos })
  const dirSub = join(s.dir, s.id, 'subagents')
  const agentes = existsSync(dirSub)
    ? readdirSync(dirSub).filter((f) => f.endsWith('.jsonl')).sort().map((f) => {
        const txt = readFileSync(join(dirSub, f), 'utf8')
        const primera = txt.slice(0, 20000).split('\n').map((l) => { try { return JSON.parse(l) } catch { return null } }).find((x) => x?.type === 'user')
        const c = primera?.message?.content
        const desc = (typeof c === 'string' ? c : (c ?? []).map((b) => b.text ?? '').join(' ')).replace(/\s+/g, ' ').slice(0, 60)
        return { f, desc, ...sumarTranscript(txt, { desde, vistos }) }
      }).filter((a) => a.vueltas > 0)
    : []
  const CAMPOS = ['vueltas', 'nueva', 'cacheLectura', 'cacheEscritura', 'entrada', 'salida']
  const sub = agentes.reduce((t, a) => {
    for (const k of CAMPOS) t[k] += a[k]
    for (const [m, n] of Object.entries(a.porModelo)) t.porModelo[m] = (t.porModelo[m] ?? 0) + n
    return t
  }, { ...Object.fromEntries(CAMPOS.map((k) => [k, 0])), porModelo: {} })
  const total = Object.fromEntries(CAMPOS.map((k) => [k, principal[k] + sub[k]]))
  return { id: s.id, principal, sub, agentes, total, ctxMedioPrincipal: Math.round(principal.entrada / Math.max(1, principal.vueltas)) }
}

const desglose = (r) => `nueva ${M(r.nueva)} · caché leída ${M(r.cacheLectura)} · caché escrita ${M(r.cacheEscritura)} · salida ${M(r.salida)}`

function main() {
  const args = process.argv.slice(2)
  const desde = args.includes('--desde') ? new Date(args[args.indexOf('--desde') + 1]).toISOString() : null
  const pedido = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--desde')
  const s = pedido ? ubicar(pedido) : sesionMasReciente()
  if (!s) { console.error(`medir-tokens: no encuentro la sesión ${pedido ?? ''}`); process.exit(2) }
  const r = medirSesion(s, { desde })
  const { principal, sub, agentes, total } = r

  if (args.includes('--json')) {
    console.log(JSON.stringify({ ...r, agentes: agentes.map(({ f, desc, vueltas, entrada, salida, maxCtx }) => ({ f, desc, vueltas, entrada, salida, maxCtx })) }))
    return
  }
  if (args.includes('--breve')) {
    console.log(`${s.id.slice(0, 8)} · principal ctx medio ${K(r.ctxMedioPrincipal)} máx ${K(principal.maxCtx)} (${principal.vueltas} vueltas) · subagentes ${M(sub.entrada)} en ${agentes.length} · salida ${M(total.salida)}`)
    return
  }
  console.log(`SESIÓN ${s.id.slice(0, 8)}${desde ? ` desde ${desde}` : ''}`)
  console.log(`total leído ${M(total.entrada)} (${desglose(total)})`)
  console.log(`principal ${M(principal.entrada)} en ${principal.vueltas} vueltas · contexto medio ${K(r.ctxMedioPrincipal)} · máx ${K(principal.maxCtx)} · ${desglose(principal)}`)
  console.log(`subagentes ${M(sub.entrada)} en ${agentes.length} agentes (${total.entrada ? Math.round((100 * sub.entrada) / total.entrada) : 0} %) · ${desglose(sub)}`)
  const modelos = {}
  for (const [m, n] of [...Object.entries(principal.porModelo), ...Object.entries(sub.porModelo)]) modelos[m] = (modelos[m] ?? 0) + n
  console.log(`por modelo: ${Object.entries(modelos).sort((a, b) => b[1] - a[1]).map(([m, n]) => `${m} ${M(n)}`).join(' · ')}`)
  for (const a of agentes.sort((x, y) => y.entrada - x.entrada).slice(0, 8)) {
    console.log(`  ${M(a.entrada).padStart(8)} · ${String(a.vueltas).padStart(4)} vueltas · máx ${K(a.maxCtx).padStart(6)} · sal ${K(a.salida).padStart(5)} · ${Object.keys(a.porModelo).join('/')} · ${a.desc}`)
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main()
