// CONTEXTO MÍNIMO: qué memorias, skills y documentos aplican a una tarea, sin cargarlos todos.
//
// POR QUÉ EXISTE (18/09/2026). Cada sesión de Claude Code y cada subagente arrancan con MEMORY.md
// (18 KB), las descripciones de 50 skills (33 KB) y dos CLAUDE.md (20 KB) — y la mayor parte no
// aplica a la tarea. Este paso devuelve PUNTEROS (ruta + título + por qué), no contenido: el que
// coordina abre sólo lo que aplica, y a un subagente se le pasa ese paquete y nada más.
//
// POR QUÉ e5 Y NO rg. Para código, `rg` gana (medido el 16/09, `dev-router/contexto.mjs`): uno sabe
// el nombre de lo que busca. Para memoria no: «verificá lo de Tello» tiene que traer la memoria del
// relevo aunque no comparta una palabra. Corre LOCAL (multilingual-e5-small, $0, nada sale de la VM).
//
// El índice se guarda en ~/.echegaray-os/indice-contexto.json y se rehace sólo para lo que cambió
// (hash por archivo). No hay umbral de coseno: se ordena y se devuelve el top-k, porque un umbral
// fijo en este OS ya demostró ser ruido (memoria «coseno 0,90»).
//
//   node orquestador/scripts/contexto-minimo.mjs "verificar la corrida de flujo de caja y Tello" [--k 8]
//   node orquestador/scripts/contexto-minimo.mjs --indexar
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '../..')
const MEMORIA = process.env.ORQ_MEMORIA_DIR || join(homedir(), '.claude/projects/-home-jorge-echegaray-os-app/memory')
const INDICE = process.env.ORQ_INDICE_CONTEXTO || join(homedir(), '.echegaray-os/indice-contexto.json')
const MAX_TEXTO = 700

/** Frontmatter simple (clave: valor en una línea). Suficiente para name/description de memorias y skills. */
export function frontmatter(md) {
  const m = md.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!m) return { meta: {}, cuerpo: md }
  const meta = {}
  for (const l of m[1].split('\n')) {
    const k = l.match(/^([a-zA-Z_-]+):\s*(.*)$/)
    if (k) meta[k[1]] = k[2].replace(/^["'>|]\s*/, '').replace(/["']$/, '')
  }
  return { meta, cuerpo: m[2] }
}

function listar(dir, filtro, prof = 3) {
  if (!existsSync(dir) || prof < 0) return []
  const out = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...listar(p, filtro, prof - 1))
    else if (filtro(p)) out.push(p)
  }
  return out
}

/** Las piezas que se indexan: una por archivo, con el texto que la representa. */
export function fuentes() {
  const items = []
  for (const p of listar(MEMORIA, (f) => f.endsWith('.md') && !f.endsWith('MEMORY.md'), 0)) {
    const { meta, cuerpo } = frontmatter(readFileSync(p, 'utf8'))
    items.push({ tipo: 'memoria', ruta: p, titulo: meta.name || p, texto: `${meta.description || ''}\n${cuerpo}`.slice(0, MAX_TEXTO) })
  }
  for (const p of listar(join(RAIZ, '.claude/skills'), (f) => f.endsWith('SKILL.md'), 1)) {
    const { meta } = frontmatter(readFileSync(p, 'utf8'))
    items.push({ tipo: 'skill', ruta: relative(RAIZ, p), titulo: meta.name || p, texto: (meta.description || '').slice(0, MAX_TEXTO) })
  }
  for (const p of [...listar(join(RAIZ, 'docs'), (f) => f.endsWith('.md'), 3), ...listar(join(RAIZ, '.claude/rules'), (f) => f.endsWith('.md'), 0)]) {
    const md = readFileSync(p, 'utf8')
    const titulos = (md.match(/^#{1,3} .+$/gm) || []).slice(0, 12).join(' · ')
    items.push({ tipo: p.includes('/rules/') ? 'regla' : 'doc', ruta: relative(RAIZ, p), titulo: (md.match(/^# (.+)$/m) || [])[1] || relative(RAIZ, p), texto: `${titulos}\n${md.slice(0, 300)}`.slice(0, MAX_TEXTO) })
  }
  return items.map((i) => ({ ...i, hash: createHash('sha1').update(i.texto).digest('hex').slice(0, 12) }))
}

/** Rehace sólo lo que cambió. Devuelve el índice y cuántos se embebieron. */
export async function indexar({ embeber }) {
  const previo = existsSync(INDICE) ? JSON.parse(readFileSync(INDICE, 'utf8')) : { items: [] }
  const porClave = new Map(previo.items.map((i) => [`${i.ruta}#${i.hash}`, i.v]))
  let nuevos = 0
  const items = []
  for (const f of fuentes()) {
    let v = porClave.get(`${f.ruta}#${f.hash}`)
    if (!v) { v = await embeber(`${f.titulo}\n${f.texto}`, 'documento'); nuevos += 1 }
    items.push({ tipo: f.tipo, ruta: f.ruta, titulo: f.titulo, hash: f.hash, resumen: f.texto.split('\n')[0].slice(0, 140), lex: [...raices(`${f.ruta.split("/").pop().replace(/[-_.]/g, " ")} ${f.titulo} ${f.texto.split("\n")[0].slice(0, 140)}`)].join(" "), v: v.map((x) => Math.round(x * 1e4) / 1e4) })
  }
  mkdirSync(dirname(INDICE), { recursive: true })
  writeFileSync(INDICE, JSON.stringify({ generado: new Date().toISOString(), items }))
  return { total: items.length, nuevos }
}

/** Raíces de 5 letras sin acentos: el lado léxico, lo que haría un grep sin semántica. */
export function raices(t) {
  return new Set((String(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').match(/[a-z0-9]{4,}/g) || []).map((w) => w.slice(0, 5)))
}

/**
 * HÍBRIDO: fusión por rango (RRF) de e5 y léxico, con cupo por tipo.
 *
 * Medido el 18/09/2026 sobre 71 pedidos reales del dueño contra las memorias que se abrieron
 * después (recall@5 / @10 de acertar al menos una): e5 solo 15 % / 21 %, léxico solo 17 % / 23 %,
 * fusión 23 % / 34 %. Por eso es fusión — y por eso esto SUGIERE contexto, no reemplaza el
 * índice de MEMORY.md: con un tercio de acierto no se le puede sacar la memoria a nadie.
 */
export function rankear(indice, vConsulta, { consulta = '', k = 8, cupo = { memoria: 5, skill: 2, doc: 2, regla: 1 } } = {}) {
  const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0)
  const q = raices(consulta)
  const porE5 = indice.items.map((i) => ({ i, s: dot(i.v, vConsulta) })).sort((a, b) => b.s - a.s)
  const porLex = indice.items.map((i) => { const r = new Set((i.lex ?? [...raices(`${i.titulo} ${i.resumen}`)].join(' ')).split(' ')); return { i, s: [...q].filter((w) => r.has(w)).length } }).sort((a, b) => b.s - a.s)
  const fusion = new Map()
  porE5.forEach(({ i }, n) => fusion.set(i, (fusion.get(i) || 0) + 1 / (20 + n)))
  porLex.forEach(({ i, s }, n) => { if (s > 0) fusion.set(i, (fusion.get(i) || 0) + 1 / (20 + n)) })
  const orden = [...fusion].map(([i, score]) => ({ ...i, score: score * 20 })).sort((a, b) => b.score - a.score)
  const usados = {}
  const out = []
  for (const i of orden) {
    if (out.length >= k) break
    if ((usados[i.tipo] || 0) >= (cupo[i.tipo] ?? 1)) continue
    usados[i.tipo] = (usados[i.tipo] || 0) + 1
    out.push(i)
  }
  return out
}

async function main() {
  const args = process.argv.slice(2)
  const k = Number(args[args.indexOf('--k') + 1]) || 8
  const { embeber } = await import('../lib/ml/embeddings.mjs')
  const r = await indexar({ embeber })
  if (args.includes('--indexar')) { console.log(`índice: ${r.total} piezas, ${r.nuevos} re-embebidas → ${INDICE}`); return }
  const consulta = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--k').join(' ')
  if (!consulta) { console.error('Uso: contexto-minimo.mjs "<tarea>" [--k 8] | --indexar'); process.exit(2) }
  const indice = JSON.parse(readFileSync(INDICE, 'utf8'))
  for (const i of rankear(indice, await embeber(consulta, 'consulta'), { consulta, k })) {
    console.log(`${i.score.toFixed(2)} ${i.tipo.padEnd(7)} ${i.ruta.replace(homedir(), '~')} — ${i.resumen}`)
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(`contexto-minimo: ${e.message}`); process.exit(1) })
}
