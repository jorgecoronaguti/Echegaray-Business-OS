#!/usr/bin/env node
// LA VALIDACIÓN CIEGA, SEGUNDA MITAD: abrir el histórico DESPUÉS de haber congelado V0.
//
//   node orquestador/scripts/plano-comparar-historico.mjs COT-XSAS-V0-QUATTROPANI COT-2026-001
//   ... --aprender    escribe los aprendizajes CANDIDATO en `conocimiento_empresa`
//
// Se corre aparte del pipeline a propósito: si comparar y cotizar vivieran en el mismo comando,
// nada impediría que mañana alguien mirara el histórico antes de congelar. El orden es la prueba.

import { query } from '../lib/db.mjs'
import { comparar } from '../lib/plano/comparar.mjs'
import { aprendizajesDe, persistirAprendizajes } from '../lib/plano/aprender.mjs'

const [numeroV0, numeroHist] = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const aprender = process.argv.includes('--aprender')
if (!numeroV0 || !numeroHist) {
  console.error('uso: plano-comparar-historico.mjs <numero-v0> <numero-historico> [--aprender]')
  process.exit(1)
}

const money = (n) => (n === null || n === undefined ? '—' : `$ ${Math.round(Number(n)).toLocaleString('es-AR')}`)

async function partidasDe(numero) {
  const c = await query(`select id, obra_nombre from public.cotizaciones where numero = $1 and vigente limit 1`, [numero])
  if (!c.rows[0]) throw new Error(`no existe la cotización ${numero}`)
  const p = await query(
    `select codigo, descripcion, cantidad, unidad, subtotal, hh from public.cotizacion_partida_valorizada
      where cotizacion_id = $1 order by orden`, [c.rows[0].id])
  const casc = await query(`select costo_directo, venta_sin_iva, venta_final, hh_previstas, n_partidas from public.cotizacion_cascada where id = $1`, [c.rows[0].id])
  return { id: c.rows[0].id, obra: c.rows[0].obra_nombre, partidas: p.rows, cascada: casc.rows[0] }
}

const v0 = await partidasDe(numeroV0)
const hist = await partidasDe(numeroHist)

// Los elementos que XSAS detectó y no pudo medir: distinguen «no lo vi» de «lo vi y no lo pude medir».
const huecos = await query(
  `select distinct c.elemento from public.computo c
     join public.cotizacion_partida p on p.id = c.cotizacion_partida_id
    where p.cotizacion_id = $1`, [v0.id])

const comp = comparar({
  v0: v0.partidas, historico: hist.partidas,
  elementos: huecos.rows.map((h) => ({ id: h.elemento, cantidad: 1, faltan: [] })),
})

console.log(`\n═══ V0 (${numeroV0}) CONTRA EL HISTÓRICO (${numeroHist}) ═══`)
console.log(`costo directo   V0 ${money(v0.cascada.costo_directo).padStart(16)}   histórico ${money(hist.cascada.costo_directo).padStart(16)}   ${comp.desvioTotalPct > 0 ? '+' : ''}${comp.desvioTotalPct} %`)
console.log(`venta sin IVA   V0 ${money(v0.cascada.venta_sin_iva).padStart(16)}   histórico ${money(hist.cascada.venta_sin_iva).padStart(16)}`)
console.log(`HH              V0 ${String(Math.round(v0.cascada.hh_previstas)).padStart(16)}   histórico ${String(Math.round(hist.cascada.hh_previstas)).padStart(16)}`)
console.log(`partidas        V0 ${String(comp.partidasV0).padStart(16)}   histórico ${String(comp.partidasHistorico).padStart(16)}   coincidentes ${comp.coincidentes.length}`)

console.log('\n── DIFERENCIAS CLASIFICADAS ──')
for (const causa of [...new Set(comp.diferencias.map((d) => d.causa.clave))]) {
  const ds = comp.diferencias.filter((d) => d.causa.clave === causa)
  const monto = ds.reduce((a, d) => a + Math.abs((d.v0?.subtotal ?? 0) - (d.historico?.subtotal ?? 0)), 0)
  console.log(`\n  ${causa.toUpperCase()} — ${ds.length} caso(s), ${money(monto)} de diferencia · se arregla en: ${ds[0].causa.arregla}`)
  for (const d of ds) {
    const izq = d.v0 ? `${d.v0.cantidad} ${d.v0.unidad} ${money(d.v0.subtotal)}` : '—'
    const der = d.historico ? `${d.historico.cantidad} ${d.historico.unidad ?? ''} ${money(d.historico.subtotal)}` : '—'
    console.log(`     ${(d.codigo ?? '').padEnd(9)} ${String(d.descripcion ?? '').slice(0, 44).padEnd(45)} V0 ${izq.padEnd(28)} HIST ${der}`)
    if (d.detalle) console.log(`               ${d.detalle}`)
  }
}

const aps = aprendizajesDe(comp, { proyecto: v0.obra, obra: hist.obra })
console.log(`\n── APRENDIZAJES CANDIDATO (${aps.length}) ──`)
for (const a of aps) {
  console.log(`\n  [${a.tipo}] ${a.clave}`)
  console.log(`   CUÁNDO: ${a.condicion}`)
  console.log(`   DICE:   ${a.afirmacion}`)
  console.log(`   PORQUE: ${a.porQue}`)
}

if (aprender) {
  const escritos = await persistirAprendizajes({ query }, aps)
  console.log(`\npersistidos en public.conocimiento_empresa (tipo CANDIDATO): ${escritos.length}`)
}
process.exit(0)
