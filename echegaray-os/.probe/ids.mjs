import { readFileSync } from 'node:fs'
import { extraerDeTabla, extraerDeTarjetas, esAptoTesoreria } from '../orquestador/lib/tesoreria/instrumentos.mjs'
const mapa = JSON.parse(readFileSync('.probe/mapa.json', 'utf8'))
const todos = []
for (const p of mapa) {
  if (p.estado !== 'ok') continue
  todos.push(...(p.tabla?.filas?.length ? extraerDeTabla(p.tabla, { url: p.ruta }).instrumentos : []))
  todos.push(...(p.tarjetas?.length ? extraerDeTarjetas(p.tarjetas, { url: p.ruta }) : []))
}
const aptos = todos.filter((i) => esAptoTesoreria(i.categoria))
const porId = {}
for (const i of aptos) (porId[i.id] ??= []).push(i)
const colisiones = Object.entries(porId).filter(([, v]) => v.length > 1)
console.log(`aptos: ${aptos.length} · ids únicos: ${Object.keys(porId).length} · IDS COLISIONADOS: ${colisiones.length}`)
for (const [id, v] of colisiones.slice(0, 4)) {
  console.log(`\n  id "${id}" → ${v.length} instrumentos DISTINTOS:`)
  for (const i of v.slice(0, 5)) console.log(`     plazo=${i.liquidacion_dias}d tasa=${i.tasa ? (i.tasa.valor*100).toFixed(2)+'%' : 'null'}`)
}
