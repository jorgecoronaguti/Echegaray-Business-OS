// CANTIDAD + RENDIMIENTO → HH → CUADRILLA → DURACIÓN. Puro, determinístico, 0 tokens.
//
// ═══ DE DÓNDE SALE ESTO ═══
//
// Navas R. F., Ridl M. R., Torés L. (2012). «Mano de obra en la construcción: determinación de la
// cuadrilla óptima por medio de una herramienta de simulación». Ingeniería, Revista Académica de la
// FI-UADY, 16-2, pp 151-163, ISSN 1665-529-X. Los autores son del CIRCOT-FI-UNSJ y el trabajo se
// apoya en los estándares zonales de San Juan de Vázquez Cabanillas & De La Torre (1983).
//
// ESO NO LO CONVIERTE EN NORMA NI EN EXPERIENCIA ECSAS. Es INVESTIGACIÓN / REFERENCIA TÉCNICA
// LOCAL: un método de cálculo publicado y verificable, no un rendimiento medido en nuestras obras.
// Cuando ECSAS tenga rendimiento propio para una tarea, gana el nuestro y este método sigue siendo
// el que convierte ese rendimiento en cuadrilla y en días.
//
// ═══ POR QUÉ ES CÓDIGO Y NO UN PROMPT ═══
//
// Todo lo de abajo es aritmética cerrada: divisiones, un máximo y una comparación. Pedirle a un
// modelo que la rehaga en cada cotización cuesta tokens, tarda, y —lo que importa— no da siempre el
// mismo número. Un plan de obra que cambia de duración entre dos corridas no es un plan.
//
// ═══ LO QUE ESTE MÓDULO NO INVENTA ═══
//
// Dos coeficientes del paper son VALORES, no método, y los valores caducan:
//   · la jornada efectiva de 7,50 h sobre 8,00 (0,50 h de aprestamiento y despeje);
//   · la equivalencia 1 jornal de oficial = 1,18 jornales de ayudante, que es una relación SALARIAL
//     y en ECSAS sale de la paritaria UOCRA vigente, no de un paper de 2012.
// Por eso `relacionSalarial` es obligatoria y sin default: pedirla es la forma de que nadie cotice
// con la escala salarial de otra década sin enterarse.

/** La jornada del paper. Se expone para poder citarla; no es la jornada de ECSAS. */
export const JORNADA_PAPER = Object.freeze({
  nominal_h: 8.0,
  efectiva_h: 7.5,
  porQue: 'las 0,50 h restantes son aprestamiento (entrada) y despeje de la zona de trabajo (salida)',
  fuente: 'INVESTIGACION · Navas, Ridl & Torés (2012), Ingeniería FI-UADY 16-2, p. 157',
})

/** La relación salarial del ejemplo del paper. NO se usa sola: hay que pasarla explícitamente, y
 *  hacerlo con este valor es declarar que se está cotizando con la escala de la publicación. */
export const RELACION_SALARIAL_PAPER = Object.freeze({
  valor: 1.18,
  que: 'una jornada de oficial equivale a 1,18 jornadas de ayudante',
  fuente: 'INVESTIGACION · Navas, Ridl & Torés (2012), p. 158 — relación de salarios del ejemplo',
  advertencia: 'para ECSAS esta relación es jornal_oficial / jornal_ayudante de la paritaria UOCRA vigente',
})

const redondear = (n, d = 4) => (Number.isFinite(n) ? Math.round(n * 10 ** d) / 10 ** d : null)

/**
 * LOS CONTENIDOS DE TRABAJO. Ecuaciones (1) y (2) del paper.
 *
 * `Ctot = Cof + Cay` y `i = Cof / Cay`, donde i es la relación IDEAL entre oficiales y ayudantes:
 * la cuadrilla en la que cada uno hace sólo lo suyo y nadie espera a nadie. PURA.
 */
export function contenidos({ oficial_h_u, ayudante_h_u } = {}) {
  const of = Number(oficial_h_u)
  const ay = Number(ayudante_h_u)
  if (!Number.isFinite(of) || !Number.isFinite(ay) || of < 0 || ay <= 0) {
    return { ok: false, porQue: 'hacen falta los dos contenidos de trabajo (h/unidad) y el de ayudante no puede ser 0: sin él la relación ideal no existe' }
  }
  return { ok: true, oficial_h_u: of, ayudante_h_u: ay, total_h_u: redondear(of + ay), relacionIdeal: redondear(of / ay) }
}

/**
 * LAS HORAS QUE HAY QUE PONER PARA CONSEGUIR LA PRODUCCIÓN. `TN = P · C`. PURA.
 *
 * Son independientes de la cuadrilla: cambiar la cuadrilla cambia CUÁNDO se termina y CUÁNTO se
 * desperdicia, nunca el trabajo que hay que hacer.
 */
export function horasNecesarias(produccion, cont) {
  const p = Number(produccion)
  if (!Number.isFinite(p) || p < 0 || !cont?.ok) return null
  return {
    produccion: p,
    total_h: redondear(p * cont.total_h_u, 2),
    oficial_h: redondear(p * cont.oficial_h_u, 2),
    ayudante_h: redondear(p * cont.ayudante_h_u, 2),
  }
}

/** El máximo divisor común. PURA. */
const mcd = (a, b) => (b === 0 ? a : mcd(b, a % b))

/**
 * LAS CUADRILLAS BÁSICAS DEL ÁBACO — Figura 1 del paper. PURA.
 *
 * Son las conformaciones (oficiales × ayudantes) que NO son múltiplo entero de otra: [3*2] es
 * básica, [6*4] es dos veces [3*2]. El paper dibuja hasta 7×7 = 49 cruces y circula las básicas.
 * Los múltiplos existen y se pueden usar —terminan antes y cuestan lo mismo por unidad—, por eso
 * `incluirMultiplos` está y no está prendido por defecto: el ábaco original no los circula.
 */
export function cuadrillasBasicas({ max = 7, incluirMultiplos = false } = {}) {
  const salida = []
  for (let of = 1; of <= max; of++) {
    for (let ay = 1; ay <= max; ay++) {
      if (!incluirMultiplos && mcd(of, ay) !== 1) continue
      salida.push({ oficiales: of, ayudantes: ay, relacion: redondear(of / ay) })
    }
  }
  return salida.sort((a, b) => a.relacion - b.relacion || a.oficiales - b.oficiales)
}

/**
 * EVALUAR UNA CUADRILLA CONCRETA. Es el cuerpo de la Tabla 1 del paper, columnas 5 a 16.
 *
 * La clave está en la columna 5: los oficiales y los ayudantes tardan distinto en completar SUS
 * horas, y como la cuadrilla es una unidad que entra y sale junta, manda el que tarda MÁS. El otro
 * está presente y no produce: eso es el desperdicio, y es lo que se paga sin recibir nada. PURA.
 */
export function evaluarCuadrilla({ oficiales, ayudantes }, horas, { jornadaEfectiva_h = JORNADA_PAPER.efectiva_h, relacionSalarial } = {}) {
  if (!horas || !Number.isFinite(relacionSalarial)) return null
  const jOf = horas.oficial_h / (oficiales * jornadaEfectiva_h)
  const jAy = horas.ayudante_h / (ayudantes * jornadaEfectiva_h)
  const jornadas = Math.max(jOf, jAy)
  const horasEjecucion = jornadas * jornadaEfectiva_h
  const dispOf = horasEjecucion * oficiales
  const dispAy = horasEjecucion * ayudantes
  const perdidoOf = dispOf - horas.oficial_h
  const perdidoAy = dispAy - horas.ayudante_h
  return {
    oficiales, ayudantes,
    relacion: redondear(oficiales / ayudantes),
    jornadasOficial: redondear(jOf, 2), jornadasAyudante: redondear(jAy, 2),
    jornadas: redondear(jornadas, 2),
    horasEjecucion: redondear(horasEjecucion, 2),
    disponibleOficial_h: redondear(dispOf, 2), disponibleAyudante_h: redondear(dispAy, 2),
    desperdicioOficial_h: redondear(perdidoOf, 2), desperdicioAyudante_h: redondear(perdidoAy, 2),
    desperdicioOficial_j: redondear(perdidoOf / jornadaEfectiva_h, 2),
    desperdicioAyudante_j: redondear(perdidoAy / jornadaEfectiva_h, 2),
    // Homogeneizado en jornales de ayudante, que es la única forma de comparar dos desperdicios
    // que están medidos en categorías distintas (columna 15 del paper).
    desperdicioEquivalente_j: redondear((perdidoOf / jornadaEfectiva_h) * relacionSalarial + perdidoAy / jornadaEfectiva_h, 2),
    costo_jornalesAyudante: redondear(jornadas * (oficiales * relacionSalarial + ayudantes), 2),
    integrantes: oficiales + ayudantes,
  }
}

/**
 * EL DESPERDICIO HORARIO — ecuaciones (7) y (10) del paper. PURA.
 *
 * Es el mismo hecho que `evaluarCuadrilla` mide acumulado, pero por hora de trabajo de la cuadrilla
 * y en forma cerrada. Sirve como VERIFICACIÓN independiente: `d_horario · horas_ejecución` tiene que
 * dar el desperdicio total. Uno de los dos sale negativo siempre — el negativo no es desperdicio,
 * es holgura, y el paper lo dice con todas las letras.
 */
export function desperdicioHorario({ oficiales, ayudantes }, relacionIdeal) {
  if (!Number.isFinite(relacionIdeal) || relacionIdeal <= 0) return null
  return {
    oficial_h: redondear(oficiales - relacionIdeal * ayudantes),
    ayudante_h: redondear(ayudantes - oficiales / relacionIdeal),
  }
}

/** Cuánto tiene que separarse el costo del primero al del segundo para decir que hay UNA óptima.
 *  Por debajo de esto son dos alternativas equivalentes y la decide quien conoce la obra. */
export const DISTANCIA_COSTO = 0.02

/**
 * LA CUADRILLA ÓPTIMA — y AMBIGUO cuando no la hay.
 *
 * Ordena por costo y, a igual costo, por duración: entre dos que cuestan lo mismo conviene la que
 * libera el frente antes. El desempate final es por cantidad de oficiales, que no es un criterio
 * técnico sino la garantía de que el orden sea TOTAL y la corrida repetible.
 *
 * Y devuelve `AMBIGUO` cuando el segundo queda a menos de `DISTANCIA_COSTO`: el paper es explícito
 * en que el número no agota la decisión —«las características físicas de las viviendas hacen
 * imposible implementar las cuadrillas 8, 3 y 7»—, y forzar un ganador esconde esa conversación.
 */
export function cuadrillaOptima(horas, { jornadaEfectiva_h = JORNADA_PAPER.efectiva_h, relacionSalarial, max = 7, incluirMultiplos = false, maxIntegrantes = null } = {}) {
  if (!horas) return { estado: 'FALTA_DATO', porQue: 'sin horas necesarias no hay cuadrilla que calcular' }
  if (!Number.isFinite(relacionSalarial)) {
    return { estado: 'FALTA_DATO', porQue: 'falta la relación salarial oficial/ayudante — sale de la paritaria UOCRA vigente y no se supone', quienLoTiene: 'administración / liquidación de sueldos' }
  }
  const evaluadas = cuadrillasBasicas({ max, incluirMultiplos })
    .filter((c) => maxIntegrantes === null || c.oficiales + c.ayudantes <= maxIntegrantes)
    .map((c) => evaluarCuadrilla(c, horas, { jornadaEfectiva_h, relacionSalarial }))
    .sort((a, b) => a.costo_jornalesAyudante - b.costo_jornalesAyudante || a.jornadas - b.jornadas || a.oficiales - b.oficiales)

  const top = evaluadas[0]
  const segundo = evaluadas[1]
  if (!top) return { estado: 'FALTA_DATO', porQue: 'ninguna conformación de cuadrilla cumple las restricciones dadas' }
  const empata = segundo && segundo.costo_jornalesAyudante - top.costo_jornalesAyudante < DISTANCIA_COSTO
  return {
    estado: empata ? 'AMBIGUO' : 'ELEGIDA',
    elegida: empata ? null : top,
    ranking: evaluadas.slice(0, 5),
    porQue: empata
      ? `[${top.oficiales}*${top.ayudantes}] y [${segundo.oficiales}*${segundo.ayudantes}] cuestan prácticamente lo mismo (${top.costo_jornalesAyudante} vs ${segundo.costo_jornalesAyudante} jornales de ayudante): la elige quien conoce el frente de trabajo`
      : `[${top.oficiales}*${top.ayudantes}] cuesta ${top.costo_jornalesAyudante} jornales de ayudante y termina en ${top.jornadas} jornadas; la siguiente cuesta ${segundo?.costo_jornalesAyudante ?? '—'}`,
    fuente: 'INVESTIGACION · método Navas, Ridl & Torés (2012)',
  }
}

/**
 * EL PUENTE COMPLETO: una partida con su cantidad y su rendimiento → HH, cuadrilla y duración.
 *
 * Es lo que consume la planificación: `COTIZACIÓN → HH PLAN → CUADRILLA → DURACIÓN`. Devuelve
 * siempre la misma forma, y cuando falta un dato devuelve el hueco con nombre en vez de un número.
 */
export function planDeMano({ cantidad, unidad = null, oficial_h_u, ayudante_h_u, relacionSalarial, jornadaEfectiva_h = JORNADA_PAPER.efectiva_h, maxIntegrantes = null } = {}) {
  const cont = contenidos({ oficial_h_u, ayudante_h_u })
  if (!cont.ok) return { estado: 'FALTA_DATO', porQue: cont.porQue, quienLoTiene: 'Base Maestra (análisis de precios) o rendimiento histórico de ECSAS' }
  const horas = horasNecesarias(cantidad, cont)
  if (!horas) return { estado: 'FALTA_DATO', porQue: 'sin cantidad computada no hay horas que repartir', quienLoTiene: 'el cómputo' }
  const optima = cuadrillaOptima(horas, { jornadaEfectiva_h, relacionSalarial, maxIntegrantes })
  return {
    estado: optima.estado, unidad, contenidos: cont, horas,
    relacionIdeal: cont.relacionIdeal,
    cuadrilla: optima.elegida ?? null,
    duracion_jornadas: optima.elegida?.jornadas ?? null,
    ranking: optima.ranking ?? [],
    porQue: optima.porQue,
    fuente: optima.fuente ?? null,
  }
}

/** Cómo se escribe una categoría de mano de obra en los análisis. El «medio oficial» cuenta como
 *  oficial: en la práctica de obra hace tarea propia de oficial, que es lo que mide el método. */
const CATEGORIA = Object.freeze([
  ['oficial', /oficial|especializad|medio\s*oficial|\bmo\b\s*oficial/i],
  ['ayudante', /ayudante|peon|peón|\bpe[oó]n\b/i],
])

/**
 * LOS CONTENIDOS DE TRABAJO SACADOS DE UNA COMPOSICIÓN DE LA BASE MAESTRA. PURA.
 *
 * Un análisis de precios ya tiene las HH por unidad separadas por categoría: son exactamente Cof y
 * Cay. Lo que faltaba era leerlas como tales. Las líneas que no son mano de obra se ignoran, y las
 * que son mano de obra sin categoría reconocible salen listadas: un «MO varios» que se traga las
 * horas de las dos categorías rompe la relación ideal y hay que verlo, no promediarlo.
 */
export function contenidosDesdeComposicion(lineas = []) {
  let oficial = 0
  let ayudante = 0
  const sinCategoria = []
  for (const l of lineas) {
    if (String(l?.tipo ?? '').toLowerCase() !== 'mano_obra') continue
    const cat = CATEGORIA.find(([, re]) => re.test(String(l?.nombre ?? '')))?.[0]
    if (cat === 'oficial') oficial += Number(l.cantidad) || 0
    else if (cat === 'ayudante') ayudante += Number(l.cantidad) || 0
    else sinCategoria.push({ nombre: l?.nombre ?? null, cantidad: Number(l?.cantidad) || 0 })
  }
  return { oficial_h_u: redondear(oficial), ayudante_h_u: redondear(ayudante), sinCategoria }
}
