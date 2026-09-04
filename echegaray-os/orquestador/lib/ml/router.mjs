// EL ROUTER DE LA CAPA ML. LOS MÓDULOS PIDEN UNA CAPACIDAD; ACÁ SE DECIDE CÓMO SE RESUELVE.
//
// ═══ LA REGLA QUE GOBIERNA TODO ═══
//
//   determinístico → estadística → ML local → HF especializado → Claude
//
// Siempre la solución más barata, rápida y reproducible CAPAZ DE RESOLVER BIEN la tarea. No la más
// nueva. Claude recibe únicamente lo que de verdad necesita razonamiento — y eso no es un ahorro:
// es que un cálculo que puede dar el mismo resultado dos veces no debería depender de un modelo.
//
// ═══ POR QUÉ ES UN REGISTRO DE SOLUCIONADORES Y NO UN if/else ═══
//
// El router NO conoce ningún modelo. Conoce la escalera, la política de datos y el contrato de
// respuesta. Cada fase siguiente —embeddings, entity resolution, anomalías, forecast— enchufa su
// solucionador en el escalón que le corresponde y el router no cambia. Es la misma disciplina que
// `lib/ia/`: quien pide declara QUÉ necesita, no CÓMO se hace.
//
// ═══ Y POR QUÉ UNA CAPACIDAD SIN SOLUCIONADOR NO ES UN ERROR ═══
//
// Devuelve `SIN_RESOLVER` con el motivo. Un módulo que llama a `forecast()` antes de que exista el
// motor tiene que poder seguir funcionando con su cálculo de siempre, no romperse. Es la regla de
// degradación del OS: nunca bloquear Finanzas u Obras porque una capa nueva no está lista.

import { randomUUID } from 'node:crypto'
import { METODO, ESCALERA, resultado, sinResolver } from './resultado.mjs'
import { metodosPermitidos, sensibilidadDe } from './politica.mjs'

/** Las capacidades que el router expone. El nombre es el contrato con los módulos. */
export const CAPACIDADES = Object.freeze([
  'resolveEntity', 'embed', 'semanticSearch', 'rerank', 'classify', 'extractDocument',
  'detectAnomaly', 'forecast', 'transcribe', 'analyzeImage', 'escalateToClaude',
])

/** capacidad → [{ metodo, fn, nombre }], en el orden de la escalera. */
const SOLUCIONADORES = new Map()

/**
 * Enchufa un solucionador. Lo llaman las fases siguientes, no los módulos de negocio.
 *
 * @param {string} capacidad una de CAPACIDADES
 * @param {string} metodo uno de METODO — define en qué escalón entra
 * @param {Function} fn async (entrada, ctx) => resultado(...) | null si no puede
 */
export function registrarSolucionador(capacidad, metodo, fn, { nombre = null } = {}) {
  if (!CAPACIDADES.includes(capacidad)) throw new Error(`capacidad desconocida: «${capacidad}»`)
  if (!Object.values(METODO).includes(metodo)) throw new Error(`método desconocido: «${metodo}»`)
  const lista = SOLUCIONADORES.get(capacidad) ?? []
  lista.push({ metodo, fn, nombre: nombre ?? `${capacidad}:${metodo}` })
  lista.sort((a, b) => ESCALERA.indexOf(a.metodo) - ESCALERA.indexOf(b.metodo))
  SOLUCIONADORES.set(capacidad, lista)
  return () => { // para los tests: desenchufar
    const l = SOLUCIONADORES.get(capacidad) ?? []
    SOLUCIONADORES.set(capacidad, l.filter((x) => x.fn !== fn))
  }
}

/** Qué hay enchufado hoy. Para el health check y para no adivinar qué está vivo. */
export function solucionadores() {
  return [...SOLUCIONADORES.entries()].map(([cap, l]) => ({ capacidad: cap, escalones: l.map((x) => `${x.metodo}(${x.nombre})`) }))
}

/** Sólo para tests. */
export function limpiarSolucionadores() { SOLUCIONADORES.clear() }

const METODO_PROVEEDOR = {
  [METODO.HF_REMOTO]: 'huggingface',
  [METODO.CLAUDE]: 'anthropic',
}

/**
 * EL NÚCLEO. Recorre la escalera de una capacidad, saltando lo que la política prohíbe, y devuelve
 * la PRIMERA respuesta que resuelve.
 *
 * `dominio` no es opcional: sin él no se puede decidir qué puede salir de la empresa, y un default
 * cómodo sería exactamente el agujero que la política existe para tapar.
 */
export async function resolver(capacidad, entrada, { dominio, permitidoExplicitamente = false, hasta = null, traceId = null, ...ctx } = {}) {
  if (!CAPACIDADES.includes(capacidad)) throw new Error(`capacidad desconocida: «${capacidad}»`)
  if (!dominio) throw new Error(`«${capacidad}» necesita un dominio: sin él no se puede decidir qué dato puede salir de la empresa`)

  const tid = traceId ?? randomUUID()
  const permiso = metodosPermitidos(dominio, { permitidoExplicitamente })
  const lista = SOLUCIONADORES.get(capacidad) ?? []
  const techo = hasta ? ESCALERA.indexOf(hasta) : ESCALERA.length - 1
  const saltados = []
  let intentados = 0

  for (const s of lista) {
    if (ESCALERA.indexOf(s.metodo) > techo) { saltados.push(`${s.nombre}: por encima del techo pedido (${hasta})`); continue }
    if (s.metodo === METODO.HF_REMOTO && !permiso.hfRemoto) { saltados.push(`${s.nombre}: la política no deja salir «${dominio}» a Hugging Face`); continue }
    if (s.metodo === METODO.CLAUDE && !permiso.claude) { saltados.push(`${s.nombre}: la política no deja salir «${dominio}» a Claude`); continue }

    const t0 = Date.now()
    let r
    try {
      r = await s.fn(entrada, { ...ctx, dominio, traceId: tid })
    } catch (e) {
      // UN ESCALÓN QUE SE CAE NO TUMBA LA CADENA. Es el punto entero de tener escalera: si el
      // modelo local falla, todavía queda el de abajo. Se anota y se sigue.
      saltados.push(`${s.nombre}: falló (${e.message.slice(0, 80)})`)
      continue
    }
    intentados++
    if (!r || r.valor == null) { saltados.push(`${s.nombre}: no pudo resolverlo`); continue }
    // ═══ LA FORMA LA GARANTIZA EL ROUTER, NO EL SOLUCIONADOR (04/09/2026) ═══
    // Un solucionador puede devolver `{valor, confianza, porQue}` y nada más — es lo cómodo de
    // escribir. Si el router reenviara ese objeto tal cual, `accion` llegaría `undefined` al módulo
    // que decide, y un `undefined` no es «descartar»: es una respuesta sin regla, que es peor que
    // no tenerla. Por eso todo pasa por `resultado()`, que deriva `accion` de la confianza y el
    // método. La primera prueba de este archivo salió con ese defecto.
    const base = resultado({
      valor: r.valor,
      confianza: r.confianza,
      metodo: r.metodo ?? s.metodo,
      modelo: r.modelo ?? null,
      proveedor: r.proveedor ?? METODO_PROVEEDOR[s.metodo] ?? 'local',
      ms: r.ms ?? Date.now() - t0,
      costoUsd: r.costoUsd ?? null,
      huboFallback: Boolean(r.huboFallback) || intentados > 1,
      porQue: r.porQue ?? null,
      evidencia: r.evidencia ?? null,
      traceId: tid,
    })
    return { ...base, capacidad, sensibilidad: sensibilidadDe(dominio), saltados }
  }

  return {
    ...sinResolver(
      lista.length
        ? `ningún escalón resolvió «${capacidad}»`
        : `«${capacidad}» todavía no tiene solucionador enchufado — el módulo tiene que seguir con su cálculo de siempre`,
      { traceId: tid }),
    sensibilidad: sensibilidadDe(dominio),
    saltados,
  }
}

// ── LAS ONCE OPERACIONES ──
// Son azúcar sobre `resolver`: existen para que un módulo escriba `mlRouter.classify(...)` y no
// tenga que acordarse del nombre de una capacidad como string.
const op = (capacidad) => (entrada, opts = {}) => resolver(capacidad, entrada, opts)

export const resolveEntity = op('resolveEntity')
export const embed = op('embed')
export const semanticSearch = op('semanticSearch')
export const rerank = op('rerank')
export const classify = op('classify')
export const extractDocument = op('extractDocument')
export const detectAnomaly = op('detectAnomaly')
export const forecast = op('forecast')
export const transcribe = op('transcribe')
export const analyzeImage = op('analyzeImage')
export const escalateToClaude = (entrada, opts = {}) => resolver('escalateToClaude', entrada, { ...opts, hasta: METODO.CLAUDE })

export default {
  resolver, registrarSolucionador, solucionadores,
  resolveEntity, embed, semanticSearch, rerank, classify, extractDocument,
  detectAnomaly, forecast, transcribe, analyzeImage, escalateToClaude,
}
