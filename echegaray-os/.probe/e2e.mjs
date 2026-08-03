import { readFileSync } from 'node:fs'
import { extraerDeTabla, extraerDeTarjetas, esAptoTesoreria } from '../orquestador/lib/tesoreria/instrumentos.mjs'
const mapa = JSON.parse(readFileSync('.probe/mapa.json', 'utf8'))
let total = 0, aptos = 0, conTasa = 0
for (const p of mapa) {
  if (p.estado !== 'ok') continue
  const deTabla = p.tabla?.filas?.length ? extraerDeTabla(p.tabla, { url: p.ruta }).instrumentos : []
  const deTarj = p.tarjetas?.length ? extraerDeTarjetas(p.tarjetas, { url: p.ruta }) : []
  const inst = [...deTabla, ...deTarj]
  const ap = inst.filter((i) => esAptoTesoreria(i.categoria))
  const ct = ap.filter((i) => i.tasa)
  total += inst.length; aptos += ap.length; conTasa += ct.length
  console.log(`\n═══ ${p.ruta}`)
  console.log(`   ${inst.length} instrumentos · ${ap.length} aptos tesorería · ${ct.length} con tasa declarada`)
  if (p.tabla?.cabecera?.length) console.log(`   cabecera: ${p.tabla.cabecera.join(' | ')}`)
  for (const i of ct.slice(0, 4)) {
    console.log(`   ✓ ${String(i.ticker ?? '').padEnd(7)} ${String(i.nombre).slice(0,38).padEnd(38)} ${i.moneda} ${i.tasa.tipo} ${(i.tasa.valor*100).toFixed(2)}%  liq=${i.liquidacion_dias}d resc=${i.plazo_rescate_dias}`)
  }
  const sinTasa = ap.filter((i) => !i.tasa)
  if (sinTasa.length) console.log(`   (sin tasa declarada, fuera del ranking: ${sinTasa.slice(0,4).map(i=>i.ticker ?? i.nombre).join(', ')}${sinTasa.length>4?'…':''})`)
}
console.log(`\n══════ TOTAL: ${total} instrumentos · ${aptos} aptos · ${conTasa} con tasa`)
