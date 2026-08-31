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
  // `Number(null)` es 0 y `Number('')` también: sin este control, una cantidad AUSENTE producía
  // «0 horas», que es un número y no un hueco. Es exactamente la forma en que una cotización
  // incompleta se disfraza de completa.
  if (produccion === null || produccion === undefined || produccion === '') return null
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
 * básica, [6*4] es dos veces [3*2]. El paper dibuja hasta 7×7 = 49 cruces y circula las 35 básicas
 * (los pares con máximo común divisor 1).
 *
 * LOS MÚLTIPLOS ENTRAN POR DEFECTO, y eso lo dice la fuente: la nota de la Tabla 2 del paper es
 * explícita —«en las cuadrillas a seleccionar, también deben tenerse en cuenta las que son
 * múltiplos enteros de las cuadrillas básicas»— y su propia conclusión termina recomendando la
 * cuadrilla 9 [4*2], que es un múltiplo. Excluirlos hacía imposible reproducir el cierre del paper.
 * Un múltiplo cuesta EXACTAMENTE lo mismo por unidad producida y termina k veces antes: lo que
 * decide si conviene no es el costo, es si el frente de trabajo admite a toda esa gente junta —y
 * para eso está `maxIntegrantes`.
 */
export function cuadrillasBasicas({ max = 7, incluirMultiplos = true } = {}) {
  const salida = []
  for (let of = 1; of <= max; of++) {
    for (let ay = 1; ay <= max; ay++) {
      const k = mcd(of, ay)
      if (!incluirMultiplos && k !== 1) continue
      salida.push({
        oficiales: of, ayudantes: ay, relacion: redondear(of / ay),
        // De qué cuadrilla básica es múltiplo, y cuántas veces. `frentes: 2` no es «otra cuadrilla»:
        // es LA MISMA trabajando en dos frentes a la vez, que es como el paper cierra su ejemplo
        // («la cuadrilla 9 [4*2], o sea 2 cuadrillas [2*1] independientes una de otra»).
        base: { oficiales: of / k, ayudantes: ay / k },
        frentes: k,
      })
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
export function evaluarCuadrilla({ oficiales, ayudantes, base = null, frentes = null }, horas, { jornadaEfectiva_h = JORNADA_PAPER.efectiva_h, relacionSalarial } = {}) {
  if (!horas || !Number.isFinite(relacionSalarial)) return null
  const jOf = horas.oficial_h / (oficiales * jornadaEfectiva_h)
  const jAy = horas.ayudante_h / (ayudantes * jornadaEfectiva_h)
  const jornadas = Math.max(jOf, jAy)
  const horasEjecucion = jornadas * jornadaEfectiva_h
  const dispOf = horasEjecucion * oficiales
  const dispAy = horasEjecucion * ayudantes
  const perdidoOf = dispOf - horas.oficial_h
  const perdidoAy = dispAy - horas.ayudante_h
  const k = frentes ?? mcd(oficiales, ayudantes)
  return {
    oficiales, ayudantes,
    base: base ?? { oficiales: oficiales / k, ayudantes: ayudantes / k },
    frentes: k,
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
export function cuadrillaOptima(horas, { jornadaEfectiva_h = JORNADA_PAPER.efectiva_h, relacionSalarial, max = 7, incluirMultiplos = true, maxIntegrantes = null } = {}) {
  if (!horas) return { estado: 'FALTA_DATO', porQue: 'sin horas necesarias no hay cuadrilla que calcular' }
  if (!Number.isFinite(relacionSalarial)) {
    return { estado: 'FALTA_DATO', porQue: 'falta la relación salarial oficial/ayudante — sale de la paritaria UOCRA vigente y no se supone', quienLoTiene: 'administración / liquidación de sueldos' }
  }
  const evaluadas = cuadrillasBasicas({ max, incluirMultiplos })
    .filter((c) => maxIntegrantes === null || c.oficiales + c.ayudantes <= maxIntegrantes)
    .map((c) => evaluarCuadrilla(c, horas, { jornadaEfectiva_h, relacionSalarial }))
    // ═══ EL DESEMPATE NO ES POR DURACIÓN ═══
    //
    // Un múltiplo cuesta EXACTAMENTE lo mismo por construcción y termina k veces antes. Desempatar
    // por duración, entonces, elige SIEMPRE el múltiplo más grande que entre en el ábaco: con
    // Cof=Cay=0,50 y 100 m² devolvía [7*7] —CATORCE personas— donde la composición es [1*1]. Eso no
    // sale del método: el paper dice que los múltiplos ENTRAN A LA SELECCIÓN, nunca que se elija el
    // mayor, y su propia conclusión descarta las cuadrillas más rápidas porque «las características
    // físicas de las viviendas hacen imposible su implementación».
    //
    // A igual costo gana la composición BÁSICA, que es la respuesta del método. Cuántos frentes
    // paralelos abrir es una decisión de obra —¿entra esa gente junta?— y se contesta con
    // `maxIntegrantes` o mirando `frentesPosibles`, no adivinando.
    .sort((a, b) => a.costo_jornalesAyudante - b.costo_jornalesAyudante || a.frentes - b.frentes || a.oficiales - b.oficiales)

  const top = evaluadas[0]
  if (!top) return { estado: 'FALTA_DATO', porQue: 'ninguna conformación de cuadrilla cumple las restricciones dadas' }
  // Los múltiplos de la elegida, con lo único que los diferencia: cuánta gente y cuántos días.
  const frentesPosibles = evaluadas
    .filter((c) => c.oficiales * top.ayudantes === top.oficiales * c.ayudantes && c.frentes !== top.frentes)
    .map((c) => ({ frentes: c.frentes, oficiales: c.oficiales, ayudantes: c.ayudantes, integrantes: c.integrantes, jornadas: c.jornadas }))
    .sort((a, b) => a.frentes - b.frentes)

  // El primer competidor REAL. Una cuadrilla y su propio múltiplo no son dos alternativas: son la
  // misma composición trabajando en k frentes, cuestan lo mismo por construcción y elegir entre
  // ellas es decidir cuántos frentes se abren, no qué cuadrilla se arma. Declararlo AMBIGUO ahí
  // sería inventar una duda que el método no tiene.
  const mismaComposicion = (a, b) => a.oficiales * b.ayudantes === b.oficiales * a.ayudantes
  const segundo = evaluadas.slice(1).find((c) => !mismaComposicion(top, c)) ?? null
  const empata = segundo && segundo.costo_jornalesAyudante - top.costo_jornalesAyudante < DISTANCIA_COSTO
  return {
    estado: empata ? 'AMBIGUO' : 'ELEGIDA',
    elegida: empata ? null : top,
    ranking: evaluadas.slice(0, 5),
    frentesPosibles,
    porQue: empata
      ? `[${top.oficiales}*${top.ayudantes}] y [${segundo.oficiales}*${segundo.ayudantes}] cuestan prácticamente lo mismo (${top.costo_jornalesAyudante} vs ${segundo.costo_jornalesAyudante} jornales de ayudante): la elige quien conoce el frente de trabajo`
      : `[${top.oficiales}*${top.ayudantes}] cuesta ${top.costo_jornalesAyudante} jornales de ayudante y termina en ${top.jornadas} jornadas; la siguiente composición distinta cuesta ${segundo?.costo_jornalesAyudante ?? '—'}`
        + (frentesPosibles.length ? ` · abrir ${frentesPosibles.map((f) => `${f.frentes} frentes (${f.integrantes} personas, ${f.jornadas} J)`).join(' o ')} cuesta lo mismo y termina antes: lo decide quien sabe si esa gente entra junta` : ''),
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

// ══════════════════════════════════════════════════════════════════════════════════════════════
// LA CUADRILLA QUE **SE OBSERVÓ**, QUE NO ES LA QUE EL MÉTODO CALCULA
// ══════════════════════════════════════════════════════════════════════════════════════════════
//
// Todo lo de arriba responde «¿con qué cuadrilla CONVIENE hacerlo?». Esto responde otra pregunta,
// y es la que la Base Maestra tiene vacía en las 205 tareas: «¿con qué cuadrilla SE MIDIÓ el
// rendimiento que estamos usando para cotizar?». Sin esa respuesta las HH por unidad no se pueden
// convertir en producción diaria y el plazo sale de una división a ojo.
//
// ═══ LAS TRES MAGNITUDES QUE NO SON LA MISMA, Y QUE ACÁ SE CONFUNDEN SIEMPRE ═══
//
//   HH        esfuerzo total. 256 HH.
//   PERSONAS  cuántos estaban. 4.
//   DURACIÓN  cuántos días. 8.
//
// Las tres viven en la misma fila de una planilla de obra y ninguna se deduce de las otras dos sin
// la jornada. Y —lo importante— **una cuadrilla no es un número de personas: es una composición
// por categoría**. «4 personas» no dice si son 2 oficiales y 2 ayudantes o 1 y 3, y esas dos
// cuadrillas producen distinto y cuestan distinto. Por eso una observación que sólo trae `personas`
// NO alcanza para declarar cuadrilla: se descarta con nombre, no se reparte a ojo.
//
// ═══ POR QUÉ [2*4] Y [1*2] SON LA MISMA RESPUESTA ═══
//
// Es la misma aritmética del ábaco de más arriba: [2 of * 4 ay] es [1 of * 2 ay] trabajando en dos
// frentes. Cuestan lo mismo por unidad producida y terminan a distinta velocidad. Cuando dos
// observaciones de la misma tarea reducen a la misma composición básica, NO están en conflicto:
// coinciden en lo único que el estándar tiene que declarar —la receta de gente— y difieren en
// cuántos frentes se abrieron, que es una decisión de obra y no un atributo de la tarea.
//
// Cuando NO reducen a la misma base —[2*2] y [4*2]— sí están en conflicto, y entonces no hay
// cuadrilla que declarar. Promediarlas daría un número que nadie observó nunca.

/** Reduce una composición por el máximo común divisor de sus cantidades: `{of:2, ay:4}` → `{of:1,
 *  ay:2}` con 2 frentes. Devuelve `null` si alguna cantidad no es un entero positivo — media
 *  persona no es una cuadrilla, es un promedio de otra cosa. PURA. */
export function reducirCuadrilla(composicion) {
  const pares = Object.entries(composicion ?? {})
    .map(([cat, n]) => [cat, Number(n)])
    .filter(([, n]) => n > 0)
  if (!pares.length) return null
  if (pares.some(([, n]) => !Number.isInteger(n))) return null
  const k = pares.map(([, n]) => n).reduce((x, y) => mcd(x, y))
  return {
    base: Object.fromEntries(pares.map(([cat, n]) => [cat, n / k]).sort((a, b) => (a[0] < b[0] ? -1 : 1))),
    frentes: k,
    personas: pares.reduce((s, [, n]) => s + n, 0),
  }
}

const mismaBase = (a, b) => JSON.stringify(a) === JSON.stringify(b)

/**
 * LA CUADRILLA DE UNA TAREA A PARTIR DE LAS OBSERVACIONES REALES. PURA.
 *
 * @param observaciones `[{ composicion: {oficial: 2, ayudante: 2}, personas, fuente, ... }]`
 * @returns `{estado, composicion, frentes, personas, porQue, usadas, descartadas}`
 *
 * `estado` es uno de:
 *   UNICA      una sola observación utilizable — se declara TAL COMO SE OBSERVÓ
 *   CONVERGE   varias, y todas reducen a la misma composición básica — se declara la BASE
 *   CONFLICTO  varias que no reducen a la misma base — NO se declara nada
 *   SIN_DATO   ninguna observación trae composición por categoría
 *
 * Nunca devuelve una composición inventada, y `SIN_DATO` NO es «cuadrilla de cero personas».
 */
export function cuadrillaDesdeObservaciones(observaciones = []) {
  const usadas = []
  const descartadas = []
  for (const o of observaciones) {
    const r = reducirCuadrilla(o?.composicion)
    if (!r) {
      descartadas.push({
        fuente: o?.fuente ?? null,
        porQue: o?.personas
          ? `la observación dice ${o.personas} personas y no dice de qué categoría: un número de gente no es una cuadrilla`
          : 'la observación no trae composición por categoría',
      })
      continue
    }
    usadas.push({ ...r, observado: o.composicion, fuente: o?.fuente ?? null, cantidad: o?.cantidad ?? null, hh: o?.hh ?? null })
  }

  if (!usadas.length) {
    return { estado: 'SIN_DATO', composicion: null, frentes: null, personas: null, usadas, descartadas,
      porQue: descartadas.length
        ? `hay ${descartadas.length} observación(es) y ninguna declara categorías: ${descartadas[0].porQue}`
        : 'no hay ninguna observación de cuadrilla para esta tarea' }
  }

  if (usadas.length === 1) {
    const u = usadas[0]
    return { estado: 'UNICA', composicion: u.observado, frentes: u.frentes, personas: u.personas, usadas, descartadas,
      porQue: `una sola observación real (${u.fuente ?? 'sin fuente declarada'}): se declara tal como se observó, sin reducirla` }
  }

  const primera = usadas[0].base
  if (usadas.every((u) => mismaBase(u.base, primera))) {
    const personas = Object.values(primera).reduce((s, n) => s + n, 0)
    return { estado: 'CONVERGE', composicion: primera, frentes: 1, personas, usadas, descartadas,
      porQue: `${usadas.length} observaciones que reducen a la misma composición ${JSON.stringify(primera)}: `
        + `difieren en cuántos frentes se abrieron (${usadas.map((u) => u.frentes).join(', ')}), que lo decide la obra y no la tarea` }
  }

  return { estado: 'CONFLICTO', composicion: null, frentes: null, personas: null, usadas, descartadas,
    porQue: `${usadas.length} observaciones con composiciones que no reducen a la misma base `
      + `(${usadas.map((u) => JSON.stringify(u.observado)).join(' vs ')}): promediarlas daría una cuadrilla que nadie usó nunca` }
}

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
