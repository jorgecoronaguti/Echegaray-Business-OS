// PLAN CONTRA REAL, POR ACTIVIDAD — el núcleo determinístico del aprendizaje de obra.
//
// ═══ QUÉ CONTESTA ═══
//
// «La actividad se planificó en X horas para Y metros; ¿en cuántas horas y cuántos metros se hizo
// de verdad, y qué dice eso del rendimiento que vamos a usar para cotizar la próxima?»
//
// ═══ POR QUÉ ES UNA FUNCIÓN PURA Y NO UN PROMPT ═══
//
// Una división la hace bien una computadora siempre y un modelo casi siempre, y ese «casi» sobre un
// rendimiento se transforma en una cotización mal armada. El módulo no llama a nadie: recibe el
// plan y el real ya leídos y devuelve la comparación. El modelo, cuando entra, entra después y para
// explicar POR QUÉ hubo desvío — nunca para calcularlo.
//
// ═══ LAS TRES REGLAS QUE GOBIERNAN CADA NÚMERO DE ACÁ ═══
//
// 1. **NULL NO ES CERO.** Una actividad sin HH cargadas no rindió infinito ni rindió cero: no se
//    sabe. Todo lo que no se puede calcular sale `null` y se dice cuál dato faltó (`faltantes`).
//
// 2. **SE COMPARA POR UNIDAD, NO POR TOTAL.** Una actividad al 43% consumió menos HH que el plan
//    entero, y leer eso como «vamos bien» es el error clásico. Lo comparable a cualquier altura de
//    la obra son las **horas por unidad** (hs/m², hs/m³), y ése es el número que aprende el OS.
//
// 3. **LA CONFIANZA VIAJA CON EL DATO.** Un rendimiento medido sobre el 20% de una actividad no
//    vale lo mismo que uno medido sobre el 100%, y quien lo consuma tiene que poder verlo sin
//    preguntar.

/** Un número o `null` — nunca `NaN`, nunca `0` de relleno, nunca un string. */
export function num(v) {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** División que no miente: sin numerador, sin denominador o con denominador cero devuelve `null`. */
function dividir(a, b) {
  const x = num(a), y = num(b)
  if (x === null || y === null || y === 0) return null
  return x / y
}

/** Desvío relativo en %, positivo = el real fue MAYOR que el plan. `null` si no se puede comparar. */
function desvioPct(real, plan) {
  const r = num(real), p = num(plan)
  if (r === null || p === null || p === 0) return null
  return ((r - p) / p) * 100
}

/**
 * EL AVANCE, con un orden de preferencia deliberado.
 *
 * Primero lo que alguien MIDIÓ en obra (`avancePct` de la última ejecución); si no hay, se deduce de
 * la cantidad ejecutada contra la objetivo. Se topea en 100: una actividad puede ejecutar más
 * cantidad que la prevista —pasa, y es un dato— pero «avanzada al 130%» no significa nada.
 */
export function avanceDe(plan, real) {
  const medido = num(real?.avancePct)
  if (medido !== null) return Math.min(100, medido)
  const porCantidad = dividir(real?.cantidad, plan?.cantidad)
  return porCantidad === null ? null : Math.min(100, porCantidad * 100)
}

/**
 * LA CONFIANZA DE LA OBSERVACIÓN. No es una opinión: sale del avance y de qué datos existen.
 *
 *   alta   la actividad está terminada (≥95%) y tiene cantidad y HH reales cargadas.
 *   media  pasó de la mitad con los dos datos: el rendimiento ya se estabilizó.
 *   baja   arranque, o falta alguno de los dos números.
 *
 * Por debajo de `MINIMO_APRENDIBLE` de avance ni siquiera se propone un aprendizaje: los primeros
 * metros de cualquier tarea incluyen el armado del frente y no representan el rendimiento de régimen.
 */
export const MINIMO_APRENDIBLE = 20

export function confianzaDe({ avance, cantidadReal, hhReal, terminada }) {
  const completo = num(cantidadReal) !== null && num(hhReal) !== null
  const a = num(avance)
  if (!completo) return 'baja'
  // TERMINADA LO DICE EL SISTEMA, NO EL PORCENTAJE. `estado_fecha = 'terminada'` sale de la vista
  // canónica —`estado = 'hecha'` O avance ≥ 100— y es la misma condición con la que la app cierra
  // una actividad. Un 96% no es el final de nada; una actividad marcada hecha al 100% sí lo es.
  if (terminada === true) return 'alta'
  if (a === null) return 'baja'
  if (terminada === false) return a >= 50 ? 'media' : 'baja'
  // Sin el dato de cierre —un llamador viejo, un test— se cae al criterio anterior.
  if (a >= 95) return 'alta'
  if (a >= 50) return 'media'
  return 'baja'
}

/**
 * LA COMPARACIÓN COMPLETA DE UNA ACTIVIDAD.
 *
 * `plan`: { unidad, cantidad, hh, dias, dotacion, costo }
 * `real`: { cantidad, avancePct, hh, hhImproductivas, dias, dotacion, costo }
 *
 * Devuelve todo lo derivado más `faltantes` — la lista de lo que no se pudo calcular y por qué. Esa
 * lista es tan importante como los números: es lo que impide que un hueco se lea como un cero.
 */
export function compararPlanReal(plan = {}, real = {}) {
  const unidad = plan.unidad ?? null
  const cantPlan = num(plan.cantidad)
  const cantReal = num(real.cantidad)
  const hhPlan = num(plan.hh)
  const hhReal = num(real.hh)
  const avance = avanceDe(plan, real)
  const terminada = real.terminada ?? null

  // ═══ HORAS POR UNIDAD — Y CUÁLES HORAS ═══
  //
  // El rendimiento va NETO DE HORAS IMPRODUCTIVAS, y no es una elección de este archivo: es la
  // definición que ya tiene la base, donde `rendimiento_historico.hs_unitarias` es una columna
  // generada como `(hh_reales - hh_improductivas) / cantidad`. Calcularlo distinto acá daría dos
  // números para el mismo concepto —el que muestra el análisis y el que guarda la tabla— y ésa es
  // exactamente la clase de contradicción que el OS no admite.
  //
  // Sin horas marcadas improductivas el neto son las horas cargadas: que nadie haya marcado ninguna
  // sobre horas que SÍ existen es un cero medido, no un dato faltante.
  const hhImprod = hhReal === null ? null : (num(real.hhImproductivas) ?? 0)
  const hhProductivas = hhReal === null ? null : hhReal - hhImprod
  const rendPlan = dividir(hhPlan, cantPlan)
  const rendReal = dividir(hhProductivas, cantReal)

  // Las HH que el plan preveía PARA LO QUE SE HIZO. Comparar el consumo real contra el plan entero
  // de una actividad a medio hacer da siempre «ahorro», y es falso.
  const hhPlanAlAvance = rendPlan === null || cantReal === null ? null : rendPlan * cantReal

  const faltantes = []
  if (cantPlan === null) faltantes.push('cantidad planificada')
  if (hhPlan === null) faltantes.push('HH planificadas')
  if (cantReal === null) faltantes.push('cantidad ejecutada')
  if (hhReal === null) faltantes.push('HH reales imputadas a la actividad')
  if (num(plan.costo) === null && num(real.costo) === null) faltantes.push('costo (no se imputa por actividad)')

  return {
    unidad,
    avancePct: avance,
    plan: {
      cantidad: cantPlan, hh: hhPlan, dias: num(plan.dias),
      dotacion: num(plan.dotacion), costo: num(plan.costo),
      hsUnitarias: rendPlan,
    },
    real: {
      cantidad: cantReal, hh: hhReal, dias: num(real.dias),
      dotacion: num(real.dotacion), costo: num(real.costo),
      hhImproductivas: hhImprod,
      hhProductivas,
      terminada,
      hsUnitarias: rendReal,
    },
    derivado: {
      hhPlanAlAvance,
      // Positivo = se gastaron MÁS horas de las previstas para lo ejecutado.
      desvioHhPct: desvioPct(hhReal, hhPlanAlAvance),
      desvioProductividadPct: desvioPct(rendReal, rendPlan),
      desvioDuracionPct: desvioPct(real.dias, plan.dias),
      desvioDotacionPct: desvioPct(real.dotacion, plan.dotacion),
      desvioCostoPct: desvioPct(real.costo, plan.costo),
    },
    confianza: confianzaDe({ avance, cantidadReal: cantReal, hhReal, terminada: real.terminada }),
    faltantes,
    // Un rendimiento sólo es APRENDIBLE si existe, y si la actividad avanzó lo suficiente como para
    // que el número signifique algo. Lo demás se observa igual, pero no enseña nada todavía.
    aprendible: rendReal !== null && avance !== null && avance >= MINIMO_APRENDIBLE,
  }
}

/**
 * ¿DOS OBSERVACIONES HABLAN DE LO MISMO? — la pregunta que decide si un caso valida a otro.
 *
 * Mismo tipo de tarea y misma unidad, o no son comparables por más parecido que sea el nombre. La
 * `TOLERANCIA` es lo que separa «el segundo caso confirma al primero» de «el segundo caso lo
 * contradice»: dos mediciones de la misma tarea que difieren un 40% no se están confirmando, están
 * diciendo que algo más cambió (la cuadrilla, el frente, el clima) y eso NO valida nada.
 */
export const TOLERANCIA_CONSISTENCIA_PCT = 30

export function sonComparables(a, b) {
  if (!a || !b) return false
  if (a.tareaTipoId && b.tareaTipoId) return a.tareaTipoId === b.tareaTipoId && a.unidad === b.unidad
  return false
}

/**
 * ¿DOS OBRAS DISTINTAS? — la condición extra para VALIDAR, y no la inventa este archivo.
 *
 * La vista `rendimiento_recomendado` ya lo decidió antes: «con UNA sola obra medida NO hay
 * recomendación: hay un dato». Dos frentes de la misma obra comparten cuadrilla, encargado, terreno y
 * clima, así que confirman menos de lo que parece. Si acá validara con dos actividades de una misma
 * obra, el OS tendría dos respuestas distintas a «¿esto ya se puede usar para cotizar?».
 */
export function sonDeObrasDistintas(a, b) {
  return Boolean(a?.obraId) && Boolean(b?.obraId) && a.obraId !== b.obraId
}

export function sonConsistentes(a, b, tolerancia = TOLERANCIA_CONSISTENCIA_PCT) {
  const x = num(a?.hsUnitarias), y = num(b?.hsUnitarias)
  if (x === null || y === null || x === 0) return false
  return Math.abs(((y - x) / x) * 100) <= tolerancia
}

/**
 * EL ESTADO QUE LE CORRESPONDE A UNA OBSERVACIÓN NUEVA, dado lo que ya se sabía.
 *
 * ═══ LA REGLA QUE PROTEGE LA REFERENCIA MAESTRA ═══
 *
 * Un caso aislado NUNCA reemplaza la tabla con la que se viene cotizando. Entra como CANDIDATO y
 * espera. Recién cuando aparece un segundo caso comparable Y consistente el conocimiento se eleva a
 * VALIDADO — y ni siquiera entonces borra la referencia: convive con ella, y quien cotiza ve las dos
 * con su cantidad de casos. La referencia se retira cuando el dueño lo decide, no cuando el OS
 * junta dos mediciones.
 */
export function estadoDelAprendizaje(nuevo, previos = []) {
  const comparables = previos.filter((p) =>
    p.estado !== 'REFERENCIA' &&
    // LA MISMA ACTIVIDAD NO SE CONFIRMA A SÍ MISMA. Medirla el lunes y el jueves da dos filas, y si
    // contaran como dos casos cualquier actividad se validaría sola con sólo dejar pasar los días.
    // Un segundo caso es otra actividad —otro frente, otra cuadrilla, otra obra—, o no es un caso.
    // Y sin identidad no se puede probar que sean dos: dos observaciones sin `actividadId` podrían
    // ser la misma medida dos veces. Ante la duda no confirman.
    Boolean(p.actividadId) && Boolean(nuevo.actividadId) && p.actividadId !== nuevo.actividadId &&
    sonComparables(nuevo, p))
  const consistentes = comparables.filter((p) => sonConsistentes(p, nuevo) && sonDeObrasDistintas(p, nuevo))
  const mismaObra = comparables.filter((p) => sonConsistentes(p, nuevo) && !sonDeObrasDistintas(p, nuevo))

  if (consistentes.length >= 1) {
    return {
      estado: 'VALIDADO',
      vecesConfirmado: consistentes.length + 1,
      // La confianza del conjunto no puede superar la del peor caso que lo sostiene.
      confianza: peorConfianza([nuevo, ...consistentes]),
      porQue: `${consistentes.length + 1} casos comparables y consistentes (±${TOLERANCIA_CONSISTENCIA_PCT}%)`,
    }
  }
  if (mismaObra.length >= 1) {
    return {
      estado: 'CANDIDATO',
      vecesConfirmado: mismaObra.length + 1,
      confianza: peorConfianza([nuevo, ...mismaObra]),
      porQue: `${mismaObra.length + 1} casos consistentes pero todos de la misma obra — hace falta otra obra para validar`,
    }
  }
  if (comparables.length >= 1) {
    return {
      estado: 'CANDIDATO',
      vecesConfirmado: 1,
      confianza: 'baja',
      // Dos mediciones que se contradicen no son un promedio: son una pregunta abierta.
      porQue: `hay ${comparables.length} caso(s) comparable(s) pero el rendimiento difiere más de ${TOLERANCIA_CONSISTENCIA_PCT}% — no se confirman entre sí`,
    }
  }
  return {
    estado: 'CANDIDATO',
    vecesConfirmado: 1,
    confianza: nuevo?.confianza ?? 'baja',
    porQue: 'primer caso real observado para esta tarea',
  }
}

const ORDEN = { baja: 0, media: 1, alta: 2 }
function peorConfianza(xs) {
  const vals = xs.map((x) => ORDEN[x?.confianza] ?? 0)
  return ['baja', 'media', 'alta'][Math.min(...vals)]
}

/**
 * LA FRASE QUE VA AL CONOCIMIENTO DE LA EMPRESA. Se arma acá y no en un prompt: es un hecho medido y
 * tiene que decir siempre lo mismo con los mismos números.
 */
export function afirmacionDe(obs) {
  const u = obs.unidad ?? 'unidad'
  const hs = obs.hsUnitarias === null ? '—' : obs.hsUnitarias.toFixed(4)
  const plan = obs.hsUnitariasPlan == null
    ? 'sin rendimiento planificado con qué compararlo'
    : `contra ${Number(obs.hsUnitariasPlan).toFixed(4)} hs/${u} previstas (${obs.desvioPct > 0 ? '+' : ''}${Number(obs.desvioPct ?? 0).toFixed(1)}%)`
  return `${obs.tarea ?? 'actividad'} en ${obs.obra}: ${hs} hs/${u} reales sobre ${obs.cantidad} ${u} ejecutados al ${Math.round(obs.avancePct ?? 0)}% — ${plan}.`
}
