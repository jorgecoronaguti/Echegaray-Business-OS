// LA DISTRIBUCIÓN DE UN RENDIMIENTO, Y LAS HH QUE SALEN DE ELLA. Puro, determinístico, sin modelo.
//
// ═══ POR QUÉ UN NÚMERO SOLO MIENTE ═══
//
// `rendimientoParaCotizar` devuelve la mediana de los casos, que es el estadístico correcto para
// RECOMENDAR. Pero una mediana de 1,6 h/m² calculada sobre tres obras que dieron 0,9, 1,6 y 4,2 no
// es el mismo hecho que una mediana de 1,6 sobre 1,55, 1,60 y 1,63 — y hoy las dos se ven iguales.
// La primera dice «no sabemos hacer esta tarea de forma repetible»; la segunda dice «la tenemos
// dominada». Cotizar las dos con 1,6 es correcto en un caso y temerario en el otro.
//
// Por eso acá el rendimiento no es un número: es `n`, media, mediana, rango y dispersión. Quien
// cotiza decide con el rango, no con el punto —y el rango es exactamente lo que le permite poner un
// margen distinto donde la empresa es errática—.
//
// ═══ SIN_DATO NO ES CERO Y NO ES UN NÚMERO CHICO ═══
//
// La tentación cuando falta el rendimiento de una tarea es tomar el de la tarea parecida, o el
// promedio del rubro, o el del análisis de la planilla. Las tres cosas producen un número que se ve
// igual que uno medido y no lo es. Acá falta se dice `SIN_DATO`, con quién lo tiene, y el HH que
// sale es `null`. Una cotización con huecos declarados se puede cerrar preguntando; una con huecos
// tapados se cierra sola y se rompe en la obra.
//
// ═══ HH ≠ PERSONAS ≠ DURACIÓN ═══
//
// Las tres cosas se miden en unidades distintas y este módulo devuelve UNA sola: las horas-hombre.
// «400 HH» no es «10 personas» ni «5 días»: 400 HH son 10 personas 5 días, o 2 personas 25 días, o
// 50 personas un día si el frente lo admite. La conversión a cuadrilla y a duración la hace
// `plano/cuadrilla.mjs` con el método del paper, necesita datos que acá no están (la relación
// salarial vigente, el máximo de gente que entra en el frente) y **no se puede hacer dividiendo**.
// Por eso `personas` y `duracion_jornadas` salen `null` con el motivo escrito en vez de no salir:
// un campo ausente se llena de cualquier cosa, uno presente y nulo obliga a preguntar por qué.

import { rendimientoParaCotizar, mediana } from './rendimiento-para-cotizar.mjs'

/** El resultado de intentar afirmar un rendimiento. */
export const LECTURA = Object.freeze({
  EXPERIENCIA_ECSAS: 'EXPERIENCIA_ECSAS', // medido en obras nuestras, con n casos
  REFERENCIA_ANALISIS: 'REFERENCIA_ANALISIS', // el análisis de la planilla — sirve, no es experiencia
  SIN_DATO: 'SIN_DATO',                   // no hay. NO es 0 y NO es el de la tarea de al lado
})

// El descarte explícito de `null`, `undefined` y `''` NO es defensivo de más: `Number(null)` es 0 y
// `Number('')` también. Sin esta línea, «no hay rendimiento medido» se convierte en «0 h/unidad», que
// es un número, se multiplica por la cantidad y publica 0 HH — la afirmación de que la tarea no
// lleva trabajo. Lo agarró el test de SIN_DATO ≠ 0 sobre este mismo archivo.
const num = (x) => {
  if (x === null || x === undefined || x === '') return null
  const n = Number(x)
  return Number.isFinite(n) ? n : null
}
const redondear = (n, d = 4) => (n === null ? null : Math.round(n * 10 ** d) / 10 ** d)

/**
 * LA DISTRIBUCIÓN DE UNA MUESTRA. PURA.
 *
 * Con `n = 1` el desvío y el coeficiente de variación salen `null` y NO `0`: un solo caso no tiene
 * dispersión cero, no tiene dispersión medida. Publicar 0 ahí diría «esta tarea es perfectamente
 * repetible» apoyándose en una sola observación, que es la afirmación exactamente opuesta a la que
 * los datos permiten.
 */
export function distribucion(valores = []) {
  const v = valores.map(num).filter((x) => x !== null).sort((a, b) => a - b)
  if (!v.length) return Object.freeze({ n: 0, media: null, mediana: null, min: null, max: null, desvio: null, cv: null, rango: null })
  const media = v.reduce((a, b) => a + b, 0) / v.length
  const med = mediana(v)
  // Desvío muestral (n−1): con n casos de una empresa se estima la variabilidad del proceso, no se
  // describe una población cerrada. Con n=1 el denominador es 0 y el resultado es `null`, que es
  // exactamente lo que corresponde decir.
  const desvio = v.length > 1
    ? Math.sqrt(v.reduce((a, x) => a + (x - media) ** 2, 0) / (v.length - 1))
    : null
  return Object.freeze({
    n: v.length,
    media: redondear(media),
    mediana: redondear(med),
    min: v[0],
    max: v[v.length - 1],
    desvio: redondear(desvio),
    cv: desvio !== null && media !== 0 ? redondear(desvio / media, 3) : null,
    rango: redondear(v[v.length - 1] - v[0]),
  })
}

/** Cuánta dispersión ya es demasiada para cotizar con el punto en vez del rango. Es un coeficiente
 *  de variación del 25 %: por encima de eso la mediana deja de representar a la muestra y lo que hay
 *  que mostrar es el rango entero. No es una constante de la industria — es el corte a partir del
 *  cual esta empresa quiere ver la conversación, y se cambia acá. */
export const CV_QUE_OBLIGA_A_MOSTRAR_EL_RANGO = 0.25

/**
 * EL RENDIMIENTO DE UNA TAREA COMO DISTRIBUCIÓN, NO COMO NÚMERO. PURA.
 *
 * `filas` son las de `rendimiento_historico` ({hsUnitarias, estado, confianza, obraId}). `hsAnalisis`
 * es lo que dice el análisis vigente de la Base Maestra.
 *
 * La decisión de CUÁL se recomienda no se rehace acá: la toma `rendimientoParaCotizar`, que ya la
 * tiene escrita con su regla («nada se reemplaza en silencio»). Este módulo le agrega la forma de
 * la muestra, que es lo que faltaba.
 */
export function rendimientoConDistribucion(filas = [], { hsAnalisis = null } = {}) {
  const decision = rendimientoParaCotizar(filas)
  const reales = filas.filter((f) => ['VALIDADO', 'CANDIDATO'].includes(f.estado) && num(f.hsUnitarias) !== null)
  const dist = distribucion(reales.map((f) => f.hsUnitarias))
  const obras = [...new Set(reales.map((f) => f.obraId).filter(Boolean))]

  if (decision.recomendado === 'experiencia') {
    const disperso = dist.cv !== null && dist.cv > CV_QUE_OBLIGA_A_MOSTRAR_EL_RANGO
    return Object.freeze({
      lectura: LECTURA.EXPERIENCIA_ECSAS,
      hsUnitarias: decision.experiencia.hsUnitarias,
      distribucion: dist,
      obras: Object.freeze(obras),
      // Cuando la muestra está dispersa, el número que se recomienda sigue siendo la mediana pero
      // se declara que no representa: quien cotiza tiene que ver el rango antes de firmar.
      usarElRango: disperso,
      porQue: disperso
        ? `${dist.n} caso(s) en ${obras.length} obra(s), pero van de ${dist.min} a ${dist.max} h/u (CV ${dist.cv}): la mediana ${dist.mediana} no representa a la muestra — cotizar con el rango`
        : `${decision.porQue} — ${dist.n} caso(s), mediana ${dist.mediana} h/u${dist.cv !== null ? `, CV ${dist.cv}` : ''}`,
      referencia: decision.referencia,
      desvioPct: decision.desvioPct === null ? null : redondear(decision.desvioPct, 1),
    })
  }

  const ref = decision.referencia?.hsUnitarias ?? num(hsAnalisis)
  if (ref !== null && ref !== undefined) {
    return Object.freeze({
      lectura: LECTURA.REFERENCIA_ANALISIS,
      hsUnitarias: ref,
      distribucion: dist,
      obras: Object.freeze(obras),
      usarElRango: false,
      porQue: dist.n
        ? `${decision.porQue} — el análisis dice ${ref} h/u y la experiencia propia va por ${dist.mediana} h/u con ${dist.n} caso(s): se muestra, no se aplica`
        : `${decision.porQue} — el análisis de la Base Maestra dice ${ref} h/u y no hay ejecución real medida`,
      referencia: decision.referencia,
      desvioPct: decision.desvioPct === null ? null : redondear(decision.desvioPct, 1),
    })
  }

  return Object.freeze({
    lectura: LECTURA.SIN_DATO,
    hsUnitarias: null,
    distribucion: dist,
    obras: Object.freeze(obras),
    usarElRango: false,
    porQue: 'no hay rendimiento medido ni análisis para esta tarea: no es 0 y no es el de la tarea parecida',
    quienLoTiene: 'jefe de obra (medición real) o quien cargue el análisis en la Base Maestra',
    referencia: null,
    desvioPct: null,
  })
}

/**
 * LAS HH DE UNA PARTIDA. `cantidad × rendimiento = HH`, y nada más. PURA.
 *
 * Devuelve `personas` y `duracion_jornadas` siempre en `null`, con el motivo. No es un pendiente:
 * es la afirmación de que esas dos preguntas NO se contestan con esta multiplicación, y de que
 * quien las necesite tiene que ir a `planDeMano` con los datos que hacen falta.
 */
export function hhDePartida({ cantidad, unidad = null, rendimiento } = {}) {
  const c = num(cantidad)
  const noSeSabe = (porQue, quien) => Object.freeze({
    estado: LECTURA.SIN_DATO, hh: null, cantidad: c, unidad,
    personas: null, duracion_jornadas: null,
    porQue, quienLoTiene: quien,
    comoSeObtieneLaDuracion: 'planDeMano() en plano/cuadrilla.mjs — necesita los contenidos por categoría y la relación salarial UOCRA vigente',
  })

  // `Number(null)` es 0: sin este control una cantidad ausente produce «0 HH», que es un número y
  // no un hueco. Es la misma trampa que `horasNecesarias` ya paga en cuadrilla.mjs.
  if (c === null || c < 0) return noSeSabe('sin cantidad computada no hay HH que calcular: 0 sería una afirmación, no un hueco', 'el cómputo')
  if (!rendimiento || rendimiento.lectura === LECTURA.SIN_DATO || rendimiento.hsUnitarias === null) {
    return noSeSabe(rendimiento?.porQue ?? 'sin rendimiento no hay HH', rendimiento?.quienLoTiene ?? 'jefe de obra o Base Maestra')
  }

  const d = rendimiento.distribucion
  const usarRango = rendimiento.usarElRango && d?.min !== null && d?.max !== null
  return Object.freeze({
    estado: rendimiento.lectura,
    cantidad: c,
    unidad,
    hsUnitarias: rendimiento.hsUnitarias,
    hh: redondear(c * rendimiento.hsUnitarias, 2),
    // El rango de HH sale del rango observado, no de un ± inventado sobre la mediana.
    hhMin: usarRango ? redondear(c * d.min, 2) : null,
    hhMax: usarRango ? redondear(c * d.max, 2) : null,
    casos: d?.n ?? 0,
    obras: rendimiento.obras ?? [],
    personas: null,
    duracion_jornadas: null,
    porQue: `${c} ${unidad ?? 'u'} × ${rendimiento.hsUnitarias} h/u = ${redondear(c * rendimiento.hsUnitarias, 2)} HH · ${rendimiento.porQue}`,
    comoSeObtieneLaDuracion: 'planDeMano() en plano/cuadrilla.mjs — las HH no dicen cuánta gente ni cuántos días: eso depende de la cuadrilla y del frente',
  })
}
