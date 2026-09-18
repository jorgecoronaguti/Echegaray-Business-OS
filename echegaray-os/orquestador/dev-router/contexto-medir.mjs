// Mide contexto-minimo contra casos reales (ver contexto-casos.mjs): e5, léxico y fusión, recall@5/@10.
// Uso: node orquestador/dev-router/contexto-casos.mjs /tmp/casos.json && node orquestador/dev-router/contexto-medir.mjs /tmp/casos.json
import fs from 'node:fs'; import os from 'node:os'
const { embeber } = await import('../lib/ml/embeddings.mjs')
const idx = JSON.parse(fs.readFileSync(os.homedir() + '/.echegaray-os/indice-contexto.json', 'utf8')).items.filter((i) => i.tipo === 'memoria')
const nombre = (r) => r.split('/').pop().replace('.md', '')
const existentes = new Set(idx.map((i) => nombre(i.ruta)))
const casos = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')).map((c) => ({ ...c, memorias: c.memorias.filter((m) => existentes.has(m)) })).filter((c) => c.memorias.length)
// baseline léxico: solapamiento de raíces de 5 letras entre pedido y (nombre+resumen) — lo que haría un grep sin semántica
const raices = (t) => new Set((t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').match(/[a-z0-9]{4,}/g) || []).map((w) => w.slice(0, 5)))
const txt = Object.fromEntries(idx.map((i) => [nombre(i.ruta), new Set(i.lex.split(' '))]))
const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0)
for (const K of [5, 10]) {
  let hib = 0, hibf = 0, e5 = 0, lex = 0, e5f = 0, lexf = 0
  for (const c of casos) {
    const v = await embeber(c.pedido, 'consulta')
    const topE = idx.map((i) => [nombre(i.ruta), dot(i.v, v)]).sort((a, b) => b[1] - a[1]).slice(0, 3*K).map((x) => x[0])
    const q = raices(c.pedido)
    const topL = Object.entries(txt).map(([n, s]) => [n, [...q].filter((w) => s.has(w)).length]).sort((a, b) => b[1] - a[1]).slice(0, K).map((x) => x[0])
    const rr = {}; topE.forEach((n,i)=>rr[n]=(rr[n]||0)+1/(20+i)); topL.forEach((n,i)=>rr[n]=(rr[n]||0)+1/(20+i)); const topH = Object.entries(rr).sort((a,b)=>b[1]-a[1]).slice(0,K).map(x=>x[0]); const hH = c.memorias.filter((m)=>topH.includes(m)).length; hib += hH>0; hibf += hH/c.memorias.length
    const hE = c.memorias.filter((m) => topE.slice(0,K).includes(m)).length, hL = c.memorias.filter((m) => topL.slice(0,K).includes(m)).length
    e5 += hE > 0; lex += hL > 0; e5f += hE / c.memorias.length; lexf += hL / c.memorias.length
  }
  const n = casos.length, p = (x) => (100 * x / n).toFixed(0) + '%'
  console.log(`K=${K} n=${n} | e5: acierta ≥1 ${p(e5)} · recall medio ${p(e5f)} | léxico: ≥1 ${p(lex)} · recall ${p(lexf)} | híbrido: ≥1 ${p(hib)} · recall ${p(hibf)} | azar ≈ ${(100 * K / idx.length).toFixed(0)}% por memoria`)
}
