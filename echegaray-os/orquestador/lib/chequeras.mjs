// PADRÓN DE CHEQUERAS — LA CAPACIDAD QUE ENCUENTRA EL CHEQUE QUE FALTA.
//
// LA PREGUNTA (23/07). Aparecieron dos CPD firmados sin beneficiario. Si desaparece un cheque de una
// chequera todavía en uso, ¿el OS se entera? Hoy no: la correlatividad se mira contra lo ya cargado,
// no contra un padrón. Esta capacidad cierra ese gap. Dada la lista de números USADOS (de 'Cheques
// Emitidos') y el rango de una chequera, devuelve los HUECOS (números del rango que nadie registró) y
// los FUERA DE RANGO (números registrados que no caen en ninguna chequera conocida).
//
// PATRÓN DEL OS: determinística (0 API), pura, con veredicto hallazgo/ok/no_verificable — el mismo de
// las otras capacidades. Un hueco NO es una acusación: es una pregunta. "El cheque X de la chequera Y
// no está registrado como usado — verificar" (puede ser anulado, de otra chequera, o un faltante real).
//
// DOS TRAMPAS QUE GOBIERNAN TODO ESTE ARCHIVO:
//   1. El número puede venir como texto ('00000327') o número (327): se normaliza SIEMPRE antes de
//      comparar. '00000327' y 327 son el mismo cheque.
//   2. Común y CPD (y sobre todo cheque FÍSICO vs ECHEQ) son series DISTINTAS con numeraciones que se
//      solapan. En la cuenta real, los FISICO y los ECHEQ del registro comparten números (174–363) y
//      no son el mismo universo: un echeq no sale de una chequera de papel. Mezclarlos en un solo
//      rango inventa decenas de huecos falsos. Por eso el padrón audita SÓLO cheques físicos, y cada
//      chequera se audita contra SU rango, nunca contra el total.

/**
 * Normaliza un número de cheque para poder compararlo, venga como texto o número.
 * '00000327' -> 327 · 327 -> 327 · ' 062 ' -> 62 · '' / 'VARIAS' / null -> null.
 * Devuelve un entero, o null si no hay un número de cheque adentro.
 */
export function normalizarNumero(x) {
  if (x === null || x === undefined) return null
  const s = String(x).trim()
  if (!/^\d+$/.test(s)) return null // sólo dígitos: un 'VARIAS' o un vacío NO es un número de cheque
  const n = Number(s)
  return Number.isSafeInteger(n) ? n : null
}

/**
 * Números que aparecen MÁS DE UNA VEZ en el registro. Un número de cheque no puede pertenecer a dos
 * cheques: un duplicado es un error de carga o dos cheques con el mismo número mal tipeado — hallazgo.
 * @param {Array<number|string>} numeros
 * @returns {Array<{numero:number, veces:number}>} ordenado por número
 */
export function detectarDuplicados(numeros = []) {
  const cuenta = new Map()
  for (const raw of numeros) {
    const n = normalizarNumero(raw)
    if (n === null) continue
    cuenta.set(n, (cuenta.get(n) ?? 0) + 1)
  }
  return [...cuenta.entries()]
    .filter(([, v]) => v > 1)
    .map(([numero, veces]) => ({ numero, veces }))
    .sort((a, b) => a.numero - b.numero)
}

/**
 * Parte una lista de números en RACHAS contiguas: cada corte ocurre cuando el salto al siguiente
 * supera `maxBrecha`. Sirve para separar chequeras distintas dentro de la misma serie física sin
 * inventar límites: 193..225 y 310..328 son dos rachas (el salto 225->310 es enorme), y adentro de
 * cada una un hueco chico (317, 323) es un faltante candidato, no una frontera entre chequeras.
 * @param {Array<number|string>} numeros
 * @param {number} maxBrecha salto máximo que se considera "misma racha" (default 5)
 * @returns {Array<{desde:number, hasta:number, presentes:number[]}>}
 */
export function segmentarEnRachas(numeros = [], maxBrecha = 5) {
  const orden = [...new Set(numeros.map(normalizarNumero).filter((n) => n !== null))].sort((a, b) => a - b)
  const rachas = []
  let actual = null
  for (const n of orden) {
    if (!actual || n - actual.hasta > maxBrecha) {
      actual = { desde: n, hasta: n, presentes: [n] }
      rachas.push(actual)
    } else {
      actual.hasta = n
      actual.presentes.push(n)
    }
  }
  return rachas
}

/**
 * NÚCLEO PURO: audita una lista de números usados contra un rango [desde, hasta].
 * @param {Array<number|string>} numerosUsados
 * @param {number} desde
 * @param {number} hasta
 * @returns {{huecos:number[], fuera_de_rango:number[], usados_en_rango:number[], total_rango:number, cobertura:number}}
 */
export function auditarRango(numerosUsados = [], desde, hasta) {
  const usados = new Set(numerosUsados.map(normalizarNumero).filter((n) => n !== null))
  const huecos = []
  const usadosEnRango = []
  for (let n = desde; n <= hasta; n++) {
    if (usados.has(n)) usadosEnRango.push(n)
    else huecos.push(n)
  }
  const fuera = [...usados].filter((n) => n < desde || n > hasta).sort((a, b) => a - b)
  const total = hasta - desde + 1
  return {
    huecos,
    fuera_de_rango: fuera,
    usados_en_rango: usadosEnRango,
    total_rango: total,
    cobertura: total > 0 ? usadosEnRango.length / total : 0,
  }
}

/**
 * Infiere un rango de trabajo para una chequera de rango DESCONOCIDO, a partir de sus anclas (los
 * números vistos de verdad) y de la serie física. Toma la RACHA contigua que contiene las anclas: es
 * lo más lejos que se puede afirmar sin inventar. Devuelve null si las anclas no caen en ninguna racha
 * (no hay de dónde inferir). El resultado SIEMPRE se etiqueta INFERIDO por quien lo consume.
 * @param {number[]} anclas números conocidos de la chequera
 * @param {Array<number|string>} serieFisica todos los números físicos usados de la cuenta
 * @param {number} maxBrecha
 * @returns {{desde:number, hasta:number}|null}
 */
export function inferirRango(anclas = [], serieFisica = [], maxBrecha = 5) {
  const anclasN = anclas.map(normalizarNumero).filter((n) => n !== null)
  if (anclasN.length === 0) return null
  // Las anclas pueden no estar en el registro (p.ej. un cheque en blanco): se suman a la serie para
  // que la racha las incluya y el rango inferido no las deje afuera.
  const rachas = segmentarEnRachas([...serieFisica, ...anclasN], maxBrecha)
  const cont = rachas.find((r) => anclasN.every((a) => a >= r.desde && a <= r.hasta))
    // si una sola racha contiene TODAS las anclas, ésa; si no, la que contiene el ancla más alta
    || rachas.find((r) => anclasN.some((a) => a >= r.desde && a <= r.hasta))
  return cont ? { desde: cont.desde, hasta: cont.hasta } : null
}

/**
 * Veredicto de UNA chequera contra la serie física de la cuenta.
 * - rango REAL/INFERIDO conocido -> audita huecos y fuera de rango.
 * - rango DESCONOCIDO con anclas -> INFIERE el rango de la serie y audita, etiquetando INFERIDO.
 * - rango DESCONOCIDO sin forma de inferir -> no_verificable.
 * @param {{identificador:string, tipo:string, numero_desde?:number|null, numero_hasta?:number|null,
 *          rango_confianza?:string, numeros_conocidos?:number[]}} chequera
 * @param {Array<number|string>} serieFisica números físicos usados de la cuenta (de Cheques Emitidos)
 * @param {number} maxBrecha
 * @returns {object} veredicto
 */
export function auditarChequera(chequera, serieFisica = [], maxBrecha = 5) {
  const anclas = (chequera.numeros_conocidos ?? []).map(normalizarNumero).filter((n) => n !== null)
  let desde = normalizarNumero(chequera.numero_desde)
  let hasta = normalizarNumero(chequera.numero_hasta)
  let confianza = chequera.rango_confianza ?? (desde !== null && hasta !== null ? 'REAL' : 'DESCONOCIDO')

  if (desde === null || hasta === null) {
    const inf = inferirRango(anclas, serieFisica, maxBrecha)
    if (!inf) {
      return {
        identificador: chequera.identificador,
        tipo: chequera.tipo,
        veredicto: 'no_verificable',
        rango_confianza: 'DESCONOCIDO',
        motivo: anclas.length
          ? 'No hay cheques físicos registrados cerca de las anclas: no se puede inferir el rango ni auditar huecos.'
          : 'Sin rango y sin números conocidos: nada contra qué auditar.',
        anclas,
        usados_en_rango: [],
        huecos: [],
        fuera_de_rango: [],
      }
    }
    desde = inf.desde
    hasta = inf.hasta
    confianza = 'INFERIDO'
  }

  const r = auditarRango(serieFisica, desde, hasta)
  // Si en el rango no cae NINGÚN cheque registrado, no hay secuencia usada que auditar: no se puede
  // hablar de "hueco". Es el caso de la chequera común de la que sólo se vio un cheque en blanco (el
  // 62): marcar el 62 como faltante sería un hallazgo falso. no_verificable, no ok ni hallazgo.
  if (r.usados_en_rango.length === 0) {
    return {
      identificador: chequera.identificador,
      tipo: chequera.tipo,
      veredicto: 'no_verificable',
      rango_confianza: confianza,
      numero_desde: desde,
      numero_hasta: hasta,
      anclas,
      motivo: 'Ningún cheque registrado cae en el rango: no hay secuencia usada contra la cual medir huecos.',
      usados_en_rango: [],
      huecos: [],
    }
  }
  // "fuera de rango" del padrón se calcula a nivel padrón (un número puede ser de OTRA chequera), no
  // acá: acá sólo importan los huecos DENTRO del rango de esta chequera. Se reporta el fuera de rango
  // como informativo por si el rango es inferido y quedó corto.
  const veredicto = r.huecos.length > 0 ? 'hallazgo' : 'ok'
  return {
    identificador: chequera.identificador,
    tipo: chequera.tipo,
    veredicto,
    rango_confianza: confianza,
    numero_desde: desde,
    numero_hasta: hasta,
    anclas,
    usados_en_rango: r.usados_en_rango,
    huecos: r.huecos,
    cobertura: r.cobertura,
  }
}

/**
 * INFORME COMPLETO DEL PADRÓN. Cruza las chequeras conocidas contra la serie física del registro y
 * reparte cada número usado: o cae en una chequera conocida, o queda "sin chequera asignada" (serie
 * física que existe pero cuya chequera nadie identificó todavía — el dato que falta para poder
 * detectar un faltante ahí).
 * @param {Array} chequeras filas del padrón
 * @param {Array<{tipo:string, numero:number|string}>} registro filas de Cheques Emitidos
 * @param {number} maxBrecha
 * @returns {object}
 */
export function auditarPadron(chequeras = [], registro = [], maxBrecha = 5) {
  // SÓLO cheques físicos: un echeq no sale de una chequera de papel y su numeración es otro universo.
  const fisicos = registro
    .filter((r) => String(r.tipo ?? '').trim().toUpperCase() === 'FISICO')
    .map((r) => normalizarNumero(r.numero))
    .filter((n) => n !== null)

  const duplicados = detectarDuplicados(
    registro
      .filter((r) => String(r.tipo ?? '').trim().toUpperCase() === 'FISICO')
      .map((r) => r.numero),
  )

  const porChequera = chequeras.map((c) => auditarChequera(c, fisicos, maxBrecha))

  // Números físicos que NO caen en ninguna chequera conocida (real, inferida o DESCONOCIDA). Se
  // reparten en rachas para mostrarlos como bloques legibles, no como una lista de 33 números.
  const cubiertos = new Set()
  for (const v of porChequera) {
    if (v.numero_desde == null || v.numero_hasta == null) continue
    for (let n = v.numero_desde; n <= v.numero_hasta; n++) cubiertos.add(n)
  }
  const sinAsignar = [...new Set(fisicos)].filter((n) => !cubiertos.has(n)).sort((a, b) => a - b)
  const bloquesSinAsignar = segmentarEnRachas(sinAsignar, maxBrecha).map((r) => ({
    desde: r.desde,
    hasta: r.hasta,
    cantidad: r.presentes.length,
    huecos_internos: (() => {
      const set = new Set(r.presentes)
      const h = []
      for (let n = r.desde; n <= r.hasta; n++) if (!set.has(n)) h.push(n)
      return h
    })(),
  }))

  return {
    total_fisicos: fisicos.length,
    fisicos_distintos: new Set(fisicos).size,
    duplicados,
    por_chequera: porChequera,
    sin_chequera_asignada: bloquesSinAsignar,
  }
}
