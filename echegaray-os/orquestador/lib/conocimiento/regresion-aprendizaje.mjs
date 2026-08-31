// LA REGRESIÓN QUE PUEDE DAR ROJO.
//
// ═══ EL DEFECTO QUE ESTE ARCHIVO EXISTE PARA TAPAR ═══
//
// `regresion()` de `promocion.mjs` compara una regla contra una lista de casos. Quien la llamaba le
// pasaba como casos LAS MISMAS MEDICIONES con las que había calculado la regla: la regla candidata
// es el promedio de la muestra, y el error se medía contra esa muestra. Un control validado contra
// la información que él mismo produce — lo que el CLAUDE.md prohíbe con todas las letras. Peor: la
// primera vez `reglaAnterior` es `null`, así que el delta era `null`, `empeora` era falso y la
// regresión NUNCA podía impedir una promoción. Un control que no puede decir que no es una constante
// disfrazada de control.
//
// ═══ CÓMO SE ARREGLA ═══
//
// **Dejando una obra afuera.** La regla se aprende con las obras 1..n-1 y se prueba contra la obra
// n, que no participó. Se rota por todas las obras. Eso mide lo único que importa: si lo aprendido
// en otras obras sirve para la próxima — que es exactamente lo que el bucle promete.
//
// Y por eso hace falta más de una obra: con una sola no hay hold-out posible, y el resultado que
// devuelve es `corrio: false`. No es un error, es la respuesta: todavía no hay con qué probar.
import { EMPEORAMIENTO_TOLERADO } from './promocion.mjs'

const redondear = (n, d = 4) => (Number.isFinite(n) ? Math.round(n * 10 ** d) / 10 ** d : null)

/** Mediana. El estadístico que usa el resto del repo para rendimientos: un caso descontrolado no
 *  puede arrastrar al número de los demás, y con tres o cuatro casos una media sí se lo come. */
export function mediana(xs = []) {
  const v = xs.map(Number).filter(Number.isFinite).sort((a, b) => a - b)
  if (!v.length) return null
  const m = Math.floor(v.length / 2)
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2
}

/**
 * LOS PLIEGUES: una obra afuera por vez. PURA.
 *
 * `muestras`: `[{ id, obra, valor, base }]` — `valor` es lo que pasó de verdad y `base` es lo que se
 * habría estimado SIN el aprendizaje (el plan, la referencia del xlsm, lo cotizado). Sin `base` no
 * hay contra qué comparar y el caso no puede decir si el aprendizaje mejoró o empeoró.
 */
export function pliegues(muestras = []) {
  const obras = [...new Set(muestras.map((m) => String(m?.obra ?? '')).filter(Boolean))].sort()
  return obras.map((obra) => ({
    obra,
    entrenamiento: muestras.filter((m) => String(m.obra) !== obra),
    prueba: muestras.filter((m) => String(m.obra) === obra),
  }))
}

const errorRelativo = (pred, real) => {
  const p = Number(pred), r = Number(real)
  if (!Number.isFinite(p) || !Number.isFinite(r) || r === 0) return null
  return Math.abs((p - r) / r)
}

/**
 * REGRESIÓN DEJANDO UNA OBRA AFUERA. PURA.
 *
 * Devuelve la MISMA FORMA que `regresion()` de `promocion.mjs` —`corrio`, `casos`, `mejoran`,
 * `empeoran`, `peores`, `filas`— para que `decidirPromocion` la consuma sin saber cuál de las dos
 * corrió, más el sello `holdOut: true` que la gobernanza exige.
 *
 * `aprender(valores)` es cómo se construye la regla con el entrenamiento; por defecto, la mediana.
 */
export function regresionHoldOut({
  muestras = [], aprender = mediana, tolerancia = EMPEORAMIENTO_TOLERADO, minimoObras = 2,
} = {}) {
  const fs = pliegues(muestras)
  if (fs.length < minimoObras) {
    return {
      corrio: false, holdOut: true, casos: 0, mejoran: 0, empeoran: 0, iguales: 0,
      filas: [], peores: [], porObra: [], errorNueva: null, errorAnterior: null, deltaPP: null,
      porQue: `hay ${fs.length} obra(s) con mediciones: con menos de ${minimoObras} la regla se probaría contra los casos que la produjeron`,
    }
  }

  const filas = []
  const porObra = []
  for (const f of fs) {
    const regla = aprender(f.entrenamiento.map((m) => m.valor))
    const deLaObra = []
    for (const caso of f.prueba) {
      const errN = errorRelativo(regla, caso.valor)
      const errV = caso.base === null || caso.base === undefined ? null : errorRelativo(caso.base, caso.valor)
      const delta = errN !== null && errV !== null ? redondear(errN - errV) : null
      const fila = {
        id: caso.id, obra: f.obra, esperado: caso.valor, conNueva: regla, conAnterior: caso.base ?? null,
        errorNueva: redondear(errN), errorAnterior: redondear(errV), delta,
        empeora: delta !== null && delta > tolerancia,
        mejora: delta !== null && delta < -tolerancia,
        // Un caso que no se puede comparar no es un caso que pasó: se cuenta aparte.
        comparable: delta !== null,
      }
      filas.push(fila); deLaObra.push(fila)
    }
    const comp = deLaObra.filter((x) => x.comparable)
    porObra.push({
      obra: f.obra, regla: redondear(regla), casos: deLaObra.length, comparables: comp.length,
      errorNueva: comp.length ? redondear(comp.reduce((a, x) => a + x.errorNueva, 0) / comp.length) : null,
      errorAnterior: comp.length ? redondear(comp.reduce((a, x) => a + x.errorAnterior, 0) / comp.length) : null,
      empeoran: deLaObra.filter((x) => x.empeora).length,
      mejoran: deLaObra.filter((x) => x.mejora).length,
    })
  }

  const comparables = filas.filter((x) => x.comparable)
  const empeoran = filas.filter((x) => x.empeora)
  const media = (xs, k) => (xs.length ? redondear(xs.reduce((a, x) => a + x[k], 0) / xs.length) : null)
  const eN = media(comparables, 'errorNueva'), eV = media(comparables, 'errorAnterior')
  return {
    corrio: comparables.length > 0,
    holdOut: true,
    casos: filas.length,
    comparables: comparables.length,
    mejoran: filas.filter((x) => x.mejora).length,
    empeoran: empeoran.length,
    iguales: filas.filter((x) => x.comparable && !x.mejora && !x.empeora).length,
    errorNueva: eN, errorAnterior: eV,
    // En puntos porcentuales de error. Negativo = el aprendizaje estima MEJOR que lo que había.
    deltaPP: eN !== null && eV !== null ? redondear((eN - eV) * 100, 2) : null,
    filas, peores: empeoran, porObra,
    porQue: comparables.length
      ? `${fs.length} obra(s) rotadas, ${comparables.length} caso(s) comparables, ${empeoran.length} empeoran`
      : 'ningún caso tenía con qué compararse (falta la estimación previa)',
  }
}

/**
 * ¿EL APRENDIZAJE ACTIVO EMPEORÓ LAS COSAS? PURA — la pregunta que dispara el rollback.
 *
 * Se corre DESPUÉS de activar, sobre casos nuevos. Devuelve `revertir: true` cuando el error con la
 * regla activa es peor que con la anterior más allá de la tolerancia. Es la contracara de la puerta
 * de entrada: sin esto, un aprendizaje malo entra una vez y se queda para siempre.
 */
export function evaluarActivo({ casos = [], reglaActiva = null, reglaAnterior = null, tolerancia = EMPEORAMIENTO_TOLERADO } = {}) {
  const filas = casos.map((c) => {
    const errA = errorRelativo(reglaActiva, c.valor)
    const errP = reglaAnterior === null || reglaAnterior === undefined ? null : errorRelativo(reglaAnterior, c.valor)
    return { id: c.id, esperado: c.valor, errorActiva: redondear(errA), errorAnterior: redondear(errP),
      delta: errA !== null && errP !== null ? redondear(errA - errP) : null }
  })
  const comp = filas.filter((f) => f.delta !== null)
  if (!comp.length) return { revertir: false, corrio: false, filas, porQue: 'no hay casos comparables para juzgar la regla activa' }
  const delta = redondear(comp.reduce((a, f) => a + f.delta, 0) / comp.length)
  return {
    revertir: delta > tolerancia, corrio: true, delta, deltaPP: redondear(delta * 100, 2), filas,
    porQue: delta > tolerancia
      ? `la regla activa estima ${(delta * 100).toFixed(1)} pp PEOR que la anterior sobre ${comp.length} caso(s): vuelve atrás`
      : `la regla activa estima ${(delta * 100).toFixed(1)} pp de diferencia sobre ${comp.length} caso(s): se sostiene`,
  }
}
