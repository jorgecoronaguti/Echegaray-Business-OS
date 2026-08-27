#!/usr/bin/env node
// PLANO → COTIZACIÓN, de punta a punta y desde la terminal.
//
// Es el mismo camino que atraviesa `@xsas analizá los planos de X`: la tool del gateway y este
// script llaman a `lib/plano/pipeline.mjs`, no a dos implementaciones parecidas. Existe porque un
// pipeline que sólo se puede correr por chat no se puede depurar ni medir.
//
//   node orquestador/scripts/plano-a-cotizacion.mjs quattropani            # analiza, no escribe
//   node orquestador/scripts/plano-a-cotizacion.mjs quattropani --persistir --numero COT-XSAS-001
//   node orquestador/scripts/plano-a-cotizacion.mjs quattropani --refrescar # ignora el caché
//   node orquestador/scripts/plano-a-cotizacion.mjs quattropani --json      # el artefacto entero

import fs from 'node:fs'
import { query } from '../lib/db.mjs'
import { makeGoogleClient } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { correr } from '../lib/plano/pipeline.mjs'
import { agruparPartidas, armar, persistir, cascadaDe } from '../lib/plano/cotizacion-v0.mjs'

const args = process.argv.slice(2)
const termino = args.find((a) => !a.startsWith('--'))
const tiene = (f) => args.includes(f)
const valor = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null }

if (!termino) {
  console.error('uso: plano-a-cotizacion.mjs <termino> [--persistir] [--numero N] [--refrescar] [--json] [--salida archivo]')
  process.exit(1)
}

const money = (n) => (n === null || n === undefined ? '—' : `$ ${Number(n).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`)

const r = await correr({ query, google: makeGoogleClient({ config: loadConfig() }), termino, refrescar: tiene('--refrescar') })

const { partidas, candidatas } = agruparPartidas(r.mapeo.mapeos)
const cot = armar({
  cliente: r.laminas[0]?.proyecto?.propietario ?? null,
  obraNombre: r.laminas[0]?.proyecto?.nombre ?? termino,
  partidas, composiciones: r.composiciones, candidatas,
})

console.log(`\n═══ ${termino.toUpperCase()} · PLANO → COTIZACIÓN ═══`)
// EL CONTROL VA PRIMERO Y NO AL FINAL: leer el total antes cambia lo que uno cree del resto.
console.log(`\n▸ ${r.control.resumen}`)
console.log(`  ${r.control.porQue}`)
if (r.tipoObra?.tipo) console.log(`  tipo de obra: ${r.tipoObra.tipo}${r.tipoObra.textoLiteral ? ` — «${r.tipoObra.textoLiteral}»` : ''} [${r.tipoObra.fuente}]`)
else console.log(`  tipo de obra: ${r.tipoObra?.porQue ?? 'sin declarar'}`)

console.log(`documentos en Drive      ${r.documentos.total}  (insumos ${r.documentos.insumos.length} · reservados para validar ${r.documentos.reservados.length})`)
console.log(`planos interpretados     ${r.documentos.planos.legibles.length}${r.documentos.planos.noLegibles.length ? `  (${r.documentos.planos.noLegibles.length} no legibles: ${r.documentos.planos.noLegibles.map((d) => d.name).join(', ')})` : ''}`)
console.log(`elementos detectados     ${r.computo.detectados}`)
console.log(`elementos computados     ${r.computo.computados}   (con hueco declarado ${r.computo.conHueco})`)
console.log(`partidas de la cotización ${cot.partidas.length}   (candidatas sin partida ${candidatas.length})`)
for (const l of r.laminas) if (l.medicion) console.log(`segunda pasada           ${l.archivo}: ${l.medicion.resueltos}/${l.medicion.pendientes} resueltos${l.medicion.deCache ? ' (caché)' : ''}`)
console.log(`llamadas al modelo       ${r.ia.llamadas}${r.ia.deCache ? ` (${r.ia.deCache} láminas de caché)` : ''}  costo USD ${r.ia.usos.reduce((a, u) => a + (u.usd ?? 0), 0).toFixed(4)}`)
console.log(`tiempo                   ${(r.ms / 1000).toFixed(1)} s`)

if (r.control.preguntas.length) {
  console.log(`\n── LAS ${Math.min(8, r.control.preguntas.length)} PREGUNTAS QUE MÁS DESTRABAN (de ${r.control.preguntas.length}) ──`)
  for (const p of r.control.preguntas.slice(0, 8)) console.log(`   [${String(p.destraba.length).padStart(2)}] ${p.pregunta}\n        → ${p.quienLoTiene} · ${p.origen} · ${p.destraba.slice(0, 6).join(', ')}`)
}

if (r.control.omisionesCircot.length) {
  console.log(`\n── OMISIONES POTENCIALES QUE SEÑALA EL CIRCOT ${r.referenciaCircot?.periodo ?? ''} (${r.control.omisionesCircot.length}, todas a confirmar) ──`)
  for (const o of r.control.omisionesCircot.slice(0, 12)) console.log(`   ${o.rubro.padEnd(30)} ${o.descripcion} (${o.unidad})`)
}

if (r.checklist?.length) {
  const porEstado = {}
  for (const c of r.checklist) porEstado[c.estado] = (porEstado[c.estado] ?? 0) + 1
  console.log(`\n── CHECKLIST CONSTRUCTIVO ${r.tipoObra.tipo} (CIRCOT Modelo III) ── ${Object.entries(porEstado).map(([k, v]) => `${k} ${v}`).join(' · ')}`)
  for (const c of r.checklist.filter((x) => x.estado === 'APLICA')) console.log(`   APLICA y no está: ${c.partida} (${c.unidad}) — ${c.incidencia}% del costo directo en el modelo`)
}

console.log(`\n── PROCESOS DERIVADOS ── ${r.procesos.procesos.length} tareas (${r.procesos.conCantidad} con cantidad derivada, ${r.procesos.sinCantidad} con la cantidad abierta), todas PENDIENTE_CONFIRMACION`)

console.log('\n── PARTIDAS ──')
let rubro = null
for (const p of cot.partidas) {
  if (p.rubro !== rubro) { rubro = p.rubro; console.log(`\n  ${rubro}`) }
  console.log(`   ${p.codigo.padEnd(9)} ${p.descripcion.slice(0, 52).padEnd(53)} ${String(p.cantidad).padStart(10)} ${String(p.unidad).padEnd(3)} ${money(p.subtotal).padStart(16)}`)
  for (const l of p.lineas) console.log(`        ← ${l.elemento} · ${l.documento}${l.vista ? ` · ${l.vista}` : ''} · «${l.textoLiteral ?? '—'}» · ${l.criterio}`)
}

if (r.mapeo.correcciones?.length) {
  console.log('\n── CORRECCIONES DEL CRITERIO TÉCNICO SOBRE EL MATCHEO POR VOCABULARIO ──')
  for (const c of r.mapeo.correcciones) console.log(`   ${c.elemento}: ${c.que}`)
}

if (candidatas.length) {
  console.log('\n── SIN PARTIDA EN LA BASE MAESTRA (PARTIDA_CANDIDATA) ──')
  for (const c of candidatas) console.log(`   ${c.computo.id} · ${c.computo.nombre} · ${c.computo.cantidad?.valor} ${c.computo.unidad} — ${c.porQue}`)
}

const huecos = r.computo.items.filter((i) => i.cantidad === null)
if (huecos.length) {
  console.log('\n── FALTA_DATO (elementos detectados que NO se pudieron computar) ──')
  for (const h of huecos) console.log(`   ${h.id} · ${h.nombre} — ${h.faltan.join('; ')}`)
}

console.log(`\ncosto directo (sólo lo computable): ${money(cot.costoDirecto)}   ·   HH ${cot.hh}`)
if (cot.sinCosto.length) console.log(`partidas sin costo: ${cot.sinCosto.map((s) => s.codigo).join(', ')}`)

if (tiene('--persistir')) {
  const numero = valor('--numero') ?? `COT-XSAS-${new Date().toISOString().slice(0, 10)}`
  const { cotizacionId } = await persistir({ query }, cot, { numero, notas: `generada por XSAS desde ${r.documentos.planos.legibles.map((d) => d.name).join(' + ')} · reservados para validación ciega: ${r.documentos.reservados.length} documentos` })
  const casc = await cascadaDe({ query }, cotizacionId)
  console.log(`\n── COTIZACIÓN PERSISTIDA ── ${numero}  id=${cotizacionId}`)
  console.log(`   costo directo ${money(casc?.costo_directo)} · GG ${money(casc?.gastos_generales)} · industrial ${money(casc?.costo_industrial)}`)
  console.log(`   beneficio ${money(casc?.beneficio)} · financiero ${money(casc?.financiero)} · IIBB ${money(casc?.iibb)}`)
  console.log(`   VENTA SIN IVA ${money(casc?.venta_sin_iva)}   ·   con IVA ${money(casc?.venta_final)}   ·   HH ${casc?.hh_previstas}`)
}

const salida = valor('--salida')
if (tiene('--json') || salida) {
  const artefacto = JSON.stringify({
    termino, carpeta: r.carpeta, generado: new Date().toISOString(),
    documentos: { insumos: r.documentos.insumos, reservados: r.documentos.reservados },
    laminas: r.laminas, computo: r.computo, cotizacion: cot, ia: r.ia,
  }, null, 2)
  if (salida) { fs.writeFileSync(salida, artefacto); console.log(`\nartefacto → ${salida}`) } else console.log(artefacto)
}
process.exit(0)
