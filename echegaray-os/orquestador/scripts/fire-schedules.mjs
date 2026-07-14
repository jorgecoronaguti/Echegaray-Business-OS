#!/usr/bin/env node
// Disparador de recurrencias (PRP-015 Fase 4). Lo corre un timer systemd cada pocos
// minutos: busca las recurrencias vencidas, encola una tarea 'scheduled_directive'
// por cada una (dedupe por slot para no disparar dos veces el mismo horario) y las
// reprograma al próximo run. El worker durable toma esas tareas y corre la directiva.
import { dueSchedules, rescheduleAfterFire } from '../lib/schedules.mjs'
import { enqueueTask } from '../lib/ledger.mjs'
import { closePool } from '../lib/db.mjs'

async function main() {
  const due = await dueSchedules()
  for (const s of due) {
    const slot = new Date(s.next_run_at).toISOString()
    await enqueueTask({
      type: 'scheduled_directive',
      title: `Agenda: ${s.title}`,
      dedupe_key: `sched:${s.id}:${slot}`, // idempotente por horario programado
      inputs: { schedule_id: s.id, directive: s.directive, title: s.title },
    })
    await rescheduleAfterFire(s.id, s.cadence)
  }
  console.log(`[fire-schedules] disparadas ${due.length}`)
}

main().catch((e) => { console.error('[fire-schedules] error:', e.message); process.exitCode = 1 }).finally(() => closePool())
