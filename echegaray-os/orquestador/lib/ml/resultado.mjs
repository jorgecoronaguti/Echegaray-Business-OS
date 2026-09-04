// LA FORMA QUE TIENE TODA RESPUESTA DE LA CAPA ML. UNA SOLA, PARA TODAS LAS CAPACIDADES.
//
// ═══ POR QUÉ EXISTE ═══
//
// El OS ya tiene una puerta única a los modelos de razonamiento (`lib/ia/`), y se nota: quien pide
// declara la dificultad y no nombra un modelo. La capa ML repite esa disciplina un escalón más
// arriba: un módulo de Compras no pregunta «¿hay embeddings?», pide `resolveEntity` y recibe SIEMPRE
// la misma forma, resuelva quien resuelva —una regla, una consulta SQL, un modelo local o Claude.
//
// ═══ POR QUÉ `metodo` Y `confianza` VIAJAN CON EL DATO, Y NO EN UN LOG ═══
//
// Porque quien recibe la respuesta tiene que poder decidir distinto según cómo se obtuvo. «El CUIT
// coincide» y «los nombres se parecen» NO son la misma respuesta aunque devuelvan el mismo
// proveedor: la primera se aplica sola, la segunda se propone. Si esa diferencia vive en un log,
// el que decide no la ve.
//
// Regla de oro 2 del OS: nunca presentar una estimación como un hecho. `metodo` es lo que la hace
// cumplible por código.

import { randomUUID } from 'node:crypto'

/** CÓMO se resolvió. Es un enum, no una escala — pero está ordenado de más barato y seguro a menos. */
export const METODO = Object.freeze({
  REGLA: 'regla',              // determinístico: una condición, un identificador fuerte, una tabla
  SQL: 'sql',                  // una consulta contra la memoria estructurada
  ESTADISTICA: 'estadistica',  // rangos, desvíos, series — explicable, sin modelo
  ML_LOCAL: 'ml-local',        // un modelo corriendo en esta VM
  HF_REMOTO: 'hf-remoto',      // Hugging Face: Inference Providers o un Job
  CLAUDE: 'claude',            // razonamiento
  SIN_RESOLVER: 'sin-resolver', // nadie pudo, y se dice
})

/** El orden de escalada por defecto. Cada capacidad puede acortarlo, ninguna puede saltearlo. */
export const ESCALERA = Object.freeze([
  METODO.REGLA, METODO.SQL, METODO.ESTADISTICA, METODO.ML_LOCAL, METODO.HF_REMOTO, METODO.CLAUDE,
])

/**
 * UMBRALES DE CONFIANZA. No son decoración: gobiernan qué se puede hacer con la respuesta.
 *
 * El dueño lo pidió con estas palabras: «alta confianza → resolver automáticamente · media →
 * sugerir · baja → no vincular». Se codifica una sola vez, acá, para que ninguna capacidad se
 * invente los suyos.
 */
export const UMBRAL = Object.freeze({ ALTA: 0.90, MEDIA: 0.70 })

/** Qué se puede HACER con una respuesta, dada su confianza. Es la traducción de los umbrales a una
 *  decisión, y es lo que los módulos consultan — no el número suelto. */
export const ACCION = Object.freeze({ APLICAR: 'aplicar', SUGERIR: 'sugerir', DESCARTAR: 'descartar' })

export function accionPara(confianza, metodo = null) {
  // UN IDENTIFICADOR FUERTE NO SE «SUGIERE». Si el CUIT coincide, coincide: no hay grado. Que una
  // regla determinística caiga en «sugerir» por un número de confianza mal puesto sería convertir un
  // hecho en una opinión.
  if (metodo === METODO.REGLA || metodo === METODO.SQL) return ACCION.APLICAR
  const c = Number(confianza)
  if (!Number.isFinite(c)) return ACCION.DESCARTAR
  if (c >= UMBRAL.ALTA) return ACCION.APLICAR
  if (c >= UMBRAL.MEDIA) return ACCION.SUGERIR
  return ACCION.DESCARTAR
}

/**
 * La respuesta estándar.
 *
 * `porQue` no es opcional por capricho: el dueño pidió «registrar siempre por qué se produjo el
 * match». Una respuesta sin explicación no se puede auditar ni corregir, y es exactamente lo que
 * convierte a un control en una caja negra.
 */
export function resultado({
  valor = null, confianza = null, metodo = METODO.SIN_RESOLVER, modelo = null, proveedor = null,
  ms = null, costoUsd = null, huboFallback = false, porQue = null, traceId = null, evidencia = null,
} = {}) {
  return {
    valor,
    confianza: confianza == null ? null : Number(confianza),
    metodo,
    modelo,
    proveedor,
    ms,
    costoUsd,
    huboFallback: Boolean(huboFallback),
    accion: accionPara(confianza, metodo),
    porQue,
    evidencia,
    traceId: traceId ?? randomUUID(),
  }
}

/** Lo que devuelve una capacidad que no pudo. NO es un error: es una respuesta legítima, y hay que
 *  poder distinguirla de «no encontré nada» sin mirar un try/catch. */
export function sinResolver(porQue, extra = {}) {
  return resultado({ ...extra, valor: null, confianza: 0, metodo: METODO.SIN_RESOLVER, porQue })
}

/** Envuelve una llamada midiendo el tiempo real, para que `ms` no lo estime nadie. */
export async function medido(fn) {
  const t0 = Date.now()
  const r = await fn()
  return { ...r, ms: r.ms ?? Date.now() - t0 }
}
