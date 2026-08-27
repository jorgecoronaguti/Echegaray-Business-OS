#!/usr/bin/env node
// EL CICLO DE XSAS — observar, comparar, aprender. Sin conversación y sin gastar un token.
//
//   node orquestador/scripts/xsas-ciclo.mjs --dry     muestra qué aprendería, no escribe
//   node orquestador/scripts/xsas-ciclo.mjs           aprende
//   node orquestador/scripts/xsas-ciclo.mjs --json    para otro programa
//
// ═══ POR QUÉ NO NECESITA A NADIE ═══
//
// Corre por timer sobre lo que los partes de obra y las horas cargadas ya dejaron en la base. No
// pregunta, no espera una orden y no abre un chat: cuando alguien carga un parte, el rendimiento de
// esa actividad queda medido en la siguiente corrida. Si el proveedor del modelo está caído, esto
// anda igual — es aritmética sobre datos propios.

import { query, closePool } from '../lib/db.mjs'
import { aprender, aprenderDuracion } from '../lib/xsas-aprendizaje.mjs'

const DRY = process.argv.includes('--dry')
const JSON_OUT = process.argv.includes('--json')

const pct = (x) => (x == null ? '—' : `${x > 0 ? '+' : ''}${x.toFixed(1)}%`)
const hs = (x) => (x == null ? '—' : x.toFixed(4))

const r = await aprender({ query }, { dry: DRY })
// La duración es la OTRA métrica y corre aparte: no necesita una sola hora imputada.
const d = await aprenderDuracion({ query }, { dry: DRY })

if (JSON_OUT) {
  console.log(JSON.stringify({ rendimiento: r, duracion: d }, null, 2))
} else {
  console.log(`\nXSAS · ciclo de obra${DRY ? ' (ENSAYO — no escribe)' : ''}\n`)
  console.log(`  ${r.miradas} actividades con algún dato real · ${r.aprendidas} enseñan un rendimiento`)
  console.log(`  ${r.validadas} VALIDADAS · ${r.candidatas} CANDIDATAS`)
  if (r.sinTipoDeTarea) {
    console.log(`  ▲ ${r.sinTipoDeTarea} rindieron un número pero no dicen de qué tarea son: no se pueden reutilizar.`)
  }
  console.log()
  for (const f of r.filas) {
    const o = f.obs
    console.log(`  [${f.veredicto.estado}·${f.veredicto.confianza}] ${o.obra} — ${o.tarea}`)
    console.log(`      real ${hs(o.hsUnitarias)} hs/${o.unidad ?? '?'}  ·  plan ${hs(o.hsUnitariasPlan)}  ·  desvío ${pct(o.derivado.desvioProductividadPct)}  ·  avance ${o.avancePct?.toFixed(0) ?? '—'}%`)
    console.log(`      ${f.veredicto.porQue}`)
    if (o.faltantes.length) console.log(`      falta: ${o.faltantes.join(' · ')}`)
  }
  console.log(`  DURACIÓN — ${d.medidas} actividades terminadas con plan y real · ${d.validadas} VALIDADAS · ${d.tardaronMas} tardaron más`)
  if (d.sinTipo) console.log(`     ▲ ${d.sinTipo} sin tipo de tarea: el hecho se guarda, pero no se puede reutilizar en otra obra todavía.`)
  console.log()
}

await closePool()
