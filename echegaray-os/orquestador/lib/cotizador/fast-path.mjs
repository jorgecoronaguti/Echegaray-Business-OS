// CLAUDE NO ES UNA DEPENDENCIA (§13).
//
// ═══ QUÉ ES ESTE ARCHIVO ═══
//
// El orden explícito y medible en que XSAS intenta resolver cualquier cosa antes de gastar un
// token. Nueve niveles, de más barato y más confiable a más caro y más blando:
//
//   CACHE → CODE → SQL → BASE MAESTRA → EXPERIENCIA ECSAS → BIBLIOTECA TÉCNICA → RESEARCH →
//   MODELO BARATO → MODELO POTENTE
//
// Los SIETE primeros no tocan un modelo. Los dos últimos son los únicos que lo hacen, y sólo para
// razonamiento realmente nuevo o ambiguo. Con el proveedor muerto, esos dos se saltan ANOTADOS y
// los otros siete siguen funcionando igual: eso es lo que significa que Claude no sea dependencia.
//
// Los nombres del dueño y los ids de acá son los mismos escalones: CONOCIMIENTO LOCAL es
// `BIBLIOTECA_TECNICA` y FUENTES PRIMARIAS/WEB es `RESEARCH` —la cascada del §12, que incluye las
// fuentes permanentes y internet—. Se conservan los ids porque son los que `metricas.mjs` publica y
// los que la corrida guardada del mes pasado tiene escritos: renombrarlos rompería la comparación.
//
// ═══ POR QUÉ EL ESTADO DEL PROVEEDOR ES UNA FUNCIÓN PURA Y NO UN FLAG ═══
//
// Un `modoOffline: true` prueba que el código respeta un booleano, no que sobrevive a la realidad.
// Las cuatro condiciones que apagan un modelo son distintas entre sí y fallan distinto: sin key es
// un error de configuración, sin saldo es un 400 del proveedor, el proveedor caído es un timeout o
// un 5xx en medio de la corrida, y desactivado es una decisión nuestra. `estadoDelProveedor` las
// evalúa por separado y las publica una por una, para que el informe pueda decir CUÁL de las cuatro
// pasó y no sólo «no había modelo».
//
// ═══ EL CACHÉ ESTÁ PRIMERO, Y QUÉ SE HIZO CON LO QUE ESO ROMPÍA ═══
//
// Estuvo tercero, con un argumento bueno: un cálculo de código y una consulta SQL son la VERDAD DEL
// MOMENTO, y el caché es una verdad de antes. El orden lo fijó el dueño con el caché primero —es el
// escalón más barato y ése es todo el punto de un fast path—, y el argumento viejo sigue siendo
// cierto para UN solo nivel: SQL.
//
// La respuesta no es discutir el orden, es que el caché sepa DE DÓNDE salió lo que guarda. Una
// entrada de origen CODE es una función pura de sus entradas y no envejece nunca: si la clave es la
// misma, el resultado es el mismo. Una de origen SQL sí envejece, porque la base cambió sin que la
// pregunta cambiara. Por eso una entrada de origen SQL sólo se sirve si el caché tiene un `ttlMs`
// declarado —alguien dijo cuánta antigüedad es aceptable—; sin esa declaración se devuelve un MISS
// con el motivo escrito y el nivel SQL vuelve a consultar. El caché es primero para todo lo que no
// envejece, y no puede servir estado vivo vencido sin que nadie lo haya autorizado.

import { crearCache, SIN_CACHE } from './cache.mjs'
import { investigarHueco, PASO } from './research.mjs'
import { FUENTE } from '../plano/fuente.mjs'
import { conciliarLLM } from '../ia/medidor.mjs'

/** Los nueve niveles, por su nombre. Son las llaves de `resolvedores`. */
export const NIVEL = Object.freeze({
  CODE: 'CODE',
  SQL: 'SQL',
  CACHE: 'CACHE',
  BASE_MAESTRA: 'BASE_MAESTRA',
  EXPERIENCIA_ECSAS: 'EXPERIENCIA_ECSAS',
  BIBLIOTECA_TECNICA: 'BIBLIOTECA_TECNICA',
  RESEARCH: 'RESEARCH',
  MODELO_BARATO: 'MODELO_BARATO',
  MODELO_POTENTE: 'MODELO_POTENTE',
})

/**
 * EL FAST PATH, EN ORDEN. Cambiar este array cambia cuánto cuesta cada respuesta del sistema.
 *
 * `usaModelo` es lo que separa los siete niveles que sobreviven a un proveedor caído de los dos que
 * no. `fuente` es con qué clasificación sale el dato si ese nivel lo resuelve.
 */
export const FAST_PATH = Object.freeze([
  { id: NIVEL.CACHE, que: 'algo que ya se resolvió con estas mismas entradas y esta misma versión', usaModelo: false, fuente: null },
  { id: NIVEL.CODE, que: 'una función determinística del OS: una cuenta, una conversión, una regla escrita', usaModelo: false, fuente: FUENTE.CALCULADO },
  { id: NIVEL.SQL, que: 'una consulta a Postgres: el estado de ahora, no una copia', usaModelo: false, fuente: FUENTE.BASE_MAESTRA },
  { id: NIVEL.BASE_MAESTRA, que: 'la Base Maestra de ECSAS', usaModelo: false, fuente: FUENTE.BASE_MAESTRA },
  { id: NIVEL.EXPERIENCIA_ECSAS, que: 'lo medido en obras de ECSAS', usaModelo: false, fuente: FUENTE.EXPERIENCIA_ECSAS },
  { id: NIVEL.BIBLIOTECA_TECNICA, que: 'la biblioteca técnica incorporada', usaModelo: false, fuente: FUENTE.DOCUMENTO_TECNICO },
  { id: NIVEL.RESEARCH, que: 'la cascada de investigación del §12, que incluye fuentes permanentes y la web', usaModelo: false, fuente: null },
  { id: NIVEL.MODELO_BARATO, que: 'un modelo chico, para interpretar algo acotado', usaModelo: true, fuente: FUENTE.INFERIDO },
  { id: NIVEL.MODELO_POTENTE, que: 'un modelo grande, para razonamiento realmente nuevo', usaModelo: true, fuente: FUENTE.INFERIDO },
])

/** Los niveles que NO necesitan un modelo. PURA. Es la lista que tiene que seguir funcionando con
 *  el proveedor muerto, y el test la afirma entera. */
export const NIVELES_SIN_MODELO = Object.freeze(FAST_PATH.filter((n) => !n.usaModelo).map((n) => n.id))
export const NIVELES_CON_MODELO = Object.freeze(FAST_PATH.filter((n) => n.usaModelo).map((n) => n.id))
export const esNivelDeModelo = (id) => NIVELES_CON_MODELO.includes(id)
export const ordenDelFastPath = () => FAST_PATH.map((n) => n.id)

/**
 * ¿HAY UN MODELO DISPONIBLE? PURA.
 *
 * Las cuatro condiciones se evalúan por SEPARADO y se publican por separado. `disponible` es la
 * conjunción, pero lo que se informa es cuál falló: «no había modelo» no le sirve a nadie para
 * arreglarlo, y las cuatro se arreglan distinto.
 *
 * `saldoUsd` en `null` significa «no se pudo consultar el saldo», que NO es lo mismo que cero: sin
 * poder mirar, no se declara que hay crédito. Es la regla de este repo — un control que no pudo
 * mirar no dice «está bien».
 */
export function estadoDelProveedor({ apiKey = null, saldoUsd = null, proveedorVivo = true, llmActivados = true } = {}) {
  const condiciones = Object.freeze({
    sin_key: !apiKey,
    sin_saldo: !(Number(saldoUsd) > 0),
    proveedor_caido: !proveedorVivo,
    desactivados: !llmActivados,
  })
  const fallando = Object.entries(condiciones).filter(([, v]) => v).map(([k]) => k)
  return Object.freeze({
    disponible: fallando.length === 0,
    condiciones,
    porQue: fallando.length === 0
      ? 'hay key, hay saldo, el proveedor responde y los modelos están activados'
      : `los modelos NO están disponibles: ${fallando.join(', ')}${condiciones.sin_saldo && saldoUsd === null ? ' (el saldo no se pudo consultar, y sin poder mirar no se declara que hay crédito)' : ''}`,
    motivos: Object.freeze(fallando),
  })
}

/** El estado que corresponde cuando NADA está disponible. Es el default del fast path: un módulo
 *  que asume que hay modelo hasta que le demuestren lo contrario termina cayéndose en producción. */
export const SIN_PROVEEDOR = estadoDelProveedor({})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// LO QUE NUNCA SE LE PREGUNTA A UN MODELO
// ══════════════════════════════════════════════════════════════════════════════════════════════
//
// «Nunca llamar a un LLM para sumar, multiplicar, convertir unidades conocidas, hacer SQL, buscar
// un dato estructurado, comparar hashes o elegir una regla determinística» era una frase en un
// documento. Una frase en un documento dura hasta el primer apuro: acá es una lista, una función
// pura y un `if` en el recorrido, y el nivel de modelo NO SE LLAMA cuando aplica. No se llama y se
// descarta la respuesta: no se llama. Descartar después ya pagó los tokens y ya corrió el riesgo de
// que el número saliera mal.

/** Las siete clases de trabajo prohibidas para un modelo, con el motivo por el que lo son. */
export const CLASE = Object.freeze({
  ARITMETICA: 'ARITMETICA',
  CONVERSION_UNIDADES: 'CONVERSION_UNIDADES',
  SQL: 'SQL',
  DATO_ESTRUCTURADO: 'DATO_ESTRUCTURADO',
  COMPARAR_HASH: 'COMPARAR_HASH',
  REGLA_DETERMINISTICA: 'REGLA_DETERMINISTICA',
  INTERPRETACION: 'INTERPRETACION',
})

const PORQUE_PROHIBIDA = Object.freeze({
  [CLASE.ARITMETICA]: 'es una cuenta: el OS la hace exacta y gratis, y un modelo la puede errar sin avisar',
  [CLASE.CONVERSION_UNIDADES]: 'es una conversión de unidades conocidas: vive en `unidades.mjs`, con su test',
  [CLASE.SQL]: 'es una consulta a la base: el estado de ahora sale de Postgres, no de una memoria',
  [CLASE.DATO_ESTRUCTURADO]: 'es buscar un dato que ya está estructurado: eso es un SELECT o una lectura, no una inferencia',
  [CLASE.COMPARAR_HASH]: 'es comparar dos huellas: son iguales o no lo son, y eso no admite opinión',
  [CLASE.REGLA_DETERMINISTICA]: 'es elegir entre reglas escritas: la regla ya decide, preguntarle a un modelo la reabre',
})

/** Las clases que un modelo no puede atender. PURA. `INTERPRETACION` está fuera a propósito: es la
 *  ÚNICA para la que el modelo existe. */
export const CLASES_PROHIBIDAS_PARA_MODELO = Object.freeze(Object.keys(PORQUE_PROHIBIDA))

/**
 * ¿ESTE TRABAJO ES DETERMINÍSTICO? PURA.
 *
 * Dos señales, y la declarada gana. La `clase` que declara el llamador es la fuente de verdad
 * —quien arma la pregunta sabe qué está pidiendo—; el texto se mira sólo cuando NO se declaró
 * nada, porque un fast path sin clase declarada es el caso normal hoy y dejarlo sin control sería
 * tener la regla escrita y apagada.
 *
 * La heurística de texto es deliberadamente CORTA y sólo marca lo que no admite discusión. Una
 * heurística ambiciosa acá bloquearía interpretaciones legítimas, y eso es peor: el modelo dejaría
 * de atender justo el caso para el que está.
 */
export function esDeterministica({ clase = null, pregunta = '' } = {}) {
  if (clase) {
    const c = String(clase).toUpperCase()
    if (PORQUE_PROHIBIDA[c]) return { si: true, clase: c, porQue: PORQUE_PROHIBIDA[c], como: 'DECLARADA' }
    return { si: false, clase: c, porQue: 'el llamador declaró que esto hay que interpretarlo', como: 'DECLARADA' }
  }

  const t = String(pregunta ?? '')
  const detectada = t.match(/^\s*[-+]?[\d.,]+\s*[+\-*/×÷]\s*[-+]?[\d.,]+/) ? CLASE.ARITMETICA
    : /\b(cu[aá]nto es|cu[aá]nto da)\b.*[\d].*[+\-*/×÷].*[\d]/i.test(t) ? CLASE.ARITMETICA
    : /\bselect\b[\s\S]*\bfrom\b/i.test(t) ? CLASE.SQL
    : /\b(sha-?256|sha1|md5|hash|huella)\b[\s\S]*\b(igual|coincide|comparar|distinto)\b/i.test(t) ? CLASE.COMPARAR_HASH
    : /\bcu[aá]nt[oa]s?\s+\w+\s+(hay|son)\s+en\s+\d/i.test(t) ? CLASE.CONVERSION_UNIDADES
    : null

  return detectada
    ? { si: true, clase: detectada, porQue: PORQUE_PROHIBIDA[detectada], como: 'DETECTADA_EN_EL_TEXTO' }
    : { si: false, clase: null, porQue: 'no se declaró una clase determinística ni el texto delata una', como: 'SIN_DECLARAR' }
}

/**
 * EL REGISTRO DE UNA CORRIDA. No es puro —acumula—, pero sólo acumula lo que le declaran: nada acá
 * se deduce del resultado final, que es como se fabricó el 100 % falso que este frente vino a
 * arreglar. Lo consume `metricas.mjs`.
 */
export function crearRegistro({ cache = null, medidor = null } = {}) {
  const llamadasLLM = []
  const llamadasWeb = []
  const investigaciones = []
  const niveles = []
  const prohibidas = []
  let deterministicas = 0
  let ms = 0

  return {
    llamadasLLM, llamadasWeb, investigaciones, niveles, prohibidas,
    anotarLLM(l) { llamadasLLM.push({ tokensIn: l?.tokensIn ?? 0, tokensOut: l?.tokensOut ?? 0, usd: l?.usd ?? 0, nivel: l?.nivel ?? null }) },
    anotarWeb(w) { llamadasWeb.push(w ?? {}) },
    anotarInvestigacion(i) { investigaciones.push(i) },
    anotarNivel(n) { niveles.push(n); if (n && !esNivelDeModelo(n)) deterministicas += 1 },
    anotarMs(x) { ms += Number(x) || 0 },
    /** Un nivel de modelo que NO se llamó porque el trabajo era determinístico. Se guarda para que
     *  la corrida pueda mostrar cuántas veces el fast path le ahorró un token al OS, y por qué. */
    anotarProhibida(p) { prohibidas.push(p) },
    get decisionesDeterministicas() { return deterministicas },

    /**
     * EL CRUCE ENTRE LO DECLARADO Y LO QUE SALIÓ POR LA RED. Sin medidor no hay cruce y se dice —
     * `medidas: null` es «no se pudo mirar», que no es «no hubo».
     */
    conciliacion() {
      if (!medidor) {
        return Object.freeze({
          declaradas: llamadasLLM.length, medidas: null, noDeclaradas: null, total: llamadasLLM.length,
          cuadra: null, porQue: 'esta corrida no instaló el medidor de transporte: el único número que hay es el declarado, y un declarado sin contraste no prueba que no hubo más',
        })
      }
      return conciliarLLM({ declaradas: llamadasLLM.length, medidas: medidor.instantanea().total })
    },

    /**
     * Lo que se le pasa tal cual a `metricasDeCorrida`.
     *
     * ═══ POR QUÉ `llamadasLLM` NO ES SÓLO LO DECLARADO ═══
     *
     * Hay DOS formas de que el costo de una corrida salga más bajo de lo que el proveedor factura, y
     * las dos se taparon acá porque las dos aparecieron al probar:
     *
     *   1. UNA LLAMADA QUE NADIE DECLARÓ. El resolvedor la hizo por fuera del fast path, o el fast
     *      path no la vio. Entra igual: la lista informada nunca es más corta que lo que midió el
     *      transporte.
     *   2. UNA LLAMADA DECLARADA CON CEROS. Es la que encontró el test: `consultarNivel` anota
     *      `{...salida.uso}` y un resolvedor que no devuelve `uso` deja `tokensIn: 0, usd: 0`. El
     *      CONTEO quedaba bien y la PLATA quedaba en cero — el mismo defecto que el control que era
     *      una constante, un piso más abajo.
     *
     * La regla es una sola y se aplica campo por campo: se informa el MAYOR entre lo declarado y lo
     * medido. Un contador de gasto sólo puede equivocarse para arriba.
     */
    paraMetricas() {
      const medidas = medidor ? medidor.instantanea().llamadas : []
      const cuantas = Math.max(llamadasLLM.length, medidas.length)
      const mayor = (a, b) => Math.max(Number(a) || 0, Number(b) || 0)
      const unidas = Array.from({ length: cuantas }, (_, i) => {
        const d = llamadasLLM[i] ?? {}
        const m = medidas[i] ?? {}
        return {
          tokensIn: mayor(d.tokensIn, m.tokensIn),
          tokensOut: mayor(d.tokensOut, m.tokensOut),
          usd: mayor(d.usd, m.usd),
          nivel: d.nivel ?? m.nivel ?? null,
        }
      })
      return {
        llamadasLLM: unidas,
        llamadasWeb: [...llamadasWeb],
        investigaciones: [...investigaciones],
        nivelesDeFastPath: [...niveles],
        decisionesDeterministicas: deterministicas,
        cache: cache ? cache.contadores() : SIN_CACHE,
        msFrio: ms || null,
      }
    },
  }
}

/** Lo que devuelve un resolvedor de nivel que sí tenía la respuesta. PURA. */
export const resuelveNivel = ({ valor, unidad = null, fuente = null, evidencia = null, porQue = null, extra = null }) =>
  ({ resuelto: true, valor, unidad, fuente, evidencia, porQue, extra })

/** Lo que devuelve un nivel que se consultó y no tenía. PURA. */
export const noResuelveNivel = (porQue) => ({ resuelto: false, porQue })

/**
 * RESOLVER POR EL FAST PATH. Recorre los nueve niveles en orden y se detiene en el primero que
 * responde.
 *
 * Lo que garantiza, y por qué cada garantía existe:
 *
 *   · Un nivel de MODELO con el proveedor no disponible NO SE LLAMA. No se llama y falla: no se
 *     llama. Un `try/catch` alrededor de una llamada que igual sale es un gasto con un vendaje.
 *   · Un nivel que TIRA no rompe la corrida: se anota `ERROR` con su motivo y se sigue al
 *     siguiente. Es lo que hace que un proveedor que se cae EN MEDIO de la corrida —el caso real,
 *     no el de configuración— no se lleve puesto todo lo determinístico que faltaba.
 *   · Todo lo que resuelve por debajo de CACHE se GUARDA en el caché, con la huella de sus
 *     entradas: la próxima corrida idéntica lo encuentra, y una con una entrada distinta no.
 *   · El recorrido completo vuelve siempre, resuelva donde resuelva.
 */
export async function resolverPorFastPath({
  pregunta, entradas = {}, resolvedores = {}, cache = null, proveedor = SIN_PROVEEDOR,
  registro = null, research = null, clase = null, ahora = () => Date.now(),
} = {}) {
  const recorrido = []
  const t0 = ahora()
  const determinista = esDeterministica({ clase, pregunta })

  for (const nivel of FAST_PATH) {
    // ═══ LA REGLA QUE NO SE CRUZA ═══
    // Va ANTES que la disponibilidad del proveedor a propósito: que hoy no haya modelo no es el
    // motivo por el que una suma no se le pregunta a un modelo. Con saldo y proveedor vivo la
    // respuesta tiene que ser la misma, y así es como se prueba.
    if (nivel.usaModelo && determinista.si) {
      recorrido.push({ nivel: nivel.id, estado: 'PROHIBIDO', porQue: `${determinista.clase}: ${determinista.porQue}` })
      registro?.anotarProhibida({ nivel: nivel.id, pregunta, clase: determinista.clase, como: determinista.como, porQue: determinista.porQue })
      continue
    }
    if (nivel.usaModelo && !proveedor.disponible) {
      recorrido.push({ nivel: nivel.id, estado: 'SALTADO', porQue: proveedor.porQue })
      continue
    }

    const salida = await consultarNivel({ nivel, pregunta, entradas, resolvedores, cache, research, registro, proveedor, recorrido })
    if (salida === null) continue

    recorrido.push({ nivel: nivel.id, estado: 'RESUELVE', porQue: salida.porQue ?? null })
    registro?.anotarNivel(nivel.id)
    registro?.anotarMs(ahora() - t0)

    // Se guarda todo lo que costó más que una lectura de caché, CON EL NIVEL DE ORIGEN puesto: es
    // lo que después le permite al caché saber que una respuesta suya venía de estado vivo.
    // El CACHE no se reescribe a sí mismo.
    if (cache && nivel.id !== NIVEL.CACHE) {
      cache.escribir({ pregunta, entradas, productor: 'fast-path' }, { ...salida, nivelOrigen: nivel.id })
    }

    return Object.freeze({
      pregunta,
      resuelto: true,
      nivel: nivel.id,
      usoModelo: nivel.usaModelo,
      valor: salida.valor ?? null,
      unidad: salida.unidad ?? null,
      fuente: salida.fuente ?? nivel.fuente ?? null,
      evidencia: salida.evidencia ?? null,
      requiereHumano: Boolean(salida.requiereHumano),
      deCache: nivel.id === NIVEL.CACHE,
      // De qué nivel salió ORIGINALMENTE. Sin esto, una respuesta servida del caché se ve idéntica
      // a una recién calculada y la distribución por escalón contaría CACHE donde hubo un SELECT.
      nivelOrigen: nivel.id === NIVEL.CACHE ? (salida.nivelOrigen ?? null) : nivel.id,
      determinista: Object.freeze(determinista),
      extra: salida.extra ?? null,
      recorrido: Object.freeze(recorrido),
      ms: ahora() - t0,
    })
  }

  registro?.anotarNivel(null)
  registro?.anotarMs(ahora() - t0)
  return Object.freeze({
    pregunta,
    resuelto: false,
    nivel: null,
    usoModelo: false,
    valor: null,
    unidad: null,
    fuente: FUENTE.FALTA_DATO,
    evidencia: null,
    // Si los nueve niveles fallaron, el que sigue es una persona. Se dice acá para que el llamador
    // no tenga que inferirlo de un `resuelto: false`, que también podría ser un error transitorio.
    requiereHumano: true,
    deCache: false,
    nivelOrigen: null,
    determinista: Object.freeze(determinista),
    extra: null,
    recorrido: Object.freeze(recorrido),
    ms: ahora() - t0,
  })
}

/**
 * CONSULTAR UN NIVEL. Devuelve la salida si resolvió, o `null` si no —anotando el motivo en el
 * recorrido, que se muta acá a propósito: es el único lugar que sabe por qué no resolvió.
 */
async function consultarNivel({ nivel, pregunta, entradas, resolvedores, cache, research, registro, proveedor, recorrido }) {
  // ── CACHE: no lo cablea el llamador, lo maneja el fast path ──
  if (nivel.id === NIVEL.CACHE) {
    if (!cache) { recorrido.push({ nivel: nivel.id, estado: 'SIN_RESOLVEDOR', porQue: 'no hay caché en esta corrida' }); return null }
    const r = cache.leer({ pregunta, entradas, productor: 'fast-path' })
    if (!r.hit) { recorrido.push({ nivel: nivel.id, estado: 'NO_RESUELVE', porQue: `no estaba en el caché (${r.motivo})` }); return null }
    // ═══ EL CACHÉ NO SIRVE ESTADO VIVO SIN AUTORIZACIÓN ═══
    // Es la contrapartida de haber puesto el caché primero. Una respuesta que salió de SQL es una
    // foto de la base en otro momento; servirla sin que nadie haya dicho cuánta antigüedad tolera
    // es exactamente el defecto que este repo ya midió —el lector que servía la respuesta del
    // código viejo—, sólo que del lado de los datos en vez del código.
    if (r.valor?.nivelOrigen === NIVEL.SQL && !cache.tieneTtl) {
      recorrido.push({ nivel: nivel.id, estado: 'NO_RESUELVE', porQue: 'estaba en el caché pero salió de SQL —estado vivo— y este caché no declara `ttlMs`: sin una antigüedad tolerada declarada, se vuelve a consultar' })
      return null
    }
    return { ...r.valor, porQue: 'ya se había resuelto con estas mismas entradas y esta misma versión' }
  }

  // ── RESEARCH: es la cascada del §12 entera, no un resolvedor suelto ──
  if (nivel.id === NIVEL.RESEARCH) {
    if (!research) { recorrido.push({ nivel: nivel.id, estado: 'SIN_RESOLVEDOR', porQue: 'no hay research cableado' }); return null }
    const inv = await investigarHueco({ pregunta, entradas, ...research, permitirModelo: research.permitirModelo && proveedor.disponible })
    registro?.anotarInvestigacion(inv)
    if (inv.resueltoEn === PASO.WEB) registro?.anotarWeb({ pregunta, url: inv.url })
    if (!inv.resueltoEn) { recorrido.push({ nivel: nivel.id, estado: 'NO_RESUELVE', porQue: 'la cascada del §12 se recorrió entera y ninguna fuente lo tiene' }); return null }
    return {
      valor: inv.dato?.valor ?? null, unidad: inv.dato?.unidad ?? null, fuente: inv.dato?.fuente ?? null,
      evidencia: inv.dato?.evidencia ?? null, porQue: `investigado y resuelto en ${inv.resueltoEn}`, extra: inv,
    }
  }

  const r = resolvedores[nivel.id]
  if (typeof r !== 'function') { recorrido.push({ nivel: nivel.id, estado: 'SIN_RESOLVEDOR', porQue: `no hay con qué consultar ${nivel.que}` }); return null }

  let salida
  try {
    salida = await r({ pregunta, entradas })
  } catch (e) {
    // El caso real: el proveedor se cae EN MEDIO de la corrida. Se anota y se sigue — lo que ya
    // estaba resuelto no se pierde y lo que faltaba se intenta por otro lado.
    recorrido.push({ nivel: nivel.id, estado: 'ERROR', porQue: String(e?.message ?? e).slice(0, 200) })
    return null
  }
  if (nivel.usaModelo && salida?.resuelto) registro?.anotarLLM({ ...salida.uso, nivel: nivel.id })
  if (!salida?.resuelto) { recorrido.push({ nivel: nivel.id, estado: 'NO_RESUELVE', porQue: salida?.porQue ?? `${nivel.que} no tiene este dato` }); return null }
  return salida
}

export { crearCache }
