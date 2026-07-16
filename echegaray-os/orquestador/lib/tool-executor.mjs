// Ejecutor de tools POLICY-GATED. Es el `job.toolExecutor` que el handler inyecta
// al motor: el motor pide una tool, esto la ejecuta — pero SIEMPRE pasando primero
// por la policy (decide()). El motor no conoce policy ni Google; toda la decisión de
// autonomía vive acá.
//
//   auto              -> ejecuta la tool y devuelve el resultado al modelo
//   requires_approval -> NO ejecuta: encola la operación con su payload y avisa al
//                        modelo que quedó pendiente de aprobación humana (Nivel E)
//   forbidden         -> NO ejecuta: niega (Nivel F, nunca autónomo)
//
// Un fallo de la tool no rompe el razonamiento: vuelve como {error} y el modelo sigue.

/**
 * @param {object} deps
 * @param {(capabilitySlug:string, principalId:string)=>Promise<string>} deps.decide  policy (auto|requires_approval|forbidden)
 * @param {Record<string, {capability:string, account?:string, run:Function}>} deps.tools  registry slug->tool
 * @param {string} deps.principalId  principal del especialista (para la policy)
 * @param {(op:object)=>Promise<string>} [deps.enqueue]  encola una operación pendiente, devuelve su id
 * @param {object} [deps.logger]
 */
export function makeToolExecutor({ decide, tools, principalId, enqueue, logger }) {
  return async function toolExecutor(name, input, meta) {
    // El modelo usa el `schema.name` (drive_read); mapeamos a la tool por ese nombre.
    const entry = Object.values(tools).find((t) => t.schema?.name === name) || tools[name]
    if (!entry) return { error: `tool desconocida: ${name}` }

    // PRE-FLIGHT (antes de decidir auto/aprobación): valida precondiciones que NO deben
    // asumirse cumplidas — ej. que un adjunto exista de verdad. Si falla, se devuelve el error
    // y NO se encola/ejecuta: así el OS nunca afirma haber hecho algo que no pudo (honestidad).
    if (typeof entry.preflight === 'function') {
      try {
        const pf = await entry.preflight(input ?? {})
        if (pf && pf.error) return pf
      } catch (err) {
        return { error: String(err?.message ?? err).slice(0, 300) }
      }
    }

    let dispo
    try {
      dispo = await decide(entry.capability, principalId)
    } catch (err) {
      return { error: `policy no disponible para ${entry.capability}: ${String(err?.message ?? err).slice(0, 200)}` }
    }

    if (dispo === 'forbidden') {
      logger?.warn?.('tool-executor: capacidad prohibida', { capability: entry.capability })
      return { denied: true, capability: entry.capability, reason: `la capacidad ${entry.capability} está prohibida (Nivel F): no se ejecuta nunca de forma autónoma` }
    }

    if (dispo === 'requires_approval') {
      if (!enqueue) return { denied: true, capability: entry.capability, reason: `${entry.capability} requiere aprobación humana pero no hay cola configurada` }
      const opId = await enqueue({
        capability_slug: entry.capability,
        account: entry.account ?? 'ecsas',
        target: input ?? {},
        // payload guarda QUÉ tool ejecutar (schema.name) + sus args, para que el
        // ejecutor de lo aprobado sepa reconstruir exactamente el efecto.
        payload: { tool: name, args: input ?? {} },
      })
      logger?.info?.('tool-executor: operación encolada para aprobación', { capability: entry.capability, op_id: opId })
      return { queued: true, pending_operation_id: opId, capability: entry.capability, reason: 'requiere aprobación humana (Nivel E): quedó encolada. NO se ejecutó. Continuá el análisis sin asumir que ya ocurrió.' }
    }

    // auto
    try {
      return await entry.run(input ?? {}, meta)
    } catch (err) {
      logger?.warn?.('tool-executor: la tool falló', { capability: entry.capability, error: String(err?.message ?? err).slice(0, 200) })
      return { error: String(err?.message ?? err).slice(0, 300) }
    }
  }
}
