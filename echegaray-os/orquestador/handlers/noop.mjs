// Handler no-op (Fase 1): prueba el ciclo completo sin IA ni efectos.
// Simula trabajo, respeta el heartbeat y devuelve evidencia trazable.
export async function noopHandler(task, ctx) {
  ctx.logger.info('noop: ejecutando', { task_id: task.id, title: task.title })
  // trabajo simulado breve (respeta el heartbeat que mantiene el worker)
  const workMs = Number(task.inputs?.work_ms ?? 50)
  await new Promise((r) => setTimeout(r, workMs))

  if (task.inputs?.fail === true) {
    throw new Error(task.inputs?.fail_reason ?? 'fallo simulado (inputs.fail=true)')
  }

  return {
    result: { handler: 'noop', worked_ms: workMs, worker: ctx.config.WORKER_ID },
    evidence: { kind: 'noop', at: new Date().toISOString(), correlation_id: task.correlation_id },
  }
}
