// AUTONOMY RATE — qué parte del trabajo inteligente del OS se resuelve sin Claude.
//
// ═══ LA DEFINICIÓN, Y POR QUÉ NO ES OBVIA ═══
//
// La tentación es `resueltas_sin_claude / total`. Esa cuenta miente en las dos direcciones y hay que
// decir por qué antes de escribirla.
//
// El OS tiene TRES desenlaces para una operación inteligente, no dos:
//
//   RESUELTO   el OS contestó solo: una regla, un modelo local, un modelo de HF.
//   ABSTUVO    el OS lo intentó y NO alcanzó su piso de confianza, así que no contestó.
//   ESCALADO   contestó Claude.
//
// `ABSTUVO` no es un fracaso: es el piso funcionando. La clasificación documental propone 12 tipos
// de 381 justamente porque el resto no supera el umbral medido, y bajar ese umbral para «subir la
// autonomía» sería empeorar el OS mientras el número mejora.
//
// Por eso:
//
//   AUTONOMY RATE = RESUELTO / (RESUELTO + ESCALADO)
//
// que contesta «cuando el OS contestó algo, ¿cuánto contestó solo?», y la ABSTENCIÓN se informa
// SIEMPRE al lado. Separadas, las dos son honestas. Juntas, cualquiera de las dos se puede inflar:
// meter la abstención en el denominador castiga al piso que funciona; sacarla del reporte deja
// subir la autonomía simplemente absteniéndose más.
//
// ═══ DE DÓNDE SALEN LOS NÚMEROS ═══
//
// `orq.ml_traza`  lo que resolvió la capa ML (regla, estadística, modelo local, HF remoto).
// `orq.chat_cost` lo que resolvió un LLM, con su proveedor: `anthropic` es escalamiento,
//                 `huggingface` es autonomía.
//
// No hay una tercera tabla ni un contador propio: un contador propio se desincroniza y termina
// siendo el número que nadie puede auditar.

/** Un desenlace por fila de traza. PURA para poder probar la definición sin base. */
export function desenlaceDeTraza({ metodo, accion }) {
  if (metodo === 'sin-resolver') return 'ABSTUVO'
  if (accion === 'descartar') return 'ABSTUVO'
  if (accion === 'aplicar' || accion === 'sugerir') return 'RESUELTO'
  return 'ABSTUVO'
}

/** Un desenlace por fila de costo de LLM. */
export function desenlaceDeLlm({ proveedor, ok }) {
  if (!ok) return 'FALLO'
  return proveedor === 'anthropic' ? 'ESCALADO' : 'RESUELTO'
}

/**
 * La tasa, a partir de los tres contadores. PURA, y es la única definición que existe: si algún
 * reporte la calcula por su cuenta, van a divergir y nadie va a saber cuál creer.
 */
export function tasa({ resuelto = 0, escalado = 0, abstuvo = 0 } = {}) {
  const contestadas = resuelto + escalado
  return {
    resuelto,
    escalado,
    abstuvo,
    contestadas,
    // Sin operaciones no hay tasa. Devolver 0 diría «no es autónomo»; devolver 1 diría «lo es del
    // todo». Las dos serían afirmaciones sobre algo que no se midió.
    autonomia: contestadas ? resuelto / contestadas : null,
    abstencion: (contestadas + abstuvo) ? abstuvo / (contestadas + abstuvo) : null,
  }
}

/**
 * COSTO POR OPERACIÓN AUTÓNOMA RESUELTA.
 *
 * ═══ POR QUÉ EL DENOMINADOR SON LAS AUTÓNOMAS Y NO TODAS ═══
 *
 * «Costo por operación» a secas baja solo con abstenerse o con escalar menos, sin que el OS mejore.
 * Lo que hay que poder contestar es cuánto sale que el OS resuelva algo POR SÍ MISMO — y ahí el
 * numerador tiene que incluir TODO el gasto, también el de Claude: si para resolver 10 solo hubo
 * que escalar 90 a Claude, esas 10 salieron carísimas y la métrica tiene que decirlo.
 *
 * ═══ EL COSTO LOCAL NO SE INVENTA ═══
 *
 * Un modelo que corre en la VM no factura. Consume CPU y RAM, que ya están pagadas y no se
 * prorratean por operación sin fabricar un número. Se informa $0 EN CAJA y se dice que es en caja:
 * poner un costo estimado de cómputo haría que la comparación con Claude pareciera más precisa de
 * lo que es.
 */
export function costoPorAutonoma({ usdTotal = 0, usdClaude = 0, usdHf = 0, resuelto = 0 } = {}) {
  return {
    usdTotal, usdClaude, usdHf,
    usdLocal: 0,
    porAutonoma: resuelto ? usdTotal / resuelto : null,
    // Cuánto de cada peso gastado se fue en escalar. Es el número que baja cuando la autonomía sube.
    fraccionClaude: usdTotal ? usdClaude / usdTotal : null,
  }
}

const SQL_TRAZA = `
  select coalesce(modulo, capacidad, 'sin-modulo') as modulo, metodo, accion, count(*)::int n,
         coalesce(sum(costo_usd), 0)::float usd
  from orq.ml_traza
  where ts > now() - ($1 || ' days')::interval
  group by 1,2,3`

const SQL_LLM = `
  select coalesce(agente, 'sin-agente') as modulo, proveedor, ok, count(*)::int n,
         coalesce(sum(usd), 0)::float usd
  from orq.chat_cost
  where ts > now() - ($1 || ' days')::interval
  group by 1,2,3`

/**
 * El Autonomy Rate global y por módulo.
 *
 * @param query  la función de consulta (se inyecta para poder probar sin base)
 * @param dias   la ventana. 30 por defecto: menos que eso y un solo lote de clasificación
 *               distorsiona el número entero.
 */
export async function autonomyRate(query, { dias = 30 } = {}) {
  const [trazas, llms] = await Promise.all([
    query(SQL_TRAZA, [String(dias)]),
    query(SQL_LLM, [String(dias)]),
  ])
  const porModulo = new Map()
  const sumar = (modulo, desenlace, n, usd = 0) => {
    const m = porModulo.get(modulo) ?? { resuelto: 0, escalado: 0, abstuvo: 0, usd: 0 }
    // El costo se suma SIEMPRE, también el de una llamada fallida: consumió cuota y tiempo, y
    // borrarlo del total haría parecer que equivocarse es gratis.
    m.usd += Number(usd) || 0
    if (desenlace !== 'FALLO') m[desenlace.toLowerCase()] += n
    porModulo.set(modulo, m)
  }

  for (const f of (trazas.rows ?? trazas)) sumar(f.modulo, desenlaceDeTraza(f), f.n, f.usd)
  for (const f of (llms.rows ?? llms)) sumar(f.modulo, desenlaceDeLlm(f), f.n, f.usd)

  const total = { resuelto: 0, escalado: 0, abstuvo: 0 }
  let usdTotal = 0; let usdClaude = 0; let usdHf = 0
  for (const m of porModulo.values()) {
    total.resuelto += m.resuelto; total.escalado += m.escalado; total.abstuvo += m.abstuvo
    usdTotal += m.usd
  }
  for (const f of (llms.rows ?? llms)) {
    if (f.proveedor === 'anthropic') usdClaude += Number(f.usd) || 0
    else usdHf += Number(f.usd) || 0
  }

  return {
    global: tasa(total),
    costo: costoPorAutonoma({ usdTotal, usdClaude, usdHf, resuelto: total.resuelto }),
    porModulo: [...porModulo.entries()]
      .map(([modulo, c]) => ({ modulo, ...tasa(c), usd: Math.round(c.usd * 100) / 100 }))
      .sort((a, b) => b.contestadas - a.contestadas),
  }
}

/** Un porcentaje legible, o «—» cuando no hay nada medido. Un 0% inventado es peor que un guión. */
export function pct(v) {
  return v == null ? '—' : `${Math.round(v * 1000) / 10}%`
}
