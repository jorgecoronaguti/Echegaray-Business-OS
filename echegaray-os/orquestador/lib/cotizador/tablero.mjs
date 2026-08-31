// EL TABLERO DE XSAS — QUINCE MÉTRICAS QUE PUEDEN DECIR «NO LO SÉ».
//
// El dueño lo pidió así, textual: «Cada métrica: definition, numerator, denominator, status
// MEDIDO/NO_MEDIDO». Y antes de eso: «**Nunca convertir NO_MEDIDO en 0%**».
//
// ═══ POR QUÉ ESE CUIDADO NO ES BUROCRACIA ═══
//
// Un porcentaje es un cociente, y un cociente miente de tres maneras distintas:
//
//   · el numerador no se midió        → publicar 0% dice «no pasó», y lo cierto es «no miré»
//   · el denominador es cero          → 0/0 no es 0%, es una pregunta sin universo
//   · el denominador no se midió      → el numerador solo no significa nada
//
// Las tres terminan en el mismo lugar: un tablero verde sobre un sistema que nadie observó. En este
// repo ya pasó dos veces con formas distintas —un control que era literalmente una constante y
// escondió $4,1 M, y seis faltantes falsos porque «no pude mirar» se leyó como «no está»—. Por eso
// acá el valor y el estado se calculan JUNTOS, en una sola función, y no hay forma de obtener el
// número sin el estado que dice si se puede creer.
//
// La regla operativa que sale de eso: `medir()` NUNCA devuelve un `valor` numérico si el estado no
// es MEDIDO. Devuelve `null`. Un lector que imprima `valor ?? 0` está mintiendo, y eso se ve.

export const ESTADO = Object.freeze({
  MEDIDO: 'MEDIDO',
  NO_MEDIDO: 'NO_MEDIDO',
  NO_APLICA: 'NO_APLICA',
})

/** Por qué una métrica no se pudo medir. Vocabulario cerrado. */
export const FALTA = Object.freeze({
  SIN_NUMERADOR: 'SIN_NUMERADOR',
  SIN_DENOMINADOR: 'SIN_DENOMINADOR',
  DENOMINADOR_CERO: 'DENOMINADOR_CERO',
  SIN_FUENTE: 'SIN_FUENTE',
})

const esNumero = (x) => typeof x === 'number' && Number.isFinite(x)

/**
 * MIDE UNA MÉTRICA. Pura.
 *
 * `def` trae qué significa, y `n`/`d` los dos números. Un cociente con denominador cero **no es
 * cero por ciento**: es una pregunta sin universo, y sale NO_MEDIDO con `DENOMINADOR_CERO`. Un
 * numerador cero sobre un denominador real SÍ es 0% — eso es una medición, y de las importantes:
 * «cero precios resueltos solo sobre 107 recursos» es un dato, no una ausencia.
 */
export function medir({ id, dice, numerador, denominador, n, d, unidad = '%', noAplica = null }) {
  const base = { id, dice, numerador, denominador, n: esNumero(n) ? n : null, d: esNumero(d) ? d : null, unidad }
  if (noAplica) return { ...base, estado: ESTADO.NO_APLICA, valor: null, falta: null, porque: noAplica }
  if (!esNumero(n)) return { ...base, estado: ESTADO.NO_MEDIDO, valor: null, falta: FALTA.SIN_NUMERADOR, porque: `no se midió «${numerador}»` }
  if (d === undefined) {
    // Una métrica de conteo puro (llamadas al modelo, USD, latencia) no tiene denominador y no
    // debería fabricarse uno. Se declara con `d: undefined` y el valor ES el numerador.
    return { ...base, d: null, estado: ESTADO.MEDIDO, valor: n, falta: null, porque: null }
  }
  if (!esNumero(d)) return { ...base, estado: ESTADO.NO_MEDIDO, valor: null, falta: FALTA.SIN_DENOMINADOR, porque: `no se midió «${denominador}»` }
  if (d === 0) return { ...base, estado: ESTADO.NO_MEDIDO, valor: null, falta: FALTA.DENOMINADOR_CERO, porque: `«${denominador}» es cero: no hay universo sobre el cual calcular un porcentaje` }
  return { ...base, estado: ESTADO.MEDIDO, valor: (n / d) * 100, falta: null, porque: null }
}

/**
 * LAS QUINCE DEL §J, con su definición escrita.
 *
 * `lee` recibe la evidencia juntada y devuelve `{n, d}`. Si un término no está, devuelve
 * `undefined` y la métrica cae a NO_MEDIDO — que es el punto del archivo.
 */
export const METRICAS = Object.freeze([
  { id: 'CAPABILITY_COVERAGE', dice: 'capacidades demostradas', numerador: 'criterios de la DoD en PASS', denominador: 'criterios que corresponde demostrar (total − NO_APLICA)',
    lee: (e) => ({ n: e.dod?.pass, d: esNumero(e.dod?.total) && esNumero(e.dod?.noAplica) ? e.dod.total - e.dod.noAplica : undefined }) },
  { id: 'AUTONOMOUS_RESOLUTION', dice: 'decisiones que XSAS resolvió sin preguntar', numerador: 'decisiones resueltas por el motor', denominador: 'decisiones que requerían una resolución',
    lee: (e) => ({ n: e.decisiones?.resueltas, d: e.decisiones?.totales }) },
  { id: 'KNOWLEDGE_REUSE', dice: 'reutilización de conocimiento ya validado', numerador: 'decisiones resueltas con conocimiento reutilizable existente', denominador: 'decisiones elegibles para reutilización',
    lee: (e) => ({ n: e.reuso?.aplicados, d: e.reuso?.elegibles }) },
  { id: 'CLAUDE_AVOIDANCE', dice: 'trabajo resuelto sin llamar al modelo', numerador: 'decisiones resueltas en un escalón determinístico', denominador: 'decisiones tomadas en la corrida',
    lee: (e) => ({ n: e.ruteo?.deterministicas, d: e.ruteo?.totales }) },
  { id: 'HUMAN_QUESTIONS', dice: 'preguntas al humano por corrida', numerador: 'preguntas que quedaron para el humano', denominador: undefined, unidad: 'preguntas',
    lee: (e) => ({ n: e.humano?.preguntas, d: undefined }) },
  { id: 'PRICE_AUTONOMY', dice: 'precios nuevos conseguidos solo', numerador: 'recursos con resultado ACTUALIZADO', denominador: 'recursos que necesitaban un precio',
    lee: (e) => ({ n: e.precios?.actualizados, d: e.precios?.requeridos }) },
  { id: 'PRICE_RISK_RESOLVED', dice: 'riesgo económico resuelto autónomamente', numerador: '$ de riesgo cuyo precio se resolvió solo', denominador: '$ de riesgo económico bloqueado por precio',
    lee: (e) => ({ n: e.precios?.riesgoResuelto, d: e.precios?.riesgoTotal }) },
  { id: 'TAKEOFF_COVERAGE', dice: 'cómputo reconstruido desde documentos', numerador: 'cantidades con evidencia hasta el documento', denominador: 'cantidades de la cotización',
    lee: (e) => ({ n: e.takeoff?.conEvidencia, d: e.takeoff?.cantidades }) },
  { id: 'GENEALOGY_COVERAGE', dice: 'cadena completa navegable', numerador: 'partidas con genealogía completa hasta el real', denominador: 'partidas de la cotización',
    lee: (e) => ({ n: e.genealogia?.completas, d: e.genealogia?.partidas }) },
  { id: 'PLAN_REAL_COMPARABILITY', dice: 'observaciones reales comparables contra el plan', numerador: 'observaciones comparables', denominador: 'observaciones capturadas',
    lee: (e) => ({ n: e.planReal?.comparables, d: e.planReal?.observaciones }) },
  { id: 'LEARNING_PROMOTION', dice: 'aprendizajes que la gobernanza promovió', numerador: 'candidatos promovidos a validado', denominador: 'candidatos generados',
    lee: (e) => ({ n: e.aprendizaje?.promovidos, d: e.aprendizaje?.candidatos }) },
  { id: 'FALTA_DATO', dice: 'huecos declarados', numerador: 'issues FALTA_DATO', denominador: undefined, unidad: 'issues',
    lee: (e) => ({ n: e.issues?.faltaDato, d: undefined }) },
  { id: 'CONFLICTO', dice: 'contradicciones detectadas entre fuentes', numerador: 'issues CONFLICTO', denominador: undefined, unidad: 'issues',
    lee: (e) => ({ n: e.issues?.conflicto, d: undefined }) },
  { id: 'LATENCY', dice: 'latencia de una corrida completa', numerador: 'milisegundos de la corrida fría', denominador: undefined, unidad: 'ms',
    lee: (e) => ({ n: e.costo?.msFrio, d: undefined }) },
  { id: 'WEB_CALLS', dice: 'salidas a internet por corrida', numerador: 'llamadas web', denominador: undefined, unidad: 'llamadas',
    lee: (e) => ({ n: e.costo?.llamadasWeb, d: undefined }) },
  { id: 'LLM_CALLS', dice: 'llamadas al modelo por corrida', numerador: 'llamadas al modelo', denominador: undefined, unidad: 'llamadas',
    lee: (e) => ({ n: e.costo?.llamadasLlm, d: undefined }) },
  { id: 'LLM_USD', dice: 'costo en dólares del modelo por corrida', numerador: 'USD gastados', denominador: undefined, unidad: 'USD',
    lee: (e) => ({ n: e.costo?.usd, d: undefined }) },
])

/** Corre las quince contra la evidencia. Cada una sale con su estado; ninguna sale con un cero fabricado. */
export function correrTablero(evidencia = {}, { metricas = METRICAS } = {}) {
  const filas = metricas.map((m) => {
    let leido
    // Una lectura que se rompe es NO_MEDIDO con el error adentro, nunca un cero: una excepción no
    // es una medición de cero. Es la misma regla que gobierna la DoD.
    try { leido = m.lee(evidencia) ?? {} } catch (err) { return { id: m.id, dice: m.dice, numerador: m.numerador, denominador: m.denominador, n: null, d: null, unidad: m.unidad ?? '%', estado: ESTADO.NO_MEDIDO, valor: null, falta: FALTA.SIN_FUENTE, porque: `la lectura se rompió: ${err.message}` } }
    return medir({ ...m, ...leido })
  })
  const medidas = filas.filter((f) => f.estado === ESTADO.MEDIDO)
  return {
    filas,
    medidas: medidas.length,
    sinMedir: filas.filter((f) => f.estado === ESTADO.NO_MEDIDO).length,
    // El resumen honesto: cuántas de las quince se pudieron medir. No un promedio de porcentajes,
    // que sumaría peras con llamadas al modelo.
    cobertura: `${medidas.length}/${filas.length}`,
  }
}

/** El tablero como tabla, con la definición al lado del número — que es donde sirve leerla. */
export function comoMarkdown(t) {
  const fmt = (f) => {
    if (f.estado !== ESTADO.MEDIDO) return `**${f.estado}** — ${f.porque}`
    if (f.unidad === '%') return `**${f.valor.toFixed(1)}%** (${f.n}/${f.d})`
    return `**${f.n.toLocaleString('es-AR')}** ${f.unidad}`
  }
  return [
    '| métrica | qué mide | numerador / denominador | valor |',
    '|---|---|---|---|',
    ...t.filas.map((f) => `| \`${f.id}\` | ${f.dice} | ${f.numerador}${f.denominador ? ` / ${f.denominador}` : ''} | ${fmt(f)} |`),
  ].join('\n')
}
