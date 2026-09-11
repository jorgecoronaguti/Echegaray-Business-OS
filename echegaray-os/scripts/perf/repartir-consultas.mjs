// Reparte las líneas PERFQ del servidor entre las ventanas de tiempo de cada navegación.
import { readFileSync } from 'node:fs'
const [logSrv, ventanas] = process.argv.slice(2)
const vs = readFileSync(ventanas, 'utf8').trim().split('\n').map((l) => {
  const [ruta, d, h] = l.split('\t'); return { ruta, d: +d, h: +h }
})
const qs = []
for (const l of readFileSync(logSrv, 'utf8').split('\n')) {
  if (!l.startsWith('PERFQ\t')) continue
  // `PERFQ \t t0 \t ms \t bytes \t método \t resumen`. `bytes` se agregó el 11/09/2026: contar
  // viajes no alcanza cuando el problema es que UN viaje trae 130 KB para dibujar una dirección.
  const [, t0, ms, bytes, , resumen] = l.split('\t')
  qs.push({ t0: +t0, ms: +ms, bytes: +bytes, resumen })
}
const med = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]
const porRuta = new Map()
for (const v of vs) {
  const dentro = qs.filter((q) => q.t0 >= v.d && q.t0 <= v.h)
  const e = porRuta.get(v.ruta) ?? { visitas: 0, viajes: [], bytes: [], detalle: new Map() }
  e.visitas++; e.viajes.push(dentro.length)
  for (const q of dentro) {
    const l = e.detalle.get(q.resumen) ?? []; l.push(q); e.detalle.set(q.resumen, l)
  }
  e.bytes.push(dentro.reduce((a, q) => a + Math.max(0, q.bytes), 0))
  porRuta.set(v.ruta, e)
}
for (const [ruta, e] of porRuta) {
  const kb = (b) => (b / 1024).toFixed(1)
  console.log(`\n${ruta}  visitas=${e.visitas}  viajes(mediana)=${med(e.viajes)}  KB(mediana)=${kb(med(e.bytes))}`)
  const orden = [...e.detalle]
    .map(([k, l]) => [k, l.length / e.visitas, med(l.map((q) => q.ms)), Math.max(...l.map((q) => q.ms)), med(l.map((q) => q.bytes))])
    .sort((a, b) => b[2] - a[2])
  for (const [k, n, m, mx, b] of orden) {
    console.log(`    ${n.toFixed(1).padStart(4)}×  ${String(m).padStart(6)} ms (máx ${String(mx).padStart(6)})  ${kb(b).padStart(8)} KB  ${k}`)
  }
}
