// Handler de una recurrencia disparada (PRP-015 Fase 4). Corre la directiva
// programada por el dueño ("revisá cobranzas") a través del MISMO motor interactivo
// (localhost /ask), y guarda el resultado como última corrida de la recurrencia.
// Si la directiva propone una escritura, queda como operación pendiente (Fase 1) —
// el dueño la ve en "Pendientes". Así "programar" reusa todo el canal, sin duplicar.
import { setScheduleResult } from '../lib/schedules.mjs'

export async function scheduledDirectiveHandler(task, ctx) {
  const { schedule_id, directive, title } = task.inputs || {}
  if (!directive) throw new Error('scheduled_directive: falta directive en inputs')

  const port = Number(process.env.ORQ_INTERACTIVE_PORT ?? 8790)
  const token = process.env.ORQ_INTERACTIVE_TOKEN ?? ''
  let answer
  try {
    const r = await fetch(`http://localhost:${port}/ask`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ directive }),
    })
    const data = await r.json()
    answer = r.ok ? (data.answer || '(sin respuesta)') : `error: ${data.error || r.status}`
  } catch (e) {
    answer = `no se pudo correr la directiva: ${e?.message ?? e}`
  }

  if (schedule_id) await setScheduleResult(schedule_id, answer)
  ctx.logger.info('scheduled_directive: corrida completada', { schedule_id, title })
  return { result: { schedule_id, title, answer: String(answer).slice(0, 600) } }
}
