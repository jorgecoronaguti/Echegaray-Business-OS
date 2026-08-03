import { readFileSync } from 'node:fs'
import { extraerDeTabla, extraerDeTarjetas, esAptoTesoreria } from '../orquestador/lib/tesoreria/instrumentos.mjs'
import { compararAlternativas } from '../orquestador/lib/tesoreria/comparar.mjs'
import { evaluarRiesgo, PERFILES } from '../orquestador/lib/tesoreria/riesgo.mjs'
const mapa = JSON.parse(readFileSync('.probe/mapa.json', 'utf8'))
const inst = []
for (const p of mapa) {
  if (p.estado !== 'ok') continue
  inst.push(...(p.tabla?.filas?.length ? extraerDeTabla(p.tabla, { url: p.ruta }).instrumentos : []))
  inst.push(...(p.tarjetas?.length ? extraerDeTarjetas(p.tarjetas, { url: p.ruta }) : []))
}
const aptos = inst.filter((i) => esAptoTesoreria(i.categoria))
console.log(`aptos: ${aptos.length} · con tasa: ${aptos.filter(i=>i.tasa).length}`)
const motivos = {}
for (const i of aptos) {
  const r = evaluarRiesgo(i, PERFILES.caja_operativa, { ahora: new Date() })
  const k = r.apto ? 'APTO' : (r.motivos || [r.motivo]).flat().join(' | ')
  motivos[k] = (motivos[k] || 0) + 1
}
console.log('\nveredicto de riesgo sobre los 142 aptos:')
for (const [k, v] of Object.entries(motivos).sort((a,b)=>b[1]-a[1])) console.log(`  ${String(v).padStart(4)} × ${k.slice(0,110)}`)
const ventanas = [{ bloque: 'C', monto_maximo: 50000000, dias: 30 }]
const c = compararAlternativas(aptos, ventanas, 0.6278)
console.log('\nranking bloque C (vara 62,78% = costo del descubierto):')
for (const r of c.rankings) {
  console.log(`  ${r.bloque}: ${r.ranking.length} en ranking, ${(r.descartados||[]).length} descartados`)
  for (const x of r.ranking.slice(0,5)) console.log(`     ${x.instrumento} · neto período ${(x.rendimiento_neto_periodo*100).toFixed(2)}%`)
}
