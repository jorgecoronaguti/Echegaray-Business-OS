// LA TRAZA DE UN PEDIDO A XSAS — una fila por pedido, haya usado un modelo o no.
//
// `orq.chat_cost` cuenta llamadas al proveedor. Eso no contesta «¿cuánto de lo que hace el OS
// necesita un modelo?»: los pedidos que resuelve una tool —el caso masivo y el barato— no aparecen
// ahí. Esta traza es la otra mitad, y es la que hace medible la promesa del ruteo de 4 niveles.
//
// DOS REGLAS QUE NO SE NEGOCIAN:
//   1. NUNCA guarda el texto del pedido ni la respuesta. Acá va cuánto costó y con qué se resolvió,
//      no qué se dijo. Un registro de costo no puede convertirse en un archivo de conversaciones.
//   2. NUNCA lanza. Que la telemetría falle no puede tumbar la operación que la produjo — es la
//      misma regla que ya gobierna `registrarUso` en `lib/ia/cliente.mjs`.

/** La fila, armada desde el pedido y la respuesta. PURA: se puede probar sin base. */
export function filaDeTraza(pedido, respuesta, extra = {}) {
  const c = respuesta?.capacidades ?? {}
  const llm = respuesta?.llm ?? null
  return {
    request_id: pedido?.requestId ?? null,
    correlation_id: pedido?.correlationId ?? null,
    canal: pedido?.canal ?? null,
    origen: pedido?.origen ?? null,
    actor_id: pedido?.actor?.id ?? null,
    actor_rol: pedido?.actor?.rol ?? null,
    tipo: pedido?.tipo ?? null,
    // La intención EFECTIVA: la que se pidió por nombre, o el atajo/skill con el que se resolvió.
    intencion: pedido?.intencion ?? c.via ?? null,
    nivel: typeof c.nivel === 'number' ? c.nivel : null,
    skills: Array.isArray(c.skills) ? c.skills : [],
    tools: Array.isArray(c.tools) ? c.tools : [],
    agente: extra.agente ?? null,
    llm: Boolean(llm?.modelo),
    proveedor: llm?.proveedor ?? null,
    modelo: llm?.modelo ?? null,
    tokens_in: llm?.tokens?.in ?? null,
    tokens_out: llm?.tokens?.out ?? null,
    usd: llm?.usd ?? null,
    fallback_de: llm?.fallbackDe ?? null,
    ms: respuesta?.ms ?? null,
    estado: respuesta?.estado ?? null,
    error_tipo: respuesta?.error?.tipo ?? null,
    degradacion: respuesta?.degradacion ?? null,
  }
}

const COLUMNAS = Object.freeze([
  'request_id', 'correlation_id', 'canal', 'origen', 'actor_id', 'actor_rol', 'tipo', 'intencion',
  'nivel', 'skills', 'tools', 'agente', 'llm', 'proveedor', 'modelo', 'tokens_in', 'tokens_out',
  'usd', 'fallback_de', 'ms', 'estado', 'error_tipo', 'degradacion',
])

/**
 * ESCRIBE LA TRAZA. `query` se inyecta para poder probar esto sin base y para que un proceso sin
 * Postgres (un script suelto, un test) siga funcionando: sin `query` no hay traza y no pasa nada.
 * @returns {Promise<boolean>} si quedó constancia. Se devuelve —en vez de ignorarse— para que el
 *   test pueda distinguir «no se escribió» de «se escribió», que es la diferencia que importa.
 */
export async function registrarTraza(pedido, respuesta, { query = null, agente = null } = {}) {
  if (typeof query !== 'function') return false
  try {
    const fila = filaDeTraza(pedido, respuesta, { agente })
    const marcas = COLUMNAS.map((_, i) => `$${i + 1}`).join(',')
    await query(
      `insert into orq.xsas_requests (${COLUMNAS.join(',')}) values (${marcas})`,
      COLUMNAS.map((c) => fila[c]),
    )
    return true
  } catch {
    return false
  }
}
