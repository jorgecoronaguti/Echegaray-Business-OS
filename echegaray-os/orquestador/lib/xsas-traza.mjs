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

/**
 * ═══ POR QUÉ HIZO FALTA EL RAZONADOR (01/09/2026) ═══
 *
 * Una llamada al modelo que no puede explicar por qué fue necesaria es candidata a desaparecer. El
 * conjunto es CERRADO a propósito: `DEFAULT`, `FALLBACK` y `UNKNOWN` no son justificaciones, son la
 * ausencia de una — cualquier valor que no esté acá se anota `SIN_JUSTIFICAR`, que es lo que la
 * métrica busca para señalar el candidato.
 */
export const RAZON_RAZONADOR = Object.freeze({
  /** El ruteo no reconoció ninguna skill: no se sabe qué se pidió. */
  AMBIGUOUS_INTENT: 'AMBIGUOUS_INTENT',
  /** Se sabe el dominio, pero la respuesta es un razonamiento en palabras, no un dato. */
  UNSTRUCTURED_REASONING: 'UNSTRUCTURED_REASONING',
  /** Dos fuentes o dos criterios se contradicen y hay que arbitrar. */
  CONFLICT: 'CONFLICT',
  /** La skill aplica y NO hay tool ni regla ejecutable que la resuelva. El candidato a código. */
  MISSING_RULE: 'MISSING_RULE',
  /** Problema que el OS no vio antes: no hay capacidad ni conocimiento que lo cubra. */
  NOVEL_PROBLEM: 'NOVEL_PROBLEM',
  /** Hay que ESCRIBIR algo (texto, propuesta, informe), no calcularlo. */
  GENERATIVE_CONTENT: 'GENERATIVE_CONTENT',
  /** No pudo explicarse. Es un hallazgo, no un estado válido. */
  SIN_JUSTIFICAR: 'SIN_JUSTIFICAR',
})

const NO_ES_JUSTIFICACION = new Set(['DEFAULT', 'FALLBACK', 'UNKNOWN', 'DESCONOCIDO', ''])

/**
 * LA RAZÓN, DERIVADA DE LO QUE YA SE SABE. PURA.
 *
 * Devuelve `null` cuando no hubo escalación — la inmensa mayoría de los pedidos. Cuando el gateway
 * declaró una razón se valida contra el conjunto cerrado; cuando no la declaró se deriva de la
 * evidencia disponible, y si tampoco alcanza, `SIN_JUSTIFICAR`.
 */
export function motivoDeEscalacion(respuesta) {
  const c = respuesta?.capacidades ?? {}
  const escalo = c.via === 'modelo' || Boolean(respuesta?.llm?.modelo)
  if (!escalo) return null
  const declarada = typeof c.razon === 'string' ? c.razon.trim().toUpperCase() : ''
  if (declarada && !NO_ES_JUSTIFICACION.has(declarada) && declarada in RAZON_RAZONADOR) return declarada
  if (declarada) return RAZON_RAZONADOR.SIN_JUSTIFICAR
  const skills = Array.isArray(c.skills) ? c.skills : []
  if (!skills.length) return RAZON_RAZONADOR.AMBIGUOUS_INTENT
  if (/sin tool ejecutable|ninguna capacidad determin/i.test(String(respuesta?.degradacion ?? c.motivo ?? ''))) {
    return RAZON_RAZONADOR.MISSING_RULE
  }
  return RAZON_RAZONADOR.UNSTRUCTURED_REASONING
}

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
    reasoner_required_reason: motivoDeEscalacion(respuesta),
  }
}

const COLUMNAS = Object.freeze([
  'request_id', 'correlation_id', 'canal', 'origen', 'actor_id', 'actor_rol', 'tipo', 'intencion',
  'nivel', 'skills', 'tools', 'agente', 'llm', 'proveedor', 'modelo', 'tokens_in', 'tokens_out',
  'usd', 'fallback_de', 'ms', 'estado', 'error_tipo', 'degradacion', 'reasoner_required_reason',
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

/**
 * EL RESUMEN DE LA PUERTA — la respuesta a «¿cuánto de lo que hace el OS necesita un modelo?».
 *
 * Se lee de `orq.xsas_requests`, que cuenta PEDIDOS. Mientras la tabla esté vacía el resumen dice
 * cero y lo declara: «cero pedidos por la puerta» es un hecho —significa que las caras todavía no
 * entran por acá—, no un error. Un cero que no se distingue de una consulta rota es exactamente el
 * defecto que la regla de migraciones nombra.
 *
 * @param {Function} query
 * @param {{dias?:number}} [o]
 */
export async function resumenDeLaPuerta(query, { dias = 30 } = {}) {
  const ventana = `${dias} días`
  try {
    const { rows } = await query(`
      select count(*)::int pedidos,
             count(*) filter (where llm)::int con_llm,
             count(*) filter (where estado = 'degradado')::int degradados,
             count(*) filter (where estado = 'error')::int errores,
             count(*) filter (where fallback_de is not null)::int por_fallback,
             sum(usd) usd,
             percentile_disc(0.5) within group (order by ms) ms_mediana
        from orq.xsas_requests
       where creado_en > now() - ($1 || ' days')::interval`, [String(dias)])
    const t = rows[0] ?? {}
    const { rows: porCanal } = await query(`
      select canal, count(*)::int pedidos, count(*) filter (where llm)::int con_llm, sum(usd) usd
        from orq.xsas_requests
       where creado_en > now() - ($1 || ' days')::interval
       group by canal order by count(*) desc`, [String(dias)])
    return {
      ventana,
      pedidos: t.pedidos ?? 0,
      conLlm: t.con_llm ?? 0,
      sinLlm: (t.pedidos ?? 0) - (t.con_llm ?? 0),
      degradados: t.degradados ?? 0,
      errores: t.errores ?? 0,
      porFallback: t.por_fallback ?? 0,
      usd: t.usd == null ? null : Number(t.usd),
      msMediana: t.ms_mediana == null ? null : Number(t.ms_mediana),
      porCanal: porCanal.map((r) => ({ canal: r.canal, pedidos: r.pedidos, conLlm: r.con_llm, usd: r.usd == null ? null : Number(r.usd) })),
    }
  } catch (e) {
    return { ventana, noSePudoLeer: String(e?.message ?? e).slice(0, 120) }
  }
}
