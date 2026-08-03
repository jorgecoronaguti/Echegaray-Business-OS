import { readFileSync } from 'node:fs'
import { extraerDeTabla, extraerDeTarjetas, esAptoTesoreria } from '../orquestador/lib/tesoreria/instrumentos.mjs'
import { compararAlternativas } from '../orquestador/lib/tesoreria/comparar.mjs'
const mapa = JSON.parse(readFileSync('.probe/mapa.json', 'utf8'))
const inst = []
for (const p of mapa) {
  if (p.estado !== 'ok') continue
  inst.push(...(p.tabla?.filas?.length ? extraerDeTabla(p.tabla, { url: p.ruta }).instrumentos : []))
  inst.push(...(p.tarjetas?.length ? extraerDeTarjetas(p.tarjetas, { url: p.ruta }) : []))
}
const aptos = inst.filter((i) => esAptoTesoreria(i.categoria))
const ventana = { bloque: 'C', monto_maximo: 50_000_000, dias_libres: 30, moneda: 'ARS', titulo: 'prueba', accionable: false }
const c = compararAlternativas(aptos, [ventana], { valor: 0.6278 })
const r = c.rankings[0]
console.log(`vara del período (30 días @ 62,78% TNA): ${(r.vara_periodo*100).toFixed(2)}%`)
console.log(`en ranking: ${r.ranking.length} · excluidos: ${r.excluidos.length}`)
console.log(`veredicto: ${r.veredicto}\n`)
for (const x of r.ranking.slice(0, 6)) {
  console.log(`  ✓ ${String(x.instrumento).slice(0,44).padEnd(44)} neto ${(x.rendimiento_neto_periodo*100).toFixed(2)}% · exceso ${(x.exceso_sobre_corte*100).toFixed(2)} pp`)
}
const porMotivo = {}
for (const e of r.excluidos) { const k = String(e.motivo).replace(/[\d.,]+/g,'N').slice(0,95); porMotivo[k]=(porMotivo[k]||0)+1 }
console.log('\nmotivos de exclusión:')
for (const [k,v] of Object.entries(porMotivo).sort((a,b)=>b[1]-a[1]).slice(0,8)) console.log(`  ${String(v).padStart(4)} × ${k}`)
