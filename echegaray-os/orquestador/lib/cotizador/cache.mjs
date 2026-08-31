// EL CACHÉ QUE NO PUEDE SERVIR UNA RESPUESTA VIEJA A UN CÓDIGO NUEVO (§13).
//
// ═══ POR QUÉ EL HASH LLEVA LA VERSIÓN DEL PRODUCTOR ═══
//
// En este repo ya pasó: un lector guardó su respuesta en disco, después cambió la lógica que la
// producía, y durante días el código nuevo siguió leyendo el resultado del código viejo. Nadie vio
// un error — vio un número. Un caché cuya clave es sólo «la pregunta» miente exactamente así.
//
// Por eso la clave de este caché lleva TRES cosas y ninguna es opcional:
//   · la pregunta,
//   · TODAS las entradas que cambian el resultado,
//   · la VERSIÓN del código que lo produce.
// Cambiar cualquiera de las tres es una clave distinta, y una clave distinta es un MISS. No hay
// «invalidar»: no hace falta invalidar lo que ya no se puede encontrar.
//
// ═══ POR QUÉ SE PROHÍBE UNA FUNCIÓN EN LA CLAVE ═══
//
// Una función no se puede serializar sin perder lo que hace. Dos resolvedores distintos con el
// mismo nombre —o los dos anónimos— producirían la MISMA clave y el segundo comería la respuesta
// del primero. En vez de adivinar, se rechaza: quien tiene resolvedores distintos pasa una
// `version` distinta, que es la manera explícita de decirlo.

import { createHash } from 'node:crypto'

/** Lo que devuelve una lectura que no encontró nada utilizable. Es un objeto y no `null` para que
 *  el motivo del fallo viaje con el fallo: «no estaba» y «estaba vencido» se atienden distinto. */
export const MOTIVO_MISS = Object.freeze({
  NO_ESTABA: 'NO_ESTABA',
  VENCIDO: 'VENCIDO',
  SIN_CACHE: 'SIN_CACHE',
})

/**
 * SERIALIZACIÓN CANÓNICA Y ESTABLE. PURA.
 *
 * Dos objetos con las mismas llaves en distinto orden producen el MISMO texto —el orden de las
 * llaves de un objeto no cambia el resultado de un cálculo—, pero dos arrays con el mismo contenido
 * en distinto orden producen textos DISTINTOS, porque en un array el orden sí suele ser el dato.
 * `Map` y `Set` se ordenan, porque son diccionarios y conjuntos.
 */
export function canonicalizar(valor, profundidad = 0) {
  if (profundidad > 12) return '"∅profundidad-excedida"'
  if (valor === undefined) return '"∅undefined"'
  if (valor === null) return 'null'
  const t = typeof valor
  if (t === 'function') {
    throw new TypeError('una FUNCIÓN no puede formar parte de una clave de caché: dos funciones distintas con el mismo nombre darían la misma clave. Pasá una `version` explícita en su lugar')
  }
  if (t === 'number') return Number.isFinite(valor) ? JSON.stringify(valor) : `"∅${String(valor)}"`
  if (t === 'bigint') return `"${valor}n"`
  if (t === 'boolean' || t === 'string') return JSON.stringify(valor)
  if (t === 'symbol') throw new TypeError('un SYMBOL no puede formar parte de una clave de caché: no tiene representación estable entre procesos')
  if (valor instanceof Date) {
    return `"@${Number.isNaN(valor.getTime()) ? '∅fecha-ilegible' : valor.toISOString()}"`
  }
  if (valor instanceof Map) {
    return `Map{${[...valor.entries()]
      .map(([k, v]) => `${JSON.stringify(String(k))}:${canonicalizar(v, profundidad + 1)}`)
      .sort()
      .join(',')}}`
  }
  if (valor instanceof Set) {
    return `Set{${[...valor].map((v) => canonicalizar(v, profundidad + 1)).sort().join(',')}}`
  }
  if (Array.isArray(valor)) return `[${valor.map((v) => canonicalizar(v, profundidad + 1)).join(',')}]`
  return `{${Object.keys(valor).sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalizar(valor[k], profundidad + 1)}`)
    .join(',')}}`
}

/**
 * LA CLAVE DE UNA CONSULTA. PURA.
 *
 * `version` NO tiene default a propósito. Un default sería «la versión no importa» escrito de la
 * manera más fácil de no notar, y es justo el error que este módulo existe para impedir.
 */
export function huellaDeConsulta({ pregunta, entradas = {}, version, productor = null } = {}) {
  if (!version) throw new TypeError('huellaDeConsulta exige `version`: sin la versión del productor, el caché sirve respuestas viejas a código nuevo')
  if (pregunta === undefined || pregunta === null || String(pregunta).trim() === '') {
    throw new TypeError('huellaDeConsulta exige una `pregunta` no vacía')
  }
  const texto = canonicalizar({ pregunta: String(pregunta), entradas, version: String(version), productor: productor === null ? null : String(productor) })
  return Object.freeze({ sha256: createHash('sha256').update(texto).digest('hex'), canonico: texto })
}

/**
 * UN CACHÉ EN MEMORIA CON CONTADORES HONESTOS.
 *
 * No es puro —guarda estado, ése es el punto—, pero todo lo que decide es puro: la clave la calcula
 * `huellaDeConsulta` y el vencimiento se compara contra el `ahora` que entra por parámetro. En un
 * test el reloj se mueve a mano y el vencimiento se prueba sin esperar.
 *
 * `capacidad` desaloja lo más viejo por inserción (FIFO). No es LRU y no pretende serlo: para un
 * cotizador, una corrida entra, resuelve y sale; lo que sobrevive entre corridas es el disco, y eso
 * es otra decisión que todavía no está tomada.
 */
export function crearCache({ version, capacidad = 500, ttlMs = null, ahora = () => Date.now() } = {}) {
  if (!version) throw new TypeError('crearCache exige `version`: es lo que impide servir la respuesta de un código que ya no existe')
  const mapa = new Map()
  let hits = 0
  let misses = 0
  let escrituras = 0
  let desalojos = 0
  let vencidos = 0

  const clave = ({ pregunta, entradas = {}, productor = null }) => huellaDeConsulta({ pregunta, entradas, version, productor })

  return Object.freeze({
    version,
    clave,

    /** Devuelve SIEMPRE la misma forma: `{ hit, valor, motivo, sha256 }`. Un `valor: null` con
     *  `hit: true` es un resultado legítimo —«se investigó y no hay dato»— y por eso el hit no se
     *  deduce de que el valor exista. */
    leer(consulta) {
      const k = clave(consulta)
      const guardado = mapa.get(k.sha256)
      if (!guardado) {
        misses += 1
        return Object.freeze({ hit: false, valor: null, motivo: MOTIVO_MISS.NO_ESTABA, sha256: k.sha256 })
      }
      if (ttlMs !== null && ahora() - guardado.en > ttlMs) {
        mapa.delete(k.sha256)
        misses += 1
        vencidos += 1
        return Object.freeze({ hit: false, valor: null, motivo: MOTIVO_MISS.VENCIDO, sha256: k.sha256 })
      }
      hits += 1
      return Object.freeze({ hit: true, valor: guardado.valor, motivo: null, sha256: k.sha256, guardadoEn: guardado.en })
    },

    escribir(consulta, valor) {
      const k = clave(consulta)
      if (!mapa.has(k.sha256) && mapa.size >= capacidad) {
        mapa.delete(mapa.keys().next().value)
        desalojos += 1
      }
      mapa.set(k.sha256, { valor, en: ahora() })
      escrituras += 1
      return k.sha256
    },

    olvidar(consulta) { return mapa.delete(clave(consulta).sha256) },
    vaciar() { mapa.clear() },
    get tamano() { return mapa.size },

    /** Los contadores para `metricas.mjs`. `hit_rate` es `null` cuando NUNCA se consultó: cero
     *  consultas no es cero por ciento de acierto, es una medición que no existe. */
    contadores() {
      const consultas = hits + misses
      return Object.freeze({
        cache_hits: hits,
        cache_misses: misses,
        cache_escrituras: escrituras,
        cache_desalojos: desalojos,
        cache_vencidos: vencidos,
        cache_consultas: consultas,
        cache_hit_rate: consultas > 0 ? Math.round((hits / consultas) * 1000) / 1000 : null,
        cache_tamano: mapa.size,
      })
    },
  })
}

/** Los contadores de «no hay caché». Se usa para que quien arma las métricas no tenga que
 *  preguntarse si el caché existe: siempre hay contadores, y dicen que no hubo consultas. PURA. */
export const SIN_CACHE = Object.freeze({
  cache_hits: 0, cache_misses: 0, cache_escrituras: 0, cache_desalojos: 0,
  cache_vencidos: 0, cache_consultas: 0, cache_hit_rate: null, cache_tamano: 0,
})
