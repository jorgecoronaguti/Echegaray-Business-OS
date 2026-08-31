// CLAUDE NO ES UNA DEPENDENCIA (§13).
//
// ═══ QUÉ ES ESTE ARCHIVO ═══
//
// El orden explícito y medible en que XSAS intenta resolver cualquier cosa antes de gastar un
// token. Nueve niveles, de más barato y más confiable a más caro y más blando:
//
//   CODE → SQL → CACHE → BASE MAESTRA → EXPERIENCIA ECSAS → BIBLIOTECA TÉCNICA → RESEARCH →
//   MODELO BARATO → MODELO POTENTE
//
// Los SIETE primeros no tocan un modelo. Los dos últimos son los únicos que lo hacen, y sólo para
// razonamiento realmente nuevo o ambiguo. Con el proveedor muerto, esos dos se saltan ANOTADOS y
// los otros siete siguen funcionando igual: eso es lo que significa que Claude no sea dependencia.
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
// El nivel CACHE está TERCERO y no primero a propósito: una respuesta cacheada es más barata que
// una consulta a la Base Maestra, pero un cálculo de código y una consulta SQL son la VERDAD del
// momento, y el caché es una verdad de antes. Cuando las dos están disponibles gana la de ahora.

import { crearCache, SIN_CACHE } from './cache.mjs'
import { investigarHueco, PASO } from './research.mjs'
import { FUENTE } from '../plano/fuente.mjs'

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
  { id: NIVEL.CODE, que: 'una función determinística del OS: una cuenta, una conversión, una regla escrita', usaModelo: false, fuente: FUENTE.CALCULADO },
  { id: NIVEL.SQL, que: 'una consulta a Postgres: el estado de ahora, no una copia', usaModelo: false, fuente: FUENTE.BASE_MAESTRA },
  { id: NIVEL.CACHE, que: 'algo que ya se resolvió con estas mismas entradas y esta misma versión', usaModelo: false, fuente: null },
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

/**
 * EL REGISTRO DE UNA CORRIDA. No es puro —acumula—, pero sólo acumula lo que le declaran: nada acá
 * se deduce del resultado final, que es como se fabricó el 100 % falso que este frente vino a
 * arreglar. Lo consume `metricas.mjs`.
 */
export function crearRegistro({ cache = null } = {}) {
  const llamadasLLM = []
  const llamadasWeb = []
  const investigaciones = []
  const niveles = []
  let deterministicas = 0
  let ms = 0

  return {
    llamadasLLM, llamadasWeb, investigaciones, niveles,
    anotarLLM(l) { llamadasLLM.push({ tokensIn: l?.tokensIn ?? 0, tokensOut: l?.tokensOut ?? 0, usd: l?.usd ?? 0, nivel: l?.nivel ?? null }) },
    anotarWeb(w) { llamadasWeb.push(w ?? {}) },
    anotarInvestigacion(i) { investigaciones.push(i) },
    anotarNivel(n) { niveles.push(n); if (n && !esNivelDeModelo(n)) deterministicas += 1 },
    anotarMs(x) { ms += Number(x) || 0 },
    get decisionesDeterministicas() { return deterministicas },
    /** Lo que se le pasa tal cual a `metricasDeCorrida`. */
    paraMetricas() {
      return {
        llamadasLLM: [...llamadasLLM],
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
  registro = null, research = null, ahora = () => Date.now(),
} = {}) {
  const recorrido = []
  const t0 = ahora()

  for (const nivel of FAST_PATH) {
    if (nivel.usaModelo && !proveedor.disponible) {
      recorrido.push({ nivel: nivel.id, estado: 'SALTADO', porQue: proveedor.porQue })
      continue
    }

    const salida = await consultarNivel({ nivel, pregunta, entradas, resolvedores, cache, research, registro, proveedor, recorrido })
    if (salida === null) continue

    recorrido.push({ nivel: nivel.id, estado: 'RESUELVE', porQue: salida.porQue ?? null })
    registro?.anotarNivel(nivel.id)
    registro?.anotarMs(ahora() - t0)

    // Se guarda todo lo que costó más que una lectura de caché. El CACHE no se reescribe a sí mismo.
    if (cache && nivel.id !== NIVEL.CACHE) cache.escribir({ pregunta, entradas, productor: 'fast-path' }, salida)

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
