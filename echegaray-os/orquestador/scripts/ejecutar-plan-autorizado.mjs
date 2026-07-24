#!/usr/bin/env node
// EJECUTA EL PLAN DE TESORERÍA UNA VEZ QUE UNA AUTORIDAD LO AUTORIZÓ.
//
// POR QUÉ (24/07). La interfaz (o el dueño / Director IA / CFO IA) marca el plan vigente como
// 'autorizado'. Este ejecutor toma ESE plan ya guardado —el mismo que se vio y aprobó, sin releer el
// Sheet— y lo convierte en tareas de los especialistas vía el Financial Execution Orchestrator. Marca
// el plan 'ejecutado'. Es idempotente: si ya se ejecutó, no vuelve a crear tareas (dedupe en orq.*).
//
// NO decide ni recalcula: sólo materializa la ejecución de un plan que YA fue autorizado. La ejecución
// automática (sin autorización) sigue prohibida: si el plan está 'pendiente_ejecucion', no hace nada.
//
//   node orquestador/scripts/ejecutar-plan-autorizado.mjs

import { planVigente } from '../lib/plan-vigente.mjs'
import { sincronizarEjecucion } from '../lib/plan-ejecucion.mjs'
import { closePool } from '../lib/db.mjs'

async function main() {
  const v = await planVigente({})
  if (!v) { console.log('no hay plan vigente'); return }
  if (v.estado !== 'autorizado') {
    console.log(`plan en estado '${v.estado}': sólo se ejecuta un plan 'autorizado'. Nada que hacer.`)
    return
  }
  console.log(`plan autorizado por ${v.autorizado_por} — convirtiéndolo en trabajo (horizonte ${v.horizonte})…`)
  const r = await sincronizarEjecucion({}, {
    horizonte: v.horizonte,
    autorizadoPor: v.autorizado_por || 'interfaz',
    planPreCalculado: v.plan, // el plan YA aprobado, no se relee el Sheet
  })
  if (r.estado === 'ok') {
    console.log(`✓ ejecutado: ${r.creadas} tarea(s) creadas · ${r.dependencias} dependencia(s) · ${r.canceladas} cancelada(s). Por especialista: ${JSON.stringify(r.por_especialista)}`)
  } else {
    console.log(`no se ejecutó (estado ${r.estado}): ${r.nota || r.motivo || ''}`)
  }
}

main().then(() => closePool()).then(() => process.exit(0))
  .catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
