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
import { SIN_CACHE, canonicalizar } from './cache.mjs'

/**
 * LO QUE UNA MÉTRICA DICE CUANDO NO TIENE CONTRA QUÉ MEDIRSE.
 *
 * No es `null` y no es un guión: es una PALABRA, porque `null` se renderiza como «—» y un «—» se
 * lee como «cero» o como «no importa». Medido el 29/08/2026: la corrida CÓMPUTO MANUAL —0 partidas,
 * 0 recursos— publicaba `AUTONOMOUS RESOLUTION: —` al lado de tres columnas con «100,0 %», y entraba
 * al informe como una corrida más. Una medición que no existe tiene que decir que no existe.
 */
export const SIN_MEDIR = 'SIN_MEDIR'

/** Una tasa, o `SIN_MEDIR` si no hay denominador. NUNCA 1 sobre denominador cero. PURA. */
const tasa = (num, den) => (Number(den) > 0 ? Math.round((Number(num) / Number(den)) * 1000) / 1000 : SIN_MEDIR)

/** `true` si la métrica trae un número medido. Es lo que usan las pantallas para no imprimir
 *  `SIN_MEDIR` con un signo de porcentaje detrás. PURA. */
export const estaMedida = (v) => typeof v === 'number' && Number.isFinite(v)

/**
 * LAS MÉTRICAS DE UNA CORRIDA. PURA.
 *
 * Todo lo que no se puede contar honestamente sale `null`. Un `0` y un `null` dicen cosas distintas
 * y en este archivo la diferencia es el punto.
 */
export function metricasDeCorrida({
  documentos = [], elementos = [], cantidades = [], mapeos = [], composiciones = [],
  costosDePartida = [], cola = null, eventos = [], llamadasLLM = [], llamadasWeb = [],
  // ¿El cero de llamadas al modelo salió de una medición o del cableado? Sin esta bandera las dos
  // cosas se ven idénticas en el informe, y una de las dos no prueba nada.
  llamadasLlmMedidas = false,
  decisionesDeterministicas = 0, msFrio = null, msTibio = null,
  // ═══ LO QUE AGREGA EL §12/§13/§21 ═══
  // Entran por parámetro y con default vacío para que una corrida que todavía no cablea el
  // research y el fast path publique CEROS honestos en vez de ausencias silenciosas.
  cache = SIN_CACHE, investigaciones = [], nivelesDeFastPath = [], real = null, cascada = null,
  reuso = {},
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

  /**
   * ═══ EL TRABAJO QUE QUEDÓ EN MANOS DE UNA PERSONA ═══
   *
   * Medido el 29/08/2026 sobre QUATTROPANI (real): la corrida salía BLOQUEADA con 95 bloqueantes,
   * 96 preguntas dirigidas, $17.388.173 en riesgo y COSTO DIRECTO «NO SE AFIRMA» — y en la misma
   * columna publicaba AUTONOMOUS RESOLUTION RATE 100,0 %.
   *
   * El motivo: el denominador era «lo que el motor intentó» (cantidades + mapeos). Todo lo que el
   * motor NO intentó porque lo derivó a un humano quedaba fuera de la cuenta, así que derivar más
   * trabajo a una persona MEJORABA la métrica. Un control que no puede decir que no.
   *
   * Ahora el denominador es el TRABAJO, y el trabajo incluye lo que quedó abierto. Se toma la UNIÓN
   * —bloquea o tiene acción recomendada— y no la suma, porque en Quattropani 95 de las 96 preguntas
   * son también bloqueantes y sumarlas contaría cada una dos veces.
   */
  const requierenHumano = cola ? cola.issues.filter((i) => i.bloquea || i.recommended_action).length : 0

  /**
   * Y LAS PREGUNTAS QUE NACIERON INVESTIGANDO.
   *
   * Un hueco que recorrió los siete pasos del §12 y terminó en una persona ES una pregunta al
   * humano, aunque no haya llegado a la cola de atención. Sin sumarlas acá, investigar y no
   * encontrar sería gratis para la métrica — el mismo agujero que tenía el denominador viejo, un
   * piso más abajo. No hay doble conteo: las de la cola y las del research son objetos distintos.
   */
  const escaladasInvestigando = investigaciones.filter((i) => i?.requiereHumano).length
  const humanoTotal = requierenHumano + escaladasInvestigando

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
    falta_dato: cola ? cola.issues.filter((i) => i.type === 'FALTA_DATO').length : null,
    // `preguntas_humanas` es SÓLO la cola: es el número que ya publica el informe de casos reales
    // y no se le cambia el significado por debajo.
    preguntas_humanas: cola ? cola.issues.filter((i) => i.recommended_action).length : null,
    // `human_questions` es el del §21: TODO lo que termina en una persona, venga de la cola o de una
    // investigación que se quedó sin fuentes.
    human_questions: (cola ? cola.issues.filter((i) => i.recommended_action).length : 0) + escaladasInvestigando,
    requieren_humano: humanoTotal,
    overrides_humanos: eventos.filter((e) => e.accion === 'commercial_override' || e.accion === 'set_global_policy').length,
    acciones_deterministicas: decisionesDeterministicas,
    llamadas_llm: llamadasLLM.length,
    // `null` —no `false`— cuando nadie midió: el consumidor tiene que distinguir «medí y dio 0» de
    // «no medí». Publicar el 0 sin este acompañante es lo que dejó el criterio #22 en verde falso.
    llamadas_llm_medidas: llamadasLlmMedidas === true ? true : null,
    llamadas_web: llamadasWeb.length,
    tokens,
    costo_llm_usd: Math.round(costoLLM * 10000) / 10000,
    latencia_fria_ms: msFrio,
    latencia_tibia_ms: msTibio,

    // ═══ LAS TRES TASAS. `SIN_MEDIR` cuando el denominador es cero ═══

    /**
     * AUTONOMOUS RESOLUTION RATE = lo que XSAS cerró solo / TODO el trabajo que había que cerrar.
     *
     * El denominador incluye lo que quedó en manos de una persona. Si `human_questions` sube, esta
     * tasa BAJA — que es la única manera de que la métrica pueda decir que no. Se publica también
     * el denominador (`autonomous_resolution_base`), porque 3/3 y 300/300 son el mismo 100 % y no
     * son la misma corrida.
     */
    autonomous_resolution_rate: tasa(
      conCantidad.length + mapeadas.length,
      cantidades.length + mapeos.length + humanoTotal,
    ),
    autonomous_resolution_base: cantidades.length + mapeos.length + humanoTotal,

    // ═══ KNOWLEDGE REUSE ═══ Ver `reusoDeConocimiento`. Los mapeos entran como una de las tres
    // familias; `resoluciones` y `aprendizajesAplicados` llegan por parámetro y con default vacío,
    // igual que el caché y el research, para que una corrida que todavía no los cablea publique
    // SIN_MEDIR en vez de una ausencia silenciosa.
    ...reusoDeConocimiento({ ...reuso, mapeos }),

    /**
     * CLAUDE AVOIDANCE RATE = decisiones tomadas sin modelo / decisiones TOMADAS.
     *
     * Sobre decisiones tomadas, no sobre trabajo total: una pregunta derivada a un humano no es una
     * llamada al modelo evitada, es una decisión que nadie tomó, y meterla acá confundiría dos cosas
     * distintas. Lo que sí cambió: con CERO decisiones deterministas y CERO llamadas, esto ya no es
     * `null` (que el informe imprimía como «—») sino `SIN_MEDIR` — evitar algo que nunca se necesitó
     * no es mérito. El trabajo sin cerrar lo dice `autonomous_resolution_rate`, que sí lo cuenta.
     */
    claude_avoidance_rate: tasa(decisionesDeterministicas, totalDecisiones),
    claude_avoidance_base: totalDecisiones,

    /**
     * LA MÉTRICA DEL §30. No es «cuántos NULL hay»: es cuántos huecos el sistema NO SABE que tiene.
     * Un hueco declarado —con su motivo y su dueño— cuenta como CERO acá. Uno que llegó como cero
     * sin serlo, o que se rellenó por cobertura, cuenta como uno.
     */
    incertidumbre_no_declarada: cantidades.filter((c) => (c.valor === null || c.valor === undefined) && !c.porQue).length
      + costosDePartida.filter((c) => c.subtotal === null && !(c.faltan ?? []).length).length,

    // ═══ EL CACHÉ (§13) ═══
    ...cache,

    // ═══ LA INVESTIGACIÓN (§12) ═══
    ...metricasDeInvestigacion(investigaciones, nivelesDeFastPath),

    // ═══ LA EXACTITUD (§21) ═══
    // Sin un real conocido, `SIN_MEDIR`. NUNCA 100 %: no tener contra qué compararse no es acertar.
    ...exactitudDeCorrida({ real, costosDePartida, cantidades, lineas, cascada }),
  })
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// KNOWLEDGE REUSE
// ══════════════════════════════════════════════════════════════════════════════════════════════
//
// ═══ QUÉ ESTABA MAL ANTES ═══
//
// `knowledge_reuse_rate` era `mapeadas / mapeos`. Eso no es reuso de conocimiento: es COBERTURA DE
// MAPEO, y además es exactamente parte del numerador de `autonomous_resolution_rate`. Dos métricas
// que cuentan lo mismo no son dos mediciones: una es decoración, y la decoración es la que sube
// cuando conviene que suba.
//
// ═══ LA DEFINICIÓN ═══
//
//   NUMERADOR   decisiones resueltas con un artefacto de conocimiento que YA EXISTÍA antes de esta
//               corrida y que el objeto DECLARA haber usado.
//   DENOMINADOR decisiones ELEGIBLES para reuso: aquellas que un artefacto preexistente podría en
//               principio haber resuelto. No toda decisión lo es.
//
// Las tres familias de artefacto reutilizable que existen en esta arquitectura:
//
//   · PRECIO — `ORIGEN.INTERNO` (el catálogo), `ORIGEN.COMPRA_ECSAS` (una factura propia ya pagada)
//     y `ORIGEN.COMPARABLE` (el precio de otro recurso de la casa). `ORIGEN.WEB` NO es reuso: es
//     adquisición nueva, y contarla haría que salir a buscar afuera mejorara la métrica del
//     conocimiento propio.
//   · MAPEO — una partida enganchada a la Base Maestra reusa la taxonomía que la empresa ya tiene.
//   · APRENDIZAJE — un `conocimiento_empresa` aplicado a esta decisión.
//
// ═══ EL TERCER ESTADO, Y POR QUÉ NO ALCANZA CON DOS ═══
//
// Un contador de reuso puede fallar de dos maneras opuestas y las dos terminan en un número que se
// publica: decir 100 % porque todo lo que miró era reuso (y no miró casi nada), o decir 0 % porque
// los objetos no traían de dónde salieron. Lo segundo es el peligroso: **«no pude mirar» no es «no
// hubo reuso»**, y publicado como 0 % manda a alguien a construir conocimiento que tal vez ya se
// esté usando.
//
// Por eso hay TRES resultados y no dos:
//
//   · sin decisiones elegibles                    → SIN_MEDIR  (no había nada que reusar)
//   · elegibles > 0 y NINGUNA declara procedencia  → SIN_MEDIR  (no se pudo mirar)
//   · alguna declara                               → la tasa, que PUEDE dar 0
//
// Y viaja siempre `knowledge_reuse_cobertura`: una tasa calculada sobre el 5 % de las decisiones no
// vale lo mismo que una calculada sobre el 90 %, y sin ese número las dos se leen igual.

/** Los orígenes de precio que SON conocimiento previo de la empresa. `WEB` no está, a propósito. */
export const ORIGEN_ES_REUSO = Object.freeze({ INTERNO: true, COMPRA_ECSAS: true, COMPARABLE: true, WEB: false })

/**
 * KNOWLEDGE REUSE. PURA.
 *
 * `resoluciones` son las resoluciones de precio de `precio-resolucion.mjs` (cada una con su
 * `origen`); `mapeos` los ítems contra la Base Maestra; `aprendizajesAplicados` las entradas de
 * `conocimiento_empresa` que esta corrida efectivamente usó.
 *
 * Una resolución SIN `origen` no cuenta como «no hubo reuso»: cuenta como no declarada, y sale del
 * numerador Y del denominador de la tasa, pero queda contada en `sinProcedencia` para que se vea
 * cuánto de la corrida no se pudo mirar.
 */
export function reusoDeConocimiento({ resoluciones = [], mapeos = [], aprendizajesAplicados = [] } = {}) {
  // ═══ HACEN FALTA LAS DOS DECLARACIONES ═══
  //
  // De dónde salió NO alcanza: una resolución `NECESITA_HUMANO` sacó su candidato de la Base
  // Maestra y aun así NO cerró la decisión — la cerró una persona. Contarla como reuso haría que
  // derivar trabajo a un humano subiera la métrica del conocimiento reutilizable, que es el mismo
  // agujero que `autonomous_resolution_rate` ya tuvo y que está documentado arriba.
  //
  // Medido sobre la base real: de 107 resoluciones, 105 salen de BASE_MAESTRA pero sólo 49 quedaron
  // VIGENTE. Sin esta condición la métrica publicaría 98 % donde el reuso efectivo es 46 %.
  const declara = (x) => x?.origen !== null && x?.origen !== undefined && typeof x?.resuelta === 'boolean'
  const resDeclaradas = resoluciones.filter(declara)
  const resReuso = resDeclaradas.filter((r) => ORIGEN_ES_REUSO[r.origen] === true && r.resuelta === true)

  // Un mapeo SIEMPRE declara su estado, así que la familia entera es declarada. `MAPEADA` es reuso
  // de la taxonomía; `AMBIGUO` y `SIN_PARTIDA` son decisiones elegibles que no lo lograron.
  const mapReuso = mapeos.filter((m) => m?.estado === 'MAPEADA')

  const elegibles = resoluciones.length + mapeos.length + aprendizajesAplicados.length
  const declaradas = resDeclaradas.length + mapeos.length + aprendizajesAplicados.length
  const conReuso = resReuso.length + mapReuso.length + aprendizajesAplicados.length

  return {
    knowledge_reuse_rate: declaradas > 0 ? Math.round((conReuso / declaradas) * 1000) / 1000 : SIN_MEDIR,
    knowledge_reuse_numerador: conReuso,
    knowledge_reuse_denominador: declaradas,
    knowledge_reuse_elegibles: elegibles,
    // Cuántas decisiones elegibles no dijeron de dónde salieron. Si esto es alto, la tasa está
    // medida sobre una esquina de la corrida y no sobre la corrida.
    knowledge_reuse_sin_procedencia: elegibles - declaradas,
    knowledge_reuse_cobertura: elegibles > 0 ? Math.round((declaradas / elegibles) * 1000) / 1000 : SIN_MEDIR,
    knowledge_reuse_por_familia: Object.freeze({
      precio: { elegibles: resoluciones.length, declaradas: resDeclaradas.length, reuso: resReuso.length },
      mapeo: { elegibles: mapeos.length, declaradas: mapeos.length, reuso: mapReuso.length },
      aprendizaje: { elegibles: aprendizajesAplicados.length, declaradas: aprendizajesAplicados.length, reuso: aprendizajesAplicados.length },
    }),
    knowledge_reuse_estado: declaradas > 0
      ? 'MEDIDO'
      : (elegibles > 0 ? 'SIN_MEDIR: hay decisiones elegibles y ninguna declara de dónde salió' : 'SIN_MEDIR: no hubo ninguna decisión elegible para reuso'),
  }
}

/**
 * LAS MÉTRICAS DE LO QUE XSAS INVESTIGÓ. PURA.
 *
 * `investigaciones` son los resultados de `research.mjs` y `nivelesDeFastPath` los niveles en que
 * resolvió `fast-path.mjs`. Se cuenta lo que los objetos DECLARAN —cada uno trae su paso y su
 * nivel— y nunca se deduce del resultado final, que es como se fabricó el 100 % falso.
 */
export function metricasDeInvestigacion(investigaciones = [], nivelesDeFastPath = []) {
  const porPaso = {}
  for (const i of investigaciones) {
    const k = i?.resueltoEn ?? 'SIN_RESOLVER'
    porPaso[k] = (porPaso[k] ?? 0) + 1
  }
  const porNivel = {}
  for (const n of nivelesDeFastPath) {
    const k = n ?? 'SIN_RESOLVER'
    porNivel[k] = (porNivel[k] ?? 0) + 1
  }
  const escaladas = investigaciones.filter((i) => i?.requiereHumano).length
  return {
    investigaciones_total: investigaciones.length,
    investigaciones_resueltas: investigaciones.filter((i) => i?.resueltoEn).length,
    investigaciones_por_paso: Object.freeze({ ...porPaso }),
    investigaciones_escaladas_al_humano: escaladas,
    investigaciones_con_inyeccion: investigaciones.filter((i) => i?.sobreLaPagina?.instruccionesDetectadas?.length).length,
    fast_path_por_nivel: Object.freeze({ ...porNivel }),
  }
}

/**
 * LA EXACTITUD DE UN NÚMERO CONTRA SU REAL. PURA.
 *
 * Devuelve `SIN_MEDIR` en los DOS casos en que no hay medición posible: sin real conocido, y con un
 * estimado que el motor no pudo afirmar. Nunca devuelve 1 por ausencia de discrepancia, que es como
 * un tablero llega a estar todo verde sin haber comparado nada.
 *
 * La escala es `1 - |estimado - real| / |real|`, acotada abajo en 0: una estimación que se pasa al
 * doble tiene exactitud 0, no −1. Con un real de cero no hay proporción posible: `SIN_MEDIR`.
 */
export function exactitud({ estimado, real } = {}) {
  if (real === null || real === undefined || !Number.isFinite(Number(real))) return SIN_MEDIR
  if (estimado === null || estimado === undefined || !Number.isFinite(Number(estimado))) return SIN_MEDIR
  const r = Number(real)
  if (r === 0) return SIN_MEDIR
  const e = Number(estimado)
  return Math.max(0, Math.round((1 - Math.abs(e - r) / Math.abs(r)) * 1000) / 1000)
}

/**
 * LAS CINCO EXACTITUDES DEL §21. PURA.
 *
 * `real` es lo que se supo DESPUÉS —lo que salió la obra, las HH que se cargaron, el precio que se
 * cerró—. Si no llegó, las cinco salen `SIN_MEDIR`. Un cotizador sin obras cerradas no tiene
 * exactitud «perfecta»: no tiene exactitud.
 */
export function exactitudDeCorrida({ real = null, costosDePartida = [], cantidades = [], lineas = [], cascada = null } = {}) {
  const sum = (xs) => xs.reduce((a, x) => a + x, 0)
  const nums = (xs) => xs.filter((x) => Number.isFinite(Number(x))).map(Number)

  const cantidadTotal = nums(cantidades.map((c) => c.valor))
  const hhTotal = nums(costosDePartida.map((c) => c.hh))
  const recursos = new Set(lineas.map((l) => l.recursoCodigo ?? l.recurso).filter(Boolean)).size
  const costoTotal = costosDePartida.some((c) => c.subtotal === null || c.subtotal === undefined)
    ? null
    : sum(nums(costosDePartida.map((c) => c.subtotal)))

  return {
    exactitud_cantidad: exactitud({ estimado: cantidadTotal.length ? sum(cantidadTotal) : null, real: real?.cantidad ?? null }),
    exactitud_hh: exactitud({ estimado: hhTotal.length ? sum(hhTotal) : null, real: real?.hh ?? null }),
    exactitud_recursos: exactitud({ estimado: recursos || null, real: real?.recursos ?? null }),
    exactitud_costo: exactitud({ estimado: costoTotal, real: real?.costo ?? null }),
    exactitud_precio: exactitud({ estimado: cascada?.ventaSinIva ?? real?.precioEstimado ?? null, real: real?.precio ?? null }),
  }
}

/**
 * COMPARAR DOS CORRIDAS. PURA. Es lo que pide el §36 para el caso ciego y el §39 para la
 * reproducibilidad: qué se movió y en qué dirección, sin tener que leer dos JSON al lado.
 */
export function compararCorridas(a, b) {
  const filas = []
  for (const k of Object.keys(a)) {
    // La comparación es ESTRUCTURAL, no por referencia. Hay métricas que son objetos
    // (`investigaciones_por_paso`, `fast_path_por_nivel`) y con `===` dos corridas idénticas
    // saldrían distintas siempre: el control de reproducibilidad del §39 quedaría en rojo
    // permanente, que después de tres días se apaga y ya no controla nada.
    if (canonicalizar(a[k]) === canonicalizar(b[k])) continue
    filas.push({ metrica: k, corrida1: a[k], corrida2: b[k], delta: (typeof a[k] === 'number' && typeof b[k] === 'number') ? Math.round((b[k] - a[k]) * 1000) / 1000 : null })
  }
  return Object.freeze({ iguales: filas.length === 0, diferencias: Object.freeze(filas) })
}
