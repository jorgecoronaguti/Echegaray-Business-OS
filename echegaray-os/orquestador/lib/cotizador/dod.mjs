// LA DEFINITION OF DONE COMO CONTROL EJECUTABLE (§29).
//
// El pedido del dueño trae veinticuatro casilleros. Un casillero marcado a mano no prueba nada: lo
// que prueba algo es una función que MIRA el sistema y puede contestar que NO. Este módulo es esa
// función, y es PURA — recibe la evidencia ya juntada y dictamina. Quien junta la evidencia es
// `orquestador/scripts/xsas-dod.mjs`, que sí toca la base.
//
// ═══ LA REGLA QUE JUSTIFICA TODO EL ARCHIVO ═══
//
// **NO_VERIFICABLE NO ES CUMPLE.** Un criterio que no se pudo medir no está cumplido: está sin
// medir, y eso baja el veredicto global. La trampa contraria —dar por bueno lo que no se miró— es
// la que este repo ya pagó con «un control que no pudo mirar no dice "no está"»: seis faltantes
// falsos porque la ausencia de dato se leyó como ausencia de problema.
//
// Y su espejo: un criterio NO se marca CUMPLE porque exista el código que lo implementa. Se marca
// CUMPLE porque hay una MEDICIÓN con número. «Existe el módulo» es intención; «corrió sobre datos
// reales y dio esto» es efecto.

export const VEREDICTO = Object.freeze({
  CUMPLE: 'CUMPLE',
  NO_CUMPLE: 'NO_CUMPLE',
  NO_VERIFICABLE: 'NO_VERIFICABLE',
})

export const GLOBAL = Object.freeze({
  PASS: 'PASS',
  PASS_CON_LIMITACIONES: 'PASS_CON_LIMITACIONES',
  FAIL: 'FAIL',
})

/**
 * LOS VEINTICUATRO CRITERIOS, en el orden del pedido.
 *
 * `mide` es el nombre de la clave de evidencia que lo contesta. `exige` es el predicado sobre esa
 * evidencia. Separarlos permite testear el predicado sin base de datos, que es el punto.
 */
export const CRITERIOS = Object.freeze([
  { id: 1, dice: 'entiende proyectos heterogéneos', mide: 'proyectosEntendidos', exige: (e) => e.distintos >= 3 && e.formatos >= 4 },
  { id: 2, dice: 'reconstruye alcance', mide: 'alcance', exige: (e) => e.partidasConEstado > 0 && e.sinDecidir === 0 },
  { id: 3, dice: 'computa con evidencia', mide: 'computo', exige: (e) => e.conGenealogiaCompleta === e.cantidades && e.cantidades > 0 },
  { id: 4, dice: 'selecciona partidas defendiblemente', mide: 'mapeo', exige: (e) => e.mapeadas > 0 && e.porParecidoTextualSinAtributos === 0 },
  { id: 5, dice: 'usa composiciones', mide: 'composiciones', exige: (e) => e.resueltas > 0 && e.incompletasQueCostaronCero === 0 },
  { id: 6, dice: 'explota recursos', mide: 'explosion', exige: (e) => e.recursos > 0 && e.reconcilia === true },
  // `HH ≠ DURACIÓN` no se prueba con un campo del cuadro —`costoDirecto()` no publica días— sino con
  // los tests de `plano/cuadrilla.mjs` y `plan-vs-real.mjs`. Acá se mide lo que este cuadro puede
  // medir: que las horas existan y salgan de una composición, no de un supuesto.
  { id: 7, dice: 'estima HH/productividad', mide: 'hh', exige: (e) => e.horas > 0 },
  { id: 8, dice: 'gestiona precios autónomamente', mide: 'precios', exige: (e) => e.resueltosAutonomamente > 0 && e.sinPrecioValorizadoEnCero === 0 },
  { id: 9, dice: 'maneja subcontratos', mide: 'subcontratos', exige: (e) => e.conAlcanceYVigencia === e.total && e.total > 0 },
  { id: 10, dice: 'calcula costo directo', mide: 'costoDirecto', exige: (e) => e.afirmadoEnCasos > 0 },
  { id: 11, dice: 'calcula indirectos', mide: 'indirectos', exige: (e) => e.conceptos > 0 && e.separaCalculadoDeAplicado === true },
  { id: 12, dice: 'aplica política comercial versionada', mide: 'comercial', exige: (e) => e.versionCitada !== null && e.congeladaNoCambiaConLaPolitica === true },
  { id: 13, dice: 'deriva precio', mide: 'precio', exige: (e) => e.coeficienteDerivado === true && e.coeficienteEscribible === false },
  { id: 14, dice: 'declara incertidumbre', mide: 'incertidumbre', exige: (e) => e.noDeclarada === 0 },
  { id: 15, dice: 'genera cotización versionada', mide: 'versionado', exige: (e) => e.congeladaEsInmutable === true && e.ofertaDerivaDeCongelada === true },
  { id: 16, dice: 'pasa presupuesto a obra', mide: 'aObra', exige: (e) => e.obrasConGenealogia > 0 },
  { id: 17, dice: 'captura real', mide: 'ejecucionReal', exige: (e) => e.relacionesEstablecidas > 0 },
  { id: 18, dice: 'compara Plan vs Real', mide: 'planVsReal', exige: (e) => e.comparaciones > 0 && e.causasInventadas === 0 },
  { id: 19, dice: 'genera aprendizaje candidato', mide: 'candidatos', exige: (e) => e.generados > 0 },
  { id: 20, dice: 'valida/promueve con governance', mide: 'governance', exige: (e) => e.rechazadosPorGobernanza > 0 || e.promovidos > 0 },
  { id: 21, dice: 'reutiliza aprendizaje', mide: 'reuso', exige: (e) => e.reutilizados > 0 },
  { id: 22, dice: 'funciona sin Claude', mide: 'claudeZero', exige: (e) => e.llamadasLlm === 0 && e.llegoAlFinal === true },
  // El segundo término no lo puede contestar ninguna consulta: que nadie haya aflojado un umbral
  // para que un caso cierre lo sostiene el diff auditado, no una medición. Por eso el recolector lo
  // devuelve `null` y el criterio cae a NO_VERIFICABLE — una limitación declarada BLOQUEA el
  // criterio que toca; ponerla al lado del criterio cumplido no lo salva, lo anula.
  { id: 23, dice: 'generaliza a varios proyectos', mide: 'generalizacion', exige: (e) => e.casosPass >= 3 && e.reglasTocadasParaQueCierren === 0 },
  { id: 24, dice: 'auditor independiente PASS', mide: 'auditoria', exige: (e) => e.veredicto === 'PASS' && e.loFirmoQuienNoLoConstruyo === true },
])

/**
 * EVALÚA UN CRITERIO. Pura.
 *
 * Sin evidencia (`undefined`, `null`) el veredicto es NO_VERIFICABLE — nunca CUMPLE y nunca
 * NO_CUMPLE: no medimos lo mismo que medir y que dé mal. Si el predicado se rompe al evaluar,
 * también es NO_VERIFICABLE, con el error adentro: una excepción no es un «no».
 */
export function evaluar(criterio, evidencia) {
  const e = evidencia?.[criterio.mide]
  if (e === undefined || e === null) {
    return { id: criterio.id, dice: criterio.dice, veredicto: VEREDICTO.NO_VERIFICABLE, porque: `no se juntó evidencia de «${criterio.mide}»`, evidencia: null }
  }
  try {
    const ok = criterio.exige(e) === true
    return {
      id: criterio.id,
      dice: criterio.dice,
      veredicto: ok ? VEREDICTO.CUMPLE : VEREDICTO.NO_CUMPLE,
      porque: ok ? 'la medición lo sostiene' : 'la medición NO lo sostiene',
      evidencia: e,
    }
  } catch (err) {
    return { id: criterio.id, dice: criterio.dice, veredicto: VEREDICTO.NO_VERIFICABLE, porque: `la medición se rompió: ${err.message}`, evidencia: e }
  }
}

/**
 * EL VEREDICTO GLOBAL.
 *
 * Un solo NO_CUMPLE es FAIL — no se promedia, no se pondera, no hay «casi». Sin ningún NO_CUMPLE
 * pero con algo sin medir es PASS_CON_LIMITACIONES, y las limitaciones se nombran. PASS pelado
 * exige los veinticuatro medidos y cumplidos.
 */
export function veredictoGlobal(filas = []) {
  const noCumple = filas.filter((f) => f.veredicto === VEREDICTO.NO_CUMPLE)
  const sinMedir = filas.filter((f) => f.veredicto === VEREDICTO.NO_VERIFICABLE)
  const cumple = filas.filter((f) => f.veredicto === VEREDICTO.CUMPLE)
  const estado = noCumple.length ? GLOBAL.FAIL : sinMedir.length ? GLOBAL.PASS_CON_LIMITACIONES : GLOBAL.PASS
  return {
    estado,
    cumple: cumple.length,
    noCumple: noCumple.length,
    sinMedir: sinMedir.length,
    total: filas.length,
    // El numerador honesto: lo CUMPLIDO sobre el total. Lo sin medir NO suma al numerador, que es
    // exactamente lo que impide que «no lo miré» se lea como «anda».
    completas: `${cumple.length}/${filas.length}`,
    bloquean: noCumple.map((f) => `#${f.id} ${f.dice}`),
    limitaciones: sinMedir.map((f) => `#${f.id} ${f.dice} — ${f.porque}`),
  }
}

/** Corre los veinticuatro contra la evidencia juntada. */
export function correrDod(evidencia = {}, { criterios = CRITERIOS } = {}) {
  const filas = criterios.map((c) => evaluar(c, evidencia))
  return { filas, ...veredictoGlobal(filas) }
}
