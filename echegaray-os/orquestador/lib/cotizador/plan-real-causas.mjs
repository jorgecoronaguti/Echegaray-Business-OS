// POR QUÉ NO SE PUDO COMPARAR — la causa raíz, la cobertura del universo y el denominador honesto.
//
// Vive aparte de `plan-vs-real.mjs` por tamaño y porque son dos preguntas distintas: aquel archivo
// contesta «¿cuánto se desvió?», éste contesta «¿por qué no se puede contestar?» y «¿a quién se le
// manda el arreglo?». La primera es aritmética sobre una partida; la segunda necesita saber qué hay
// alrededor —si la obra tiene genealogía, si la tabla de costos está vacía, si la partida empezó— y
// por eso todas las funciones de acá piden un CONTEXTO que nunca deducen.

import { NO_COMPARABLE, CONCEPTO } from './plan-vs-real.mjs'
import { SIN_MEDIR } from './metricas.mjs'

// ══════════════════════════════════════════════════════════════════════════════════════════════
// LA CAUSA RAÍZ — POR QUÉ NO SE PUDO COMPARAR, UN NIVEL MÁS ABAJO QUE EL MOTIVO
// ══════════════════════════════════════════════════════════════════════════════════════════════
//
// `motivoNoComparable` dice QUÉ faltó en la comparación. No dice QUIÉN lo tiene que arreglar, y por
// eso una tabla de motivos no se puede accionar: «SIN_CONSUMO_REGISTRADO ×275» se lee como «faltan
// 275 facturas» cuando en realidad `obra_partida_costo_real` está vacía en TODA la base y lo que
// falta es una sola cosa —la captura de costo— repetida 275 veces.
//
// La distinción que importa no es entre motivos: es entre DISPOSICIONES. Un enganche que falta se
// arregla hoy escribiendo código; un dato que nadie cargó se arregla en obra; una partida que
// todavía no terminó no se arregla, se espera. Mezclarlas produce una lista de 404 «pendientes» que
// nadie puede repartir.
//
// ═══ LA CAUSA NO SE ADIVINA DEL MOTIVO: NECESITA CONTEXTO ═══
//
// El MISMO motivo tiene causas distintas según lo que haya alrededor, y por eso `causaRaiz` pide un
// contexto y no se puede calcular con la observación sola:
//
//   · `SIN_COSTO_REAL` con la tabla de costos VACÍA es falta de captura.
//   · `SIN_COSTO_REAL` con la tabla LLENA y esta partida en cero es otra cosa —una imputación que no
//     engancha, un recurso nombrado distinto de los dos lados— y se arregla en el OS, no en obra.
//
// Un clasificador que devolviera siempre lo mismo sería la constante disfrazada que este repo ya
// pagó. Por eso las dos ramas existen y las dos están probadas.

/** Quién arregla cada hueco. Es lo único que convierte la tabla en trabajo repartible. */
export const DISPOSICION = Object.freeze({
  ESTRUCTURA: 'ESTRUCTURA',   // el enganche falta y se arregla en el OS, hoy
  FALTA_DATO: 'FALTA_DATO',   // el lugar donde va el dato existe y está vacío: lo carga una persona
  TIEMPO: 'TIEMPO',           // todavía no. NO es un defecto y no se cuenta como pendiente
  ALCANCE: 'ALCANCE',         // se ejecutó algo que la cotización no previó: es una decisión comercial
  NO_APLICA: 'NO_APLICA',     // la pregunta no corresponde. Distinto de no saber
})

export const CAUSA_RAIZ = Object.freeze({
  SIN_GENEALOGIA: 'SIN_GENEALOGIA',                 // la obra no tiene cotización congelada: no hay plan
  SIN_ENLACE_ACTIVIDAD: 'SIN_ENLACE_ACTIVIDAD',     // la partida del plan no llega a ninguna actividad
  CIERRE_INALCANZABLE: 'CIERRE_INALCANZABLE',       // nada puede declarar el 100%: la partida no cierra NUNCA
  CAPTURA_VACIA: 'CAPTURA_VACIA',                   // la puerta de entrada del dato no tiene una sola fila
  IDENTIDAD_RECURSO: 'IDENTIDAD_RECURSO',           // hay datos pero no enganchan con este recurso
  PLAN_SIN_CRONOGRAMA: 'PLAN_SIN_CRONOGRAMA',       // el plan heredado no trajo días
  PLAN_SIN_EL_DATO: 'PLAN_SIN_EL_DATO',             // la cotización congelada no trae cantidad/hs/costo
  SIN_EJECUCION: 'SIN_EJECUCION',                   // todavía no se ejecutó nada
  EN_CURSO: 'EN_CURSO',                             // empezada: cierra y recién ahí se compara
  ALCANCE_NO_COTIZADO: 'ALCANCE_NO_COTIZADO',
  SUBCONTRATADA: 'SUBCONTRATADA',
  OTRO: 'OTRO',
})

const raiz = (causa, disposicion, arregla) => Object.freeze({ causa, disposicion, arregla })

/**
 * LA CAUSA RAÍZ DE UNA OBSERVACIÓN NO COMPARABLE. PURA.
 *
 * `ctx` describe lo que rodea a la observación y NADA de eso se deduce acá:
 *   · `tieneGenealogia`        — la obra tiene una cotización congelada enganchada
 *   · `partidaConActividad`    — esta partida del plan llega a una actividad de obra
 *   · `puedeCerrar`            — existe algún parte capaz de declarar el 100% de esta partida
 *   · `cronogramaTieneDias`    — el cronograma operativo tiene días para esta partida
 *   · `capturaVacia`           — por concepto: la tabla que recibe ese dato está vacía en toda la base
 *
 * Una observación COMPARABLE no tiene causa raíz y devuelve `null`: inventarle una la convertiría en
 * un pendiente y el cuadro dejaría de sumar.
 */
export function causaRaiz(obs, ctx = {}) {
  if (!obs) throw new Error('causaRaiz necesita la observación')
  if (obs.comparable) return null
  const m = obs.motivoNoComparable
  const vacia = ctx.capturaVacia?.[obs.concepto] ?? null

  if (ctx.tieneGenealogia === false) {
    return raiz(CAUSA_RAIZ.SIN_GENEALOGIA, DISPOSICION.ESTRUCTURA, 'enganchar la obra con su cotización congelada (obra_origen_cotizacion)')
  }
  if (m === NO_COMPARABLE.SIN_RECURSO_EN_COMPOSICION) {
    return raiz(CAUSA_RAIZ.ALCANCE_NO_COTIZADO, DISPOSICION.ALCANCE, 'decidir si era alcance no cotizado o una imputación mal hecha')
  }
  if (m === NO_COMPARABLE.SUBCONTRATADA_SIN_HH) {
    return raiz(CAUSA_RAIZ.SUBCONTRATADA, DISPOSICION.NO_APLICA, 'nada: una partida subcontratada no lleva HH propias')
  }
  if (m === NO_COMPARABLE.SIN_PLAN) {
    if (obs.concepto === CONCEPTO.DURACION) {
      // Los días NO vienen de la cotización —una oferta no cotiza plazos por partida— sino del
      // cronograma. Si el cronograma los tiene y el plan salió sin ellos, el hueco es de cableado y
      // se arregla hoy. Si el cronograma tampoco los tiene, no hay nada que cablear.
      return ctx.cronogramaTieneDias
        ? raiz(CAUSA_RAIZ.PLAN_SIN_CRONOGRAMA, DISPOSICION.ESTRUCTURA, 'pasar los días del cronograma al heredar el plan (heredarPlan · diasPorPartida)')
        : raiz(CAUSA_RAIZ.PLAN_SIN_CRONOGRAMA, DISPOSICION.FALTA_DATO, 'planificar los días de esta partida: sin plazo previsto no hay atraso que medir')
    }
    return raiz(CAUSA_RAIZ.PLAN_SIN_EL_DATO, DISPOSICION.FALTA_DATO, 'completar el dato en la cotización ANTES de congelarla: después ya no se toca')
  }
  if (ctx.partidaConActividad === false) {
    return raiz(CAUSA_RAIZ.SIN_ENLACE_ACTIVIDAD, DISPOSICION.ESTRUCTURA, 'apuntar la actividad de obra a su cotizacion_partida_id')
  }
  if (m === NO_COMPARABLE.PARTIDA_EN_CURSO) {
    // ═══ EL CIERRE QUE NO PUEDE LLEGAR ═══
    // Medido sobre Quattropani: los ÚNICOS partes con `avance_pct = 100` están en actividades sin
    // `cotizacion_partida_id`, y los que traen cantidad no traen porcentaje. Ninguna partida del
    // plan puede alcanzar el 100 %, así que «se compara cuando cierre» es una promesa vacía y
    // CANTIDAD, HH y COSTO quedan en curso para siempre. Eso NO es esperar: es un defecto.
    return ctx.puedeCerrar === false
      ? raiz(CAUSA_RAIZ.CIERRE_INALCANZABLE, DISPOSICION.ESTRUCTURA, 'ningún parte de esta partida puede declarar el 100 %: el que lo declara está en una actividad sin partida')
      : raiz(CAUSA_RAIZ.EN_CURSO, DISPOSICION.TIEMPO, 'nada: cierra y ahí se compara')
  }
  if (m === NO_COMPARABLE.SIN_REAL) {
    return raiz(CAUSA_RAIZ.SIN_EJECUCION, DISPOSICION.TIEMPO, 'nada: la partida no empezó')
  }
  if (m === NO_COMPARABLE.SOLO_PORCENTAJE) {
    return raiz(CAUSA_RAIZ.CAPTURA_VACIA, DISPOSICION.FALTA_DATO, 'cargar la CANTIDAD ejecutada en el parte, no sólo el porcentaje')
  }
  if (m === NO_COMPARABLE.SIN_HH_REALES || m === NO_COMPARABLE.SIN_COSTO_REAL || m === NO_COMPARABLE.SIN_CONSUMO_REGISTRADO) {
    // ═══ UNA PARTIDA QUE NO EMPEZÓ NO TIENE UN PROBLEMA DE CLAVE ═══
    //
    // Lo encontró la primera corrida de este clasificador contra la base real: con 6 imputaciones de
    // HH en la obra, `capturaVacia[HH]` da `false`, y las 21 partidas que nadie tocó todavía salían
    // como IDENTIDAD_RECURSO — «hay horas y no enganchan, revisá la clave». Eran 21 partidas sin
    // empezar. Un diagnóstico así manda a alguien a buscar un defecto que no existe, y es la misma
    // familia de error que el archivo entero evita: afirmar más de lo que el dato sostiene.
    //
    // El hueco sólo es sospechoso cuando la partida SÍ registró ejecución y aun así no tiene el
    // dato: ahí se reportó avance y no se imputó nada, y eso hay que mirarlo.
    if (ctx.partidaConEjecucion === false) {
      return raiz(CAUSA_RAIZ.SIN_EJECUCION, DISPOSICION.TIEMPO, 'nada: la partida no empezó, y sin trabajo no hay horas ni consumo que imputar')
    }
    if (vacia === true) return raiz(CAUSA_RAIZ.CAPTURA_VACIA, DISPOSICION.FALTA_DATO, `nadie cargó nunca ${obs.concepto}: la puerta de entrada está vacía en toda la base`)
    if (vacia === false) return raiz(CAUSA_RAIZ.IDENTIDAD_RECURSO, DISPOSICION.ESTRUCTURA, `hay ${obs.concepto} registrado en la obra, la partida registró avance y aun así no engancha: revisar la clave`)
    // `null` = nadie midió si la puerta está vacía. NO se elige una de las dos: un control que no
    // pudo mirar no dice «no está».
    return raiz(CAUSA_RAIZ.OTRO, DISPOSICION.FALTA_DATO, `sin medir si la captura de ${obs.concepto} está vacía: no se puede repartir el arreglo`)
  }
  return raiz(CAUSA_RAIZ.OTRO, DISPOSICION.FALTA_DATO, 'a determinar')
}

/**
 * EL CUADRO DE CAUSAS DE UNA CORRIDA. PURA.
 *
 * `contextoDe(obs)` devuelve el `ctx` de cada observación — lo arma quien tiene la base delante.
 * El cuadro suma por causa Y por disposición, porque son dos lecturas distintas: la primera dice
 * qué pasa, la segunda dice a quién se le manda.
 */
export function cuadroDeCausas(observaciones = [], contextoDe = () => ({})) {
  const porCausa = {}
  const porDisposicion = {}
  const filas = []
  for (const o of observaciones) {
    const r = causaRaiz(o, contextoDe(o))
    if (!r) continue
    filas.push({ entidad: o.entidad, concepto: o.concepto, motivo: o.motivoNoComparable, ...r })
    porCausa[r.causa] = (porCausa[r.causa] ?? 0) + 1
    porDisposicion[r.disposicion] = (porDisposicion[r.disposicion] ?? 0) + 1
  }
  return Object.freeze({
    filas: Object.freeze(filas),
    porCausa: Object.freeze(porCausa),
    porDisposicion: Object.freeze(porDisposicion),
    // Lo que de verdad se puede recuperar escribiendo código, separado de lo que hay que ir a
    // buscar a la obra. Sin esta separación, «404 no comparables» no se puede planificar.
    recuperablesPorEstructura: porDisposicion[DISPOSICION.ESTRUCTURA] ?? 0,
    faltaDatoDeclarado: porDisposicion[DISPOSICION.FALTA_DATO] ?? 0,
    noSonDefecto: (porDisposicion[DISPOSICION.TIEMPO] ?? 0) + (porDisposicion[DISPOSICION.NO_APLICA] ?? 0),
    // Los huecos que alguien tiene que cerrar. Lo que todavía no empezó NO es un hueco.
    huecosAccionables: filas.length
      - ((porDisposicion[DISPOSICION.TIEMPO] ?? 0) + (porDisposicion[DISPOSICION.NO_APLICA] ?? 0)),
  })
}

/**
 * LA COMPARABILIDAD, SOBRE EL DENOMINADOR QUE CORRESPONDE. PURA.
 *
 * ═══ «2 DE 406» TIENE EL DENOMINADOR INFLADO ═══
 *
 * Medido sobre Quattropani: de las 404 no comparables, 351 son partidas que NO EMPEZARON. Contarlas
 * hace que la tasa mida cuánto falta ejecutar de la obra, no cuánto se puede comparar de lo
 * ejecutado — y como una obra siempre empieza vacía, la tasa arranca cerca de cero por diseño y
 * después sube sola con el avance, sin que nadie arregle nada. Una métrica que mejora sin trabajo no
 * está midiendo trabajo.
 *
 * El denominador honesto es lo VIVO: lo que ya se puede comparar más lo que se querría comparar y no
 * se puede por un hueco real. Y con la obra sin arrancar el resultado NO es 0 %: es `SIN_MEDIR`.
 * Cero por ciento dice «se intentó y no se pudo»; acá todavía no hubo nada que intentar.
 */
export function comparabilidadViva({ comparables = 0, cuadro } = {}) {
  const base = comparables + (cuadro?.huecosAccionables ?? 0)
  return Object.freeze({
    comparables,
    huecosAccionables: cuadro?.huecosAccionables ?? 0,
    base,
    fueraDelDenominador: cuadro?.noSonDefecto ?? 0,
    tasa: base > 0 ? Math.round((comparables / base) * 1000) / 1000 : SIN_MEDIR,
  })
}

/**
 * LA COBERTURA DEL UNIVERSO. PURA.
 *
 * ═══ EL DENOMINADOR QUE NO SE VE ═══
 *
 * «2 comparables de 406» se mide SOBRE LAS OBRAS QUE TIENEN GENEALOGÍA. Las que no la tienen no
 * aportan cero observaciones malas: no aportan NINGUNA, y por eso no bajan ningún promedio y no
 * aparecen en ninguna tabla. Medido: 5 obras con 244 partes de ejecución quedan enteras fuera del
 * cuadro, y el cuadro no tiene forma de decirlo.
 *
 * Es el defecto de «un control que no pudo mirar no dice que no está», aplicado al universo entero.
 * Por eso la cobertura viaja al lado del porcentaje y `sesgado` es `true` mientras falte una obra.
 */
export function coberturaDeObras(obras = []) {
  const conEjecucion = obras.filter((o) => (o.partes ?? 0) > 0 || (o.imputacionesHH ?? 0) > 0)
  const miradas = conEjecucion.filter((o) => o.tieneGenealogia)
  const noMiradas = conEjecucion.filter((o) => !o.tieneGenealogia)
  return Object.freeze({
    obrasConEjecucion: conEjecucion.length,
    obrasMiradas: miradas.length,
    obrasNoMiradas: noMiradas.length,
    detalleNoMiradas: Object.freeze(noMiradas.map((o) => Object.freeze({ obraId: o.obraId, partes: o.partes ?? 0, imputacionesHH: o.imputacionesHH ?? 0 }))),
    partesFueraDelCuadro: noMiradas.reduce((a, o) => a + (o.partes ?? 0), 0),
    // Con una sola obra afuera, cualquier tasa de comparabilidad está medida sobre un universo
    // recortado y NO se puede leer como «la empresa».
    sesgado: noMiradas.length > 0,
    cobertura: conEjecucion.length > 0 ? miradas.length / conEjecucion.length : null,
  })
}
