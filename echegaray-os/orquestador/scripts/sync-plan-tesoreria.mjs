#!/usr/bin/env node
// RECÁLCULO AUTOMÁTICO DEL PLAN DE TESORERÍA — lo único automático de la ejecución financiera.
//
// POR QUÉ (24/07). El dueño: "mantené automático únicamente el recálculo de finanzas.plan_tesoreria.
// Cuando el plan cambie, mostrar el nuevo plan y marcarlo como pendiente de ejecución, pero no crear
// tareas operativas hasta recibir autorización."
//
// Este paso corre al final del ciclo del Flujo de Caja (después de que las pestañas y el calendario
// quedaron al día): recalcula el plan y guarda su snapshot en public.finanzas_plan_vigente. Si lo
// ejecutable CAMBIÓ, el snapshot queda 'pendiente_ejecucion' con el detalle de qué cambió. NO crea
// ninguna tarea: la ejecución (Financial Execution Orchestrator) sólo la dispara una autoridad.
//
// Es barato y sin efectos: sólo lee el Sheet y calcula. No toca orq.tasks.

import { makeGoogleClient } from '../lib/google.mjs'
import { planTesoreria } from '../lib/plan-tesoreria.mjs'
import { snapshotPlan } from '../lib/plan-vigente.mjs'
import { registrarFotoSeguro } from '../lib/registro-aprendizaje.mjs'
import { closePool } from '../lib/db.mjs'

const HORIZONTE = process.env.ORQ_PLAN_HORIZONTE || 'dias_7'

async function main() {
  const google = makeGoogleClient({})
  const plan = await planTesoreria({ google }, { horizonte: HORIZONTE })
  // CAJA NEGRA (F0): se congela SIEMPRE, incluso un plan 'sin dato' — que un día no haya plan también
  // es historia que F2 necesita. Va antes del snapshot vigente para no depender de que éste corra.
  await registrarFotoSeguro({}, { fuente: 'plan', foto: plan, horizonte: HORIZONTE })
  if (plan?.estado !== 'ok') { console.log(`plan de tesorería: sin dato (${plan?.motivo || 'no disponible'}) — no se actualiza el snapshot`); return }
  const { cambio, estado, cambios } = await snapshotPlan({}, plan, HORIZONTE)
  if (cambio) {
    const c = cambios || {}
    console.log(`✓ plan recalculado y CAMBIÓ → ${estado}. Agregadas ${c.agregadas?.length ?? 0} · eliminadas ${c.eliminadas?.length ?? 0} · reprogramadas ${c.reprogramadas?.length ?? 0}. NO se crearon tareas: espera autorización.`)
  } else {
    console.log(`✓ plan recalculado, sin cambios. Estado: ${estado}.`)
  }
}

main().then(() => closePool()).then(() => process.exit(0))
  .catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
