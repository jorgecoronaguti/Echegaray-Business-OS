// Reparte las líneas PERFQ del servidor entre las ventanas de tiempo de cada navegación.
import { readFileSync } from 'node:fs'
const [logSrv, ventanas] = process.argv.slice(2)
const vs = readFileSync(ventanas, 'utf8').trim().split('\n').map((l) => {
  const [ruta, d, h] = l.split('\t'); return { ruta, d: +d, h: +h }
})
const qs = []
for (const l of readFileSync(logSrv, 'utf8').split('\n')) {
  if (!l.startsWith('PERFQ\t')) continue
  const [, t0, ms, , resumen] = l.split('\t')
  qs.push({ t0: +t0, ms: +ms, resumen })
}
const med = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]
const porRuta = new Map()
for (const v of vs) {
  const dentro = qs.filter((q) => q.t0 >= v.d && q.t0 <= v.h)
  const e = porRuta.get(v.ruta) ?? { visitas: 0, viajes: [], detalle: new Map() }
  e.visitas++; e.viajes.push(dentro.length)
  for (const q of dentro) {
    const l = e.detalle.get(q.resumen) ?? []; l.push(q.ms); e.detalle.set(q.resumen, l)
  }
  porRuta.set(v.ruta, e)
}
for (const [ruta, e] of porRuta) {
  console.log(`\n${ruta}  visitas=${e.visitas}  viajes(mediana)=${med(e.viajes)}`)
  const orden = [...e.detalle].map(([k, l]) => [k, l.length / e.visitas, med(l), Math.max(...l)])
    .sort((a, b) => b[2] - a[2])
  for (const [k, n, m, mx] of orden) {
    console.log(`    ${n.toFixed(1).padStart(4)}×  ${String(m).padStart(6)} ms (máx ${String(mx).padStart(6)})  ${k}`)
  }
}
