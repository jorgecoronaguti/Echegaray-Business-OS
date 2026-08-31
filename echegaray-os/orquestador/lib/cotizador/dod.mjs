// LA DEFINITION OF DONE COMO CONTROL EJECUTABLE (§29 del pedido original, §J del segundo).
//
// El pedido del dueño trae veinticuatro casilleros. Un casillero marcado a mano no prueba nada: lo
// que prueba algo es una función que MIRA el sistema y puede contestar que NO. Este módulo es esa
// función, y es PURA — recibe la evidencia ya juntada y dictamina. Quien junta la evidencia es
// `orquestador/scripts/xsas-dod.mjs`, que sí toca la base.
//
// ═══ LA REGLA QUE JUSTIFICA TODO EL ARCHIVO ═══
//
// **NO_EJERCITADA NO ES PASS.** Una capacidad que ninguna corrida alcanzó no está cumplida: está
// sin ejercitar, y eso baja el veredicto global. La trampa contraria —dar por bueno lo que no se
// miró— es la que este repo ya pagó con «un control que no pudo mirar no dice "no está"»: seis
// faltantes falsos porque la ausencia de dato se leyó como ausencia de problema.
//
// Y su espejo: un criterio NO se marca PASS porque exista el código que lo implementa. Se marca
// PASS porque hay una MEDICIÓN con número. «Existe el módulo» es intención; «corrió sobre datos
// reales y dio esto» es efecto. El dueño lo escribió como invariante: EXISTE_CÓDIGO ≠
// CAPACIDAD_DEMOSTRADA.
//
// ═══ POR QUÉ CUATRO ESTADOS Y NO TRES ═══
//
// La versión anterior tenía un solo cajón —NO_VERIFICABLE— para dos cosas que no son la misma:
// «ninguna corrida llegó hasta acá» y «este término no lo puede contestar ninguna consulta». Meter
// las dos en la misma bolsa esconde cuál de las dos es trabajo pendiente y cuál es un límite del
// instrumento. El dueño pidió cuatro estados: PASS, FAIL, NO_EJERCITADA, NO_APLICA. Se conserva la
// distinción en `motivo`, con vocabulario cerrado, para que el cuadro diga por qué.

export const VEREDICTO = Object.freeze({
  PASS: 'PASS',
  FAIL: 'FAIL',
  NO_EJERCITADA: 'NO_EJERCITADA',
  NO_APLICA: 'NO_APLICA',
})

/** Por qué una capacidad quedó sin ejercitar. Vocabulario cerrado: si no está acá, no se puede decir. */
export const MOTIVO = Object.freeze({
  NO_HUBO_CORRIDA: 'NO_HUBO_CORRIDA',       // el recolector no juntó nada: nada la alcanzó
  TERMINO_NO_MEDIBLE: 'TERMINO_NO_MEDIBLE', // se juntó evidencia pero un término no lo contesta ninguna consulta
  MEDICION_ROTA: 'MEDICION_ROTA',           // el predicado tiró: una excepción no es un «no»
})

export const GLOBAL = Object.freeze({
  PASS: 'PASS',
  PASS_CON_LIMITACIONES: 'PASS_CON_LIMITACIONES',
  FAIL: 'FAIL',
})

/**
 * CÓMO EL RECOLECTOR DECLARA LO QUE NO PUDO MEDIR.
 *
 * Devolver `null` a secas dice «no hay nada» y se lee como NO_HUBO_CORRIDA. Cuando el recolector
 * SÍ sabe por qué —el término es estructuralmente incontestable, o el criterio no aplica en este
 * contexto— lo dice con estos dos envoltorios, y la razón es obligatoria: un NO_APLICA sin razón
 * escrita es la forma más barata de sacarse un criterio de encima, así que se rechaza.
 *
 * Se llama `sinPoderMedir` y no `sinMedir` a propósito: `costo.mjs` ya exporta un `sinMedir(cantidad)`
 * que es el predicado de cantidad no medida del motor. Dos cosas distintas con el mismo nombre en el
 * mismo dominio es una colisión esperando a que alguien importe las dos.
 */
export const sinPoderMedir = (razon) => ({ __sinMedir: exigirRazon(razon, 'sinPoderMedir') })
export const noAplica = (razon) => ({ __noAplica: exigirRazon(razon, 'noAplica') })

function exigirRazon(razon, quien) {
  const r = typeof razon === 'string' ? razon.trim() : ''
  if (!r) throw new Error(`${quien}() exige una razón escrita: un criterio no se descarta en silencio`)
  return r
}

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
  { id: 23, dice: 'generaliza a varios proyectos', mide: 'generalizacion', exige: (e) => e.casosPass >= 3 && e.reglasTocadasParaQueCierren === 0 },
  { id: 24, dice: 'auditor independiente PASS', mide: 'auditoria', exige: (e) => e.veredicto === 'PASS' && e.loFirmoQuienNoLoConstruyo === true },
])

/**
 * EVALÚA UN CRITERIO. Pura.
 *
 * Sin evidencia el veredicto es NO_EJERCITADA — nunca PASS y nunca FAIL: no medimos lo mismo que
 * medir y que dé mal. Si el predicado se rompe al evaluar, también, con el error adentro: una
 * excepción no es un «no».
 */
export function evaluar(criterio, evidencia) {
  const base = { id: criterio.id, dice: criterio.dice }
  const e = evidencia?.[criterio.mide]

  if (e === undefined || e === null) {
    return { ...base, veredicto: VEREDICTO.NO_EJERCITADA, motivo: MOTIVO.NO_HUBO_CORRIDA, porque: `ninguna corrida dejó evidencia de «${criterio.mide}»`, evidencia: null }
  }
  if (typeof e === 'object' && typeof e.__noAplica === 'string') {
    return { ...base, veredicto: VEREDICTO.NO_APLICA, motivo: null, porque: e.__noAplica, evidencia: null }
  }
  if (typeof e === 'object' && typeof e.__sinMedir === 'string') {
    return { ...base, veredicto: VEREDICTO.NO_EJERCITADA, motivo: MOTIVO.TERMINO_NO_MEDIBLE, porque: e.__sinMedir, evidencia: null }
  }

  try {
    const ok = criterio.exige(e) === true
    return {
      ...base,
      veredicto: ok ? VEREDICTO.PASS : VEREDICTO.FAIL,
      motivo: null,
      porque: ok ? 'la medición lo sostiene' : 'la medición NO lo sostiene',
      evidencia: e,
    }
  } catch (err) {
    return { ...base, veredicto: VEREDICTO.NO_EJERCITADA, motivo: MOTIVO.MEDICION_ROTA, porque: `la medición se rompió: ${err.message}`, evidencia: e }
  }
}

/**
 * EL VEREDICTO GLOBAL.
 *
 * Un solo FAIL es FAIL — no se promedia, no se pondera, no hay «casi». Sin ningún FAIL pero con
 * algo sin ejercitar es PASS_CON_LIMITACIONES, y las limitaciones se nombran. PASS pelado exige
 * los veinticuatro resueltos (los NO_APLICA, con su razón escrita, salen del denominador: eso es
 * exactamente lo que significa que no apliquen).
 */
export function veredictoGlobal(filas = []) {
  const de = (v) => filas.filter((f) => f.veredicto === v)
  const pass = de(VEREDICTO.PASS)
  const fail = de(VEREDICTO.FAIL)
  const sinEjercitar = de(VEREDICTO.NO_EJERCITADA)
  const fuera = de(VEREDICTO.NO_APLICA)
  const denominador = filas.length - fuera.length
  const estado = fail.length ? GLOBAL.FAIL : sinEjercitar.length ? GLOBAL.PASS_CON_LIMITACIONES : GLOBAL.PASS
  return {
    estado,
    pass: pass.length,
    fail: fail.length,
    sinEjercitar: sinEjercitar.length,
    noAplica: fuera.length,
    total: filas.length,
    // El numerador honesto: lo demostrado sobre lo que corresponde demostrar. Lo sin ejercitar NO
    // suma al numerador, que es exactamente lo que impide que «no lo miré» se lea como «anda».
    completas: `${pass.length}/${denominador}`,
    bloquean: fail.map((f) => `#${f.id} ${f.dice}`),
    limitaciones: sinEjercitar.map((f) => `#${f.id} ${f.dice} — ${f.porque}`),
    excluidas: fuera.map((f) => `#${f.id} ${f.dice} — ${f.porque}`),
  }
}

/** Corre los veinticuatro contra la evidencia juntada. */
export function correrDod(evidencia = {}, { criterios = CRITERIOS } = {}) {
  const filas = criterios.map((c) => evaluar(c, evidencia))
  return { filas, ...veredictoGlobal(filas) }
}
