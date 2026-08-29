// LAS MÉTRICAS POR CORRIDA (§38).
//
// ═══ «78 % HONESTO > 100 % VERDE FALSO» ═══
//
// Este repo ya publicó un Claude Avoidance Rate sesgado hacia arriba por construcción: contaba como
// «resuelto por regla» una cantidad que en realidad había leído el modelo, y contaba como resueltas
// partidas que estaban en la lista con cantidad `null`. El contador daba bien y no podía decir que
// no. `plano/pipeline.mjs` documenta las dos correcciones.
//
// Por eso acá:
//
//   · Ningún contador se DEDUCE del resultado final. Se toman de los objetos que las etapas
//     produjeron, que traen su propio estado.
//   · Una tasa sobre denominador cero es `null`, no 100 %. Una corrida vacía no es autonomía
//     perfecta: es una corrida vacía.
//   · `incertidumbreNoDeclarada` es la métrica del §30. La meta NO es tener menos NULL —eso se
//     consigue rellenando— sino tener menos huecos que el sistema no sepa que tiene.

import { ESTADO, esAusencia } from './contrato.mjs'

const tasa = (num, den) => (Number(den) > 0 ? Math.round((Number(num) / Number(den)) * 1000) / 1000 : null)

/**
 * LAS MÉTRICAS DE UNA CORRIDA. PURA.
 *
 * Todo lo que no se puede contar honestamente sale `null`. Un `0` y un `null` dicen cosas distintas
 * y en este archivo la diferencia es el punto.
 */
export function metricasDeCorrida({
  documentos = [], elementos = [], cantidades = [], mapeos = [], composiciones = [],
  costosDePartida = [], cola = null, eventos = [], llamadasLLM = [], llamadasWeb = [],
  decisionesDeterministicas = 0, msFrio = null, msTibio = null,
} = {}) {
  const conCantidad = cantidades.filter((c) => !esAusencia(c.estado) && c.valor !== null && c.valor !== undefined)
  const mapeadas = mapeos.filter((m) => m.estado === 'MAPEADA')
  const ambiguas = mapeos.filter((m) => m.estado === 'AMBIGUO')

  const lineas = costosDePartida.flatMap((c) => c.lineas ?? [])
  const preciosVigentes = lineas.filter((l) => l.estado === ESTADO.EXTRAIDO).length
  const preciosViejos = lineas.filter((l) => l.estado === ESTADO.HISTORICO).length
  const preciosFaltantes = lineas.filter((l) => esAusencia(l.estado)).length

  const tokens = llamadasLLM.reduce((a, l) => a + (l.tokensIn ?? 0) + (l.tokensOut ?? 0), 0)
  const costoLLM = llamadasLLM.reduce((a, l) => a + (l.usd ?? 0), 0)
  const totalDecisiones = decisionesDeterministicas + llamadasLLM.length

  const bloqueantes = cola?.nBloqueantes ?? null
  const noBloqueantes = cola ? cola.total - cola.nBloqueantes : null

  return Object.freeze({
    documentos_total: documentos.length,
    documentos_parseados: documentos.filter((d) => d.parseado !== false).length,
    elementos: elementos.length,
    cantidades_total: cantidades.length,
    cantidades_resueltas: conCantidad.length,
    items_total: mapeos.length,
    items_mapeados: mapeadas.length,
    items_ambiguos: ambiguas.length,
    composiciones_resueltas: composiciones.filter((c) => (c.lineas ?? c)?.length > 0).length,
    recursos_resueltos: lineas.filter((l) => l.costo !== null).length,
    precios_vigentes: preciosVigentes,
    precios_vencidos: preciosViejos,
    precios_faltantes: preciosFaltantes,
    // HH null NO es HH cero: acá se cuentan las que existen, y las que faltan quedan aparte.
    hh_resueltas: costosDePartida.filter((c) => c.hh !== null && c.hh !== undefined).length,
    hh_sin_dato: costosDePartida.filter((c) => c.hh === null || c.hh === undefined).length,
    subcontratos_sin_precio: costosDePartida.filter((c) => c.issues?.some((i) => i.type === 'SUBCONTRATO_SIN_PRECIO')).length,
    bloqueantes,
    no_bloqueantes: noBloqueantes,
    conflictos: cola ? cola.issues.filter((i) => i.type === 'CONFLICTO').length : null,
    preguntas_humanas: cola ? cola.issues.filter((i) => i.recommended_action).length : null,
    overrides_humanos: eventos.filter((e) => e.accion === 'commercial_override' || e.accion === 'set_global_policy').length,
    acciones_deterministicas: decisionesDeterministicas,
    llamadas_llm: llamadasLLM.length,
    llamadas_web: llamadasWeb.length,
    tokens,
    costo_llm_usd: Math.round(costoLLM * 10000) / 10000,
    latencia_fria_ms: msFrio,
    latencia_tibia_ms: msTibio,

    // ═══ LAS TRES TASAS. `null` cuando el denominador es cero ═══
    autonomous_resolution_rate: tasa(conCantidad.length + mapeadas.length, cantidades.length + mapeos.length),
    knowledge_reuse_rate: tasa(mapeadas.length, mapeos.length),
    claude_avoidance_rate: tasa(decisionesDeterministicas, totalDecisiones),

    /**
     * LA MÉTRICA DEL §30. No es «cuántos NULL hay»: es cuántos huecos el sistema NO SABE que tiene.
     * Un hueco declarado —con su motivo y su dueño— cuenta como CERO acá. Uno que llegó como cero
     * sin serlo, o que se rellenó por cobertura, cuenta como uno.
     */
    incertidumbre_no_declarada: cantidades.filter((c) => (c.valor === null || c.valor === undefined) && !c.porQue).length
      + costosDePartida.filter((c) => c.subtotal === null && !(c.faltan ?? []).length).length,
  })
}

/**
 * COMPARAR DOS CORRIDAS. PURA. Es lo que pide el §36 para el caso ciego y el §39 para la
 * reproducibilidad: qué se movió y en qué dirección, sin tener que leer dos JSON al lado.
 */
export function compararCorridas(a, b) {
  const filas = []
  for (const k of Object.keys(a)) {
    if (a[k] === b[k]) continue
    filas.push({ metrica: k, corrida1: a[k], corrida2: b[k], delta: (typeof a[k] === 'number' && typeof b[k] === 'number') ? Math.round((b[k] - a[k]) * 1000) / 1000 : null })
  }
  return Object.freeze({ iguales: filas.length === 0, diferencias: Object.freeze(filas) })
}
