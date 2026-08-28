#!/usr/bin/env node
// LA REGRESIÓN COMPLETA DE UN PROYECTO: A, B, y la comparación entre las dos.
//
// Corre el circuito ENTERO dos veces sobre los mismos archivos —documentación, CAD, segmentación,
// vistas, cómputo, partidas, procesos, control— e imprime todo lo que hay que reportar de una
// corrida: qué encontró, qué abrió, qué midió, qué quedó abierto y si las dos corridas dieron lo
// mismo.
//
// Las dos corridas usan el MISMO caché de interpretación a propósito: «inputs congelados» significa
// que la lectura de cada lámina es la misma. Con `--refrescar` se mide la otra cosa —cuánto varía
// la lectura del modelo entre dos miradas—, que es un dato distinto y cuesta plata.
//
//   node orquestador/scripts/xsas-regresion.mjs quattropani
//   node orquestador/scripts/xsas-regresion.mjs quattropani --sin-regiones   # sólo lámina completa
//   node orquestador/scripts/xsas-regresion.mjs quattropani --aprender       # persiste candidatos

import { loadConfig } from '../lib/config.mjs'
import { query } from '../lib/db.mjs'
import { makeGoogleClient } from '../lib/google.mjs'
import { correr } from '../lib/plano/pipeline.mjs'
import { aprendizajesDeIngesta, persistirAprendizajes } from '../lib/plano/aprender.mjs'

const config = loadConfig()
const args = process.argv.slice(2)
const termino = args.find((a) => !a.startsWith('--'))
if (!termino) {
  console.error('uso: xsas-regresion.mjs <termino> [--sin-regiones] [--refrescar] [--aprender]')
  process.exit(1)
}
const porRegiones = !args.includes('--sin-regiones')
const google = makeGoogleClient({ config })

const corridas = []
for (const n of ['A', 'B']) {
  const t0 = Date.now()
  const r = await correr({ query, google, termino, porRegiones, refrescar: args.includes('--refrescar') && n === 'A' })
  corridas.push({ n, r, ms: Date.now() - t0, usd: r.ia.usos.reduce((a, u) => a + (u.usd ?? 0), 0) })
}
const [A, B] = corridas
const r = A.r

const pct = (x) => `${Math.round((x ?? 0) * 100)}%`
console.log(`\n═══ ${termino.toUpperCase()} · REGRESIÓN XSAS ═══\n`)

console.log('── LO QUE ENCONTRÓ Y ABRIÓ ──')
console.log(`  documentos en Drive          ${r.documentos.total} (insumos ${r.documentos.insumos.length} · reservados para validar ${r.documentos.reservados.length})`)
console.log(`  CAD abiertos                 ${r.documental.cad.length}: ${r.documental.cad.map((c) => `${c.archivo} [${c.version?.firma ?? c.formato}] ${c.medicion.entidades} entidades · ${c.medicion.capas.length} capas · ${c.medicion.cotas.length} cotas · ${c.medicion.bloques.length} bloques`).join(' | ') || '—'}`)
console.log(`  láminas PDF                  ${r.documental.segmentaciones.length}: ${r.documental.segmentaciones.map((s) => `${s.archivo} → ${s.laminas.map((l) => `${l.regiones.length} vistas (${l.metodo}), ${l.logrados} recortes${l.solape ? ` · solape: ${l.solape.porQue}, suma ${l.solape.sumaSobreHoja}× la hoja` : ''}`).join(', ')}`).join(' | ') || '—'}`)
console.log(`  documentos de especificación ${r.documental.documentales.length}: ${r.documental.documentales.map((d) => `${d.archivo} [${d.clase}]`).join(' | ') || '—'}`)
console.log(`  SIN LEER                     ${r.documental.noLeidos.length}${r.documental.noLeidos.length ? `: ${r.documental.noLeidos.map((x) => `${x.archivo} — ${String(x.porQue).slice(0, 70)}`).join(' | ')}` : ''}`)

console.log('\n── LO QUE INTERPRETÓ ──')
console.log(`  vistas miradas               ${r.porRegion.length}${r.porRegion.length ? ` (${r.porRegion.filter((x) => x.deCache).length} de caché)` : ''}`)
console.log(`  elementos detectados         ${r.computo.detectados}`)
console.log(`  elementos con cantidad       ${r.computo.computados}   → cobertura de CÓMPUTO ${pct(r.control.cobertura.coberturaComputo)}`)
console.log(`  elementos con hueco          ${r.computo.conHueco}`)
console.log(`  cantidades resueltas por CAD ${r.medicionCad.resueltos.length} de ${r.medicionCad.bloquesDisponibles} bloque(s) con nombre propio · ${r.medicionCad.cotas} cotas leídas`)
for (const x of r.medicionCad.resueltos) console.log(`      ${x.elemento} = ${x.cantidad} — ${x.porQue}`)

console.log('\n── EL PROYECTO CRUZADO ──')
console.log(`  ${r.proyecto.resumen}`)
for (const c of r.proyecto.conflictos) console.log(`  CONFLICTO  ${String(c.porQue).slice(0, 150)}`)

console.log('\n── PARTIDAS Y PROCESOS ──')
console.log(`  Base Maestra                 ${r.catalogo} tareas con análisis vigente`)
console.log(`  mapeadas                     ${r.mapeo.mapeadas}   → cobertura de COTIZACIÓN ${pct(r.control.cobertura.cobertura)}`)
console.log(`  ambiguas                     ${r.mapeo.ambiguas}`)
console.log(`  candidatas sin partida       ${r.mapeo.candidatas}`)
console.log(`  procesos derivados           ${r.procesos.procesos.length} (${r.procesos.conCantidad} con cantidad, ${r.procesos.sinCantidad} abiertos), todos PENDIENTE_CONFIRMACION`)
console.log(`  omisiones que marca CIRCOT   ${r.control.omisionesCircot.length}`)
if (r.checklist?.length) {
  const e = {}
  for (const c of r.checklist) e[c.estado] = (e[c.estado] ?? 0) + 1
  console.log(`  checklist ${r.tipoObra.tipo}     ${Object.entries(e).map(([k, v]) => `${k} ${v}`).join(' · ')}`)
}

console.log('\n── EL CIERRE ──')
console.log(`  ${r.control.resumen}`)
console.log(`  ${r.control.porQue}`)
console.log(`\n  LAS ${r.control.decisiones.length} DECISIONES QUE CIERRAN ${r.control.preguntas.length - r.control.preguntasSueltas.length} DE LOS ${r.control.preguntas.length} HUECOS:`)
for (const d of r.control.decisiones) {
  console.log(`   [${String(d.destraba.length).padStart(3)} elementos · ${String(d.preguntasQueCierra).padStart(2)} preguntas] ${d.pregunta}`)
  console.log(`        cierra porque: ${d.porQueCierra}`)
  console.log(`        la decide: ${d.quienLoDecide}`)
}
if (r.control.preguntasSueltas.length) {
  console.log(`\n  Y ${r.control.preguntasSueltas.length} pregunta(s) suelta(s) que ninguna decisión cierra:`)
  for (const p of r.control.preguntasSueltas.slice(0, 6)) console.log(`   [${String(p.destraba.length).padStart(2)}] ${String(p.pregunta).slice(0, 120)}`)
}

const obra = r.obraDesdeCotizacion()
console.log('\n── GENEALOGÍA HACIA OBRA ──')
console.log(`  ${obra.porQue}`)
console.log(`  cada actividad conserva su origen CITABLE (documento + lámina + texto literal): ${obra.conservaOrigen}`)
if (obra.sinOrigenCitable.length) {
  console.log(`  ${obra.sinOrigenCitable.length} actividad(es) nacen SIN con qué volver al documento:`)
  for (const x of obra.sinOrigenCitable.slice(0, 8)) console.log(`     ${String(x.elemento).padEnd(22)} ${x.codigo}  falta: ${x.faltantes.join(', ')}`)
}
if (obra.actividades[0]) {
  console.log('  ejemplo de una actividad que puede nacer:')
  for (const l of obra.actividades[0].origen.cadena) console.log(`     ${l}`)
}

console.log('\n── A vs B ──')
for (const c of corridas) console.log(`  corrida ${c.n}: ${c.r.computo.computados}/${c.r.computo.detectados} computados · ${c.r.mapeo.mapeadas} mapeadas · ${c.r.ia.llamadas} llamadas · USD ${c.usd.toFixed(4)} · ${(c.ms / 1000).toFixed(1)} s`)
const igual = A.r.huella === B.r.huella
console.log(igual ? `  ✔ REPRODUCIBLE — misma huella (${A.r.huella.split('\n').length} elementos)` : '  ✖ NO REPRODUCIBLE:')
if (!igual) {
  const filas = (h) => new Map(h.split('\n').map((l) => [l.split('|')[0], l]))
  const fa = filas(A.r.huella)
  const fb = filas(B.r.huella)
  for (const k of new Set([...fa.keys(), ...fb.keys()])) if (fa.get(k) !== fb.get(k)) console.log(`     ${k}\n       A: ${fa.get(k) ?? '(no está)'}\n       B: ${fb.get(k) ?? '(no está)'}`)
}

const aps = aprendizajesDeIngesta(r, { proyecto: termino })
console.log('\n── APRENDIZAJE ──')
if (args.includes('--aprender')) {
  const escritos = await persistirAprendizajes({ query }, aps, { fuente: 'xsas:ingesta-documental', proyecto: termino })
  console.log(`  ${escritos.length} candidato(s) persistidos en public.conocimiento_empresa (tipo CANDIDATO):`)
} else {
  console.log(`  ${aps.length} candidato(s) listos (correr con --aprender para persistirlos):`)
}
for (const a of aps) console.log(`   ${a.clave}\n     cuando: ${a.condicion}\n     porque: ${a.porQue}`)

process.exit(igual ? 0 : 1)
