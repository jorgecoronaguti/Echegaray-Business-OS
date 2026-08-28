// EL BUCLE DE APRENDIZAJE — de una obra ejecutada a una regla que se puede usar, o a nada.
//
// ═══ EL CICLO ═══
//
//   COTIZADO → PLANIFICADO → EJECUTADO → REAL → COMPARACIÓN → CANDIDATO
//            → CONTRASTE → VALIDACIÓN → REGRESIÓN → PROMOCIÓN → REUTILIZACIÓN
//
// ═══ LAS DOS PUERTAS QUE NO SE ABREN SOLAS ═══
//
// 1. UNA OBRA NO ES UNA REGLA. Un rendimiento medido una vez es una observación aislada. Este repo
//    ya tiene la escala —A observación · B recurrencia · C patrón probable · D conocimiento
//    validado · E regla operativa— y acá se aplica con números: hace falta una MUESTRA mínima y una
//    DISPERSIÓN acotada. Sin las dos, el candidato queda candidato.
//
// 2. UNA MEJORA QUE EMPEORA CASOS CONOCIDOS NO SE ACTIVA. Antes de promover se vuelven a correr los
//    casos históricos con la regla nueva. Si alguno empeora sin explicación, gana la versión
//    anterior. Esto es lo que impide que «aprender» sea «ajustar hasta que dé lo que quería».
//
// ═══ LO QUE HACE POSIBLE VOLVER ═══
//
// Cada promoción guarda la regla ANTERIOR entera. Sin eso no hay rollback: hay que reconstruir de
// memoria lo que decía antes, y eso ya salió mal en este repo más de una vez.
import { huella } from './cache.mjs'

/** La escala de madurez del repo, con su número. No es decorativa: `PROMOVIBLE` empieza en D. */
export const MADUREZ = Object.freeze({
  A: 'A', // observación aislada
  B: 'B', // recurrencia
  C: 'C', // patrón probable
  D: 'D', // conocimiento interno validado
  E: 'E', // regla operativa aprobada por el dueño
})

/** La muestra mínima para cada escalón. Debajo de 2 no hay recurrencia posible: es aritmética, no
 *  criterio. El salto a E no está acá porque no lo decide un número: lo firma el dueño. */
export const MUESTRA_MINIMA = Object.freeze({ A: 1, B: 2, C: 3, D: 5 })

/** Cuánto puede dispersarse la muestra y seguir siendo una regla. Un coeficiente de variación de
 *  0,35 sobre rendimientos de obra ya es mucho; arriba de eso el promedio no representa nada. */
export const DISPERSION_MAXIMA = 0.35

/** Cuánto puede empeorar un caso histórico y seguir siendo aceptable. 2% absorbe redondeos; más que
 *  eso es un cambio de resultado y hay que explicarlo, no tolerarlo. */
export const EMPEORAMIENTO_TOLERADO = 0.02

const redondear = (n, d = 4) => (Number.isFinite(n) ? Math.round(n * 10 ** d) / 10 ** d : null)

/**
 * LA ESTADÍSTICA DE UNA MUESTRA. PURA.
 *
 * `dispersion` es el coeficiente de variación (desvío / media): es adimensional, así que compara
 * rendimientos de hormigón con rendimientos de pintura sin trampa. Con media 0 devuelve `null`, no
 * infinito: dividir por cero acá produciría un número que después alguien lee como una medición.
 */
export function estadistica(valores = []) {
  const v = valores.map(Number).filter(Number.isFinite)
  if (!v.length) return { n: 0, media: null, min: null, max: null, desvio: null, dispersion: null }
  const media = v.reduce((a, x) => a + x, 0) / v.length
  // Con UNA sola medición no hay desvío que calcular. Devolver 0 la hacía pasar por la muestra más
  // consistente posible —«dispersión 0»— cuando lo cierto es que no se puede saber. `null` es el
  // valor honesto, y `madurezDe` lo trata como lo que es: falta de información, no perfección.
  const hayDispersion = v.length >= 2
  const desvio = hayDispersion ? Math.sqrt(v.reduce((a, x) => a + (x - media) ** 2, 0) / (v.length - 1)) : null
  return {
    n: v.length, media: redondear(media), min: Math.min(...v), max: Math.max(...v),
    desvio: hayDispersion ? redondear(desvio) : null,
    dispersion: !hayDispersion || media === 0 ? null : redondear(desvio / Math.abs(media)),
  }
}

/**
 * UN CANDIDATO DE APRENDIZAJE. PURA.
 *
 * Lleva todo lo que hace falta para poder discutirlo dentro de un año: de cuántas obras salió,
 * cuáles, cuándo, con qué dispersión, contra qué regla anterior, y qué evidencia lo sostiene.
 * Un aprendizaje sin `obras` no se puede auditar: es una afirmación sin quién la respalde.
 */
export function candidato({
  clave, afirmacion, valores = [], obras = [], contexto = null, unidad = null,
  reglaAnterior = null, evidencia = [], fecha = null, area = 'cotizacion',
} = {}) {
  if (!clave || !afirmacion) throw new Error('un candidato de aprendizaje necesita clave y afirmación')
  const est = estadistica(valores)
  const obrasDistintas = [...new Set(obras.map(String))].length
  return {
    id: `apr:${huella({ clave, obras: [...obras].sort(), n: est.n }).slice(0, 16)}`,
    clave: String(clave), afirmacion: String(afirmacion), unidad, area, contexto,
    valores: valores.map(Number), estadistica: est,
    obras: [...obras], obrasDistintas,
    reglaAnterior, reglaCandidata: est.media, evidencia, fecha,
    version: (reglaAnterior?.version ?? 0) + 1,
    madurez: madurezDe({ n: est.n, obrasDistintas, dispersion: est.dispersion }),
  }
}

/**
 * QUÉ MADUREZ ALCANZA UNA MUESTRA. PURA.
 *
 * Cuenta OBRAS DISTINTAS, no mediciones: veinte mediciones de la misma obra son una obra, y tratarlas
 * como veinte es cómo un caso particular se disfraza de regla general. La dispersión es un techo:
 * una muestra grande y desparramada NO sube — sube el ruido, no el conocimiento.
 */
export function madurezDe({ n = 0, obrasDistintas = 0, dispersion = null } = {}) {
  // Cero mediciones NO es una observación aislada: es ninguna observación. La versión anterior tenía
  // `n >= 1 ? A : A` —una rama muerta— y le daba a la nada la misma madurez que a un dato medido.
  if (n < 1) return null
  const base = obrasDistintas >= MUESTRA_MINIMA.D ? MADUREZ.D
    : obrasDistintas >= MUESTRA_MINIMA.C ? MADUREZ.C
      : obrasDistintas >= MUESTRA_MINIMA.B ? MADUREZ.B
        : MADUREZ.A
  if (dispersion !== null && dispersion > DISPERSION_MAXIMA) {
    // Se BAJA un escalón, no se anula: la observación sigue existiendo, lo que no existe es la regla.
    return base === MADUREZ.D ? MADUREZ.C : base === MADUREZ.C ? MADUREZ.B : MADUREZ.A
  }
  return base
}

/**
 * CORRER LA REGRESIÓN DE UN CANDIDATO CONTRA CASOS HISTÓRICOS. PURA.
 *
 * `casos` son `{ id, entrada, esperado }` y `aplicar(regla, entrada)` devuelve el resultado. Se
 * compara el error de la regla NUEVA contra el de la ANTERIOR, caso por caso. No se promedia el
 * error total: un promedio esconde que un caso mejoró 10% y otro empeoró 40%.
 */
export function regresion({ casos = [], aplicar, reglaAnterior = null, reglaCandidata = null } = {}) {
  if (typeof aplicar !== 'function') throw new Error('regresion() necesita cómo aplicar la regla a un caso')
  const filas = casos.map((c) => {
    const nuevo = aplicar(reglaCandidata, c.entrada)
    const viejo = reglaAnterior === null ? null : aplicar(reglaAnterior, c.entrada)
    const errN = Number.isFinite(Number(c.esperado)) && Number(c.esperado) !== 0 ? Math.abs((nuevo - c.esperado) / c.esperado) : null
    const errV = viejo === null || !Number.isFinite(Number(c.esperado)) || Number(c.esperado) === 0 ? null : Math.abs((viejo - c.esperado) / c.esperado)
    const delta = errN !== null && errV !== null ? redondear(errN - errV) : null
    return {
      id: c.id, esperado: c.esperado, conNueva: nuevo, conAnterior: viejo,
      errorNueva: redondear(errN), errorAnterior: redondear(errV), delta,
      empeora: delta !== null && delta > EMPEORAMIENTO_TOLERADO,
      mejora: delta !== null && delta < -EMPEORAMIENTO_TOLERADO,
    }
  })
  const empeoran = filas.filter((f) => f.empeora)
  return {
    casos: filas.length,
    mejoran: filas.filter((f) => f.mejora).length,
    empeoran: empeoran.length,
    iguales: filas.filter((f) => !f.mejora && !f.empeora).length,
    // Sin casos históricos la regresión NO pasa: pasa vacía, que es otra cosa. Declararlo evita que
    // «0 casos empeoraron» se lea como «se probó y anduvo».
    corrio: filas.length > 0,
    filas, peores: empeoran,
  }
}

/**
 * ¿SE PROMUEVE? La decisión, con sus tres condiciones y el motivo de la que falle.
 *
 * Devuelve SIEMPRE por qué. Un `false` sin motivo obliga a leer el código para entender qué faltó,
 * y entonces el que decide vuelve a ser el que escribió el código.
 */
export function decidirPromocion({ candidato: c, regresion: reg, exigeMadurez = MADUREZ.D } = {}) {
  const motivos = []
  const orden = { A: 0, B: 1, C: 2, D: 3, E: 4 }
  if (!c?.madurez) motivos.push('no hay ninguna medición: no hay muestra que evaluar')
  else if (orden[c.madurez] < orden[exigeMadurez]) {
    motivos.push(`la madurez alcanzada es ${c?.madurez} y hace falta ${exigeMadurez}: ${c?.obrasDistintas ?? 0} obra(s) distinta(s)${c?.estadistica?.dispersion !== null && c?.estadistica?.dispersion !== undefined ? `, dispersión ${c.estadistica.dispersion}` : ''}`)
  }
  if (!reg?.corrio) motivos.push('la regresión no corrió sobre ningún caso histórico: sin casos no hay nada probado')
  if (reg?.empeoran > 0) motivos.push(`${reg.empeoran} caso(s) histórico(s) empeoran con la regla nueva: ${reg.peores.map((p) => `${p.id} (${(p.delta * 100).toFixed(1)} pp)`).join(', ')}`)
  if (!c?.evidencia?.length) motivos.push('el candidato no trae evidencia adjunta')
  return {
    promover: motivos.length === 0,
    motivos,
    porQue: motivos.length === 0
      ? `${c.obrasDistintas} obras distintas, dispersión ${c.estadistica.dispersion}, ${reg.casos} caso(s) histórico(s) y ninguno empeora`
      : motivos.join(' · '),
  }
}

/**
 * APLICAR UNA PROMOCIÓN — y dejar por escrito cómo volver.
 *
 * `historial` es la pila de rollback. La entrada nueva guarda la regla anterior ENTERA, no un
 * puntero: si mañana el candidato resulta malo, volver no tiene que depender de reconstruir nada.
 */
export function promover({ registro = { version: 0, reglas: {}, historial: [] }, candidato: c, decision, cuando = null }) {
  if (!decision?.promover) return { registro, aplicada: false, porQue: decision?.porQue ?? 'la promoción no fue aprobada' }
  const anterior = registro.reglas?.[c.clave] ?? null
  const version = (registro.version ?? 0) + 1
  return {
    registro: {
      version,
      reglas: { ...(registro.reglas ?? {}), [c.clave]: { clave: c.clave, valor: c.reglaCandidata, unidad: c.unidad, afirmacion: c.afirmacion, madurez: c.madurez, estadistica: c.estadistica, obras: c.obras, evidencia: c.evidencia, desde: cuando, version } },
      historial: [...(registro.historial ?? []), { version, clave: c.clave, cuando, anterior, nueva: c.reglaCandidata, porQue: decision.porQue }],
    },
    aplicada: true,
    porQue: decision.porQue,
  }
}

/**
 * VOLVER ATRÁS. Restaura la regla anterior de una clave y deja el rollback anotado en el mismo
 * historial: volver también es un cambio, y un cambio sin registro es cómo se pierde la trazabilidad.
 */
export function revertir({ registro, clave, cuando = null, porQue = null }) {
  const entrada = [...(registro.historial ?? [])].reverse().find((h) => h.clave === clave)
  if (!entrada) return { registro, revertida: false, porQue: `no hay ninguna promoción registrada para «${clave}»` }
  const version = (registro.version ?? 0) + 1
  const reglas = { ...(registro.reglas ?? {}) }
  if (entrada.anterior) reglas[clave] = entrada.anterior; else delete reglas[clave]
  return {
    registro: { version, reglas, historial: [...registro.historial, { version, clave, cuando, anterior: registro.reglas?.[clave] ?? null, nueva: entrada.anterior?.valor ?? null, porQue: porQue ?? `rollback de la versión ${entrada.version}` }] },
    revertida: true,
    porQue: `«${clave}» vuelve a ${entrada.anterior ? entrada.anterior.valor : 'no tener regla'}`,
  }
}
