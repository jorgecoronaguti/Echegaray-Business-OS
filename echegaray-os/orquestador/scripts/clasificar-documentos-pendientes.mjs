#!/usr/bin/env node
// LOS 381 DOCUMENTOS QUE NINGUNA REGLA RECONOCIÓ: propuesta de tipo, para que una persona confirme.
//
// Primero se valida el modelo contra los documentos que las reglas SÍ tipiaron —validación cruzada,
// para saber si aprendió el concepto o memorizó— y recién después se propone sobre los pendientes.
// Proponer sin haber medido sería escribir 381 rótulos sin saber cuántos están mal.
//
//   node orquestador/scripts/clasificar-documentos-pendientes.mjs [--aplicar] [--pliegues 5]

import { query } from '../lib/db.mjs'
import { ejemplos, pendientes, votarVecinos, K, MODELO_INDICE } from '../lib/ml/clasificar-documento.mjs'
import { embeber, cargar, CANDIDATOS } from '../lib/ml/motor-embeddings.mjs'
import { drenarTrazas, registrarTraza } from '../lib/ml/traza.mjs'
import { randomUUID } from 'node:crypto'

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? Number(process.argv[i + 1]) : d }
const APLICAR = process.argv.includes('--aplicar')
const PLIEGUES = arg('--pliegues', 5)
const recorte = (t) => String(t ?? '').slice(0, 1200)

async function main() {
  const ej = await ejemplos()
  const pen = await pendientes()
  const clases = [...new Set(ej.map((e) => e.tipo))]
  console.log(`EJEMPLOS   ${ej.length} documentos tipados por REGLA · ${clases.length} clases`)
  console.log(`PENDIENTES ${pen.length} que ninguna regla reconoció\n`)

  const m = await cargar(MODELO_INDICE)
  console.log(`MODELO     ${CANDIDATOS[MODELO_INDICE].id} @ ${CANDIDATOS[MODELO_INDICE].revision.slice(0, 12)} · cargado en ${m.msCarga} ms`)
  const t0 = Date.now()
  const vecEj = await embeber(MODELO_INDICE, ej.map((e) => recorte(e.texto)), { rol: 'documento' })
  const conVector = ej.map((e, i) => ({ ...e, vector: vecEj[i] }))
  console.log(`           ${ej.length} ejemplos embebidos en ${Date.now() - t0} ms\n`)

  // ── VALIDACIÓN CRUZADA: ¿aprendió el concepto o memorizó? ──
  let ok = 0, noDecide = 0, mal = 0
  const confusion = new Map()
  for (let p = 0; p < PLIEGUES; p += 1) {
    const test = conVector.filter((_, i) => i % PLIEGUES === p)
    const train = conVector.filter((_, i) => i % PLIEGUES !== p)
    for (const e of test) {
      const r = votarVecinos(e.vector, train)
      if (r.tipo === null) noDecide += 1
      else if (r.tipo === e.tipo) ok += 1
      else { mal += 1; const k = `${e.tipo} → ${r.tipo}`; confusion.set(k, (confusion.get(k) ?? 0) + 1) }
    }
  }
  const n = conVector.length
  const pc = (x) => `${((x / n) * 100).toFixed(1)}%`
  console.log(`VALIDACIÓN CRUZADA (${PLIEGUES} pliegues, k=${K}) sobre ${n} documentos`)
  console.log(`  reproduce la regla   ${String(ok).padStart(4)}   ${pc(ok)}`)
  console.log(`  no decide            ${String(noDecide).padStart(4)}   ${pc(noDecide)}`)
  console.log(`  contradice la regla  ${String(mal).padStart(4)}   ${pc(mal)}`)
  if (confusion.size) {
    console.log('  DÓNDE SE CONTRADICEN (regla → modelo):')
    for (const [k, v] of [...confusion].sort((a, b) => b[1] - a[1]).slice(0, 6)) console.log(`    ${v} × ${k}`)
  }

  // ── LA PROPUESTA SOBRE LOS PENDIENTES ──
  const t1 = Date.now()
  const vecPen = await embeber(MODELO_INDICE, pen.map((x) => recorte(x.texto)), { rol: 'documento' })
  const props = pen.map((x, i) => ({ ...x, ...votarVecinos(vecPen[i], conVector) }))
  const msPen = Date.now() - t1

  const decididos = props.filter((p) => p.tipo)
  const porTipo = new Map()
  for (const p of decididos) porTipo.set(p.tipo, (porTipo.get(p.tipo) ?? 0) + 1)
  console.log(`\nPROPUESTA  ${decididos.length} de ${pen.length} (${((decididos.length / pen.length) * 100).toFixed(1)}%) · ${Math.round(msPen / pen.length)} ms cada uno`)
  console.log(`           ${pen.length - decididos.length} quedan para una persona o para Claude`)
  for (const [t, c] of [...porTipo].sort((a, b) => b[1] - a[1])) console.log(`    ${String(t).padEnd(22)} ${c}`)
  console.log('\n  LAS DIEZ MÁS SEGURAS:')
  for (const p of [...decididos].sort((a, b) => b.razon - a.razon).slice(0, 10)) {
    console.log(`    ${String(p.tipo).padEnd(20)} ${String(p.razon).padStart(6)}×  ${String(p.nombre).slice(0, 44)}`)
  }

  if (!APLICAR) { console.log('\n═══ SECO. Repetir con --aplicar para escribir las propuestas. ═══'); return }

  for (const p of decididos) {
    await query(`update public.documento_leido
                    set tipo_propuesto = $2, tipo_propuesto_conf = $3, tipo_propuesto_por = $4
                  where drive_file_id = $1 and tipo is null`,
    [p.drive_file_id, p.tipo, p.confianza, `vecinos-${MODELO_INDICE}`])
  }
  registrarTraza({ traceId: randomUUID(), capacidad: 'classify', metodo: 'ml-local',
    modelo: CANDIDATOS[MODELO_INDICE].id, proveedor: 'local', ms: msPen,
    accion: 'sugerir', sensibilidad: 'confidencial' }, { modulo: 'clasificar-documentos-pendientes' })
  console.log(`\n═══ ${decididos.length} propuestas escritas en \`tipo_propuesto\`. \`tipo\` NO se tocó. ═══`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const cerrar = async (c) => { await drenarTrazas().catch(() => {}); process.exit(c) }
  main().then(() => cerrar(0)).catch((e) => { console.error('ERROR:', e.stack || e.message); cerrar(1) })
}
