// Casos reales: pedido del dueño → memorias abiertas (Read/cat) en las 40 llamadas siguientes.
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os'
const base = path.join(os.homedir(), '.claude/projects')
const archivos = fs.readdirSync(base).flatMap((d) => { try { return fs.readdirSync(path.join(base, d)).filter((f) => f.endsWith('.jsonl')).map((f) => path.join(base, d, f)) } catch { return [] } })
const casos = []
for (const f of archivos) {
  if (f.includes('7a442b49')) continue // esta sesión no
  const lineas = fs.readFileSync(f, 'utf8').split('\n')
  let actual = null, llamadas = 0
  for (const l of lineas) {
    let j; try { j = JSON.parse(l) } catch { continue }
    const c = j.message?.content
    if (j.type === 'user' && !j.isMeta) {
      const t = typeof c === 'string' ? c : Array.isArray(c) ? c.filter((x) => x.type === 'text').map((x) => x.text).join(' ') : ''
      if (t && !t.startsWith('This session is being continued') && !t.includes('<command-') && !t.includes('<task-notification') && t.length > 25 && t.length < 1500 && !/^\s*</.test(t)) {
        if (actual?.memorias.size) casos.push({ pedido: actual.pedido, memorias: [...actual.memorias] })
        actual = { pedido: t.replace(/\s+/g, ' ').slice(0, 500), memorias: new Set() }; llamadas = 0
      }
    }
    if (j.type === 'assistant' && Array.isArray(c) && actual) {
      for (const x of c.filter((x) => x.type === "tool_use" && !["Write","Edit"].includes(x.name) && !/cat *>|>> *[^ ]*memory|tee /.test(JSON.stringify(x.input||{})))) {
        llamadas++; if (llamadas > 40) continue
        const s = JSON.stringify(x.input || {})
        for (const m of s.matchAll(/memory\/([a-z0-9-]+)\.md/g)) if (m[1] !== 'MEMORY') actual.memorias.add(m[1])
      }
    }
  }
  if (actual?.memorias.size) casos.push({ pedido: actual.pedido, memorias: [...actual.memorias] })
}
// fuera los casos donde el pedido nombra la memoria (sería circular)
const limpios = casos.filter((c) => !c.memorias.some((m) => c.pedido.includes(m)) && c.memorias.length <= 6)
fs.writeFileSync(process.argv[2], JSON.stringify(limpios, null, 1))
console.log(casos.length, 'casos,', limpios.length, 'limpios')
