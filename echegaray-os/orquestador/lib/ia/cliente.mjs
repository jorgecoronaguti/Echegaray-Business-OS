// LA PUERTA ÚNICA DEL OS HACIA UN MODELO — el Intelligence Layer, en un archivo.
//
// ═══ POR QUÉ EXISTE (25/08/2026) ═══
//
// Auditado ese día: CUATRO caminos distintos hablaban con un modelo. Uno pasaba por el port
// (`engines/anthropic-api.mjs`, con SDK, tool-use, costo y estado). Los otros tres llamaban a
// `api.anthropic.com` con `fetch` crudo:
//
//   · `lib/comprobantes/vision.mjs`         leer el comprobante que llega por el chat
//   · `comunicacion/razonar-ruteo.mjs`      a qué especialista va el mensaje
//   · `comunicacion/asistente/interpretar.mjs`  qué está pidiendo la persona
//
// Los tres tenían su propia variable de modelo, su propio manejo de error y NINGUNO:
//   · consultaba ni marcaba `estado-cerebro` → el OS podía quedarse sin saldo y seguir intentando;
//   · registraba costo → leer 900 comprobantes con `claude-opus-5` no figuraba en ninguna tabla;
//   · distinguía un 429 pasajero de una credencial vencida (los dos devolvían `null`).
//
// ═══ LO QUE ESTA PUERTA GARANTIZA, Y ES TODO EL PUNTO ═══
//
// AGENTE ≠ MODELO. Quien pide declara QUÉ CAPACIDAD necesita y QUIÉN es —agente y función—, nunca un
// modelo ni un proveedor. Cambiar de modelo, o de proveedor, no toca una línea del caller y **no
// cambia sus permisos**: las herramientas y los límites de un agente viven en `orq.agents`, del lado
// del OS, y esta puerta jamás los lee ni los otorga.
//
// ═══ REINTENTOS: ACOTADOS, Y SÓLO DE LO QUE SE PUEDE REINTENTAR ═══
//
// Un 429 o un 5xx se reintentan con espera creciente y un tope duro. Un 400 mal armado NO: es un bug
// nuestro y reintentarlo lo esconde, gasta cuota y deja el defecto vivo. Un 402 tampoco: no hay
// espera que devuelva el saldo — ahí el OS DEGRADA y lo dice.

import { CAPACIDAD, modeloPara, normalizarCapacidad } from './capacidad.mjs'
import { apagaElRazonador as apagaElRazonadorLocal, clasificarError } from './clasificar-error.mjs'
import { anthropic } from './proveedores/anthropic.mjs'

export { CAPACIDAD }
export { clasificarError, clasificarRespuesta, apagaElRazonador } from './clasificar-error.mjs'

/**
 * AVISARLE AL OS QUE EL RAZONADOR NO PUEDE — para los caminos que conservan su propio `fetch`.
 *
 * `vision.mjs` es el caso: tiene un reintento con el cuerpo pelado ante un 400 y sabe leer
 * `stop_reason: max_tokens`, dos cosas que no son de la puerta sino de leer un comprobante. En vez
 * de arrastrarlas acá o de perderlas, ese camino sigue con su llamada y usa estas dos funciones —la
 * clasificación, el registro y el estado son lo que tenía que compartirse, no el `fetch`.
 */
export async function avisarEstado(clasificacion) {
  if (!apagaElRazonadorLocal(clasificacion)) return
  const ec = await estadoCerebro()
  await ec?.marcarSinCredito?.(`${clasificacion.kind} ${clasificacion.status ?? ''}`).catch?.(() => {})
}

/** Los proveedores que el OS sabe usar, en orden de preferencia. Hoy hay uno; el orden ya existe
 *  para que sumar el segundo sea agregarlo a esta lista y nada más. */
const PROVEEDORES = [anthropic]

const TOPE_REINTENTOS = Math.min(4, Math.max(0, Number(process.env.ORQ_IA_REINTENTOS ?? 2)))
const ESPERA_BASE_MS = Number(process.env.ORQ_IA_ESPERA_MS ?? 700)

const dormir = (ms) => new Promise((r) => setTimeout(r, ms))

/** Carga perezosa: este módulo lo importan scripts que no siempre tienen base ni config. */
async function estadoCerebro() {
  try { return await import('../estado-cerebro.mjs') } catch { return null }
}
async function config() {
  try { return (await import('../config.mjs')).loadConfig() } catch { return {} }
}
async function precio(modeloId, tokens) {
  try {
    const { estimateCostUsd } = await import('../../engines/anthropic-api.mjs')
    return estimateCostUsd(modeloId, { input_tokens: tokens?.in ?? 0, output_tokens: tokens?.out ?? 0 })
  } catch { return null }
}

/**
 * DEJA CONSTANCIA DE LA LLAMADA — también cuando falla.
 *
 * Una llamada fallida consumió cuota y tiempo; borrarla del registro haría parecer que el proveedor
 * nunca falla. Nunca guarda el prompt ni la respuesta: acá va cuánto costó, no qué se dijo.
 * No lanza jamás: que la telemetría falle no puede tumbar la operación que la produjo.
 */
export async function registrarUso(fila) {
  try {
    const { query } = await import('../db.mjs')
    await query(
      `insert into orq.chat_cost (model, usd, rol, motivo, agente, funcion, proveedor, capacidad,
                                  tokens_in, tokens_out, ms, ok, error_kind, fallback_de)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        fila.modelo, fila.usd, fila.agente ?? null, fila.funcion ?? null,
        fila.agente ?? null, fila.funcion ?? null, fila.proveedor, fila.capacidad,
        fila.tokensIn, fila.tokensOut, fila.ms, fila.ok, fila.errorKind ?? null, fila.fallbackDe ?? null,
      ],
    )
  } catch { /* la telemetría nunca decide si el OS funciona */ }
}

/**
 * PEDIR UN TEXTO A UN MODELO. La única forma correcta de hacerlo en todo el OS.
 *
 * @param capacidad  CAPACIDAD.SIMPLE | NORMAL | COMPLEX — qué tan difícil es, no qué modelo.
 * @param agente     quién pide: el slug de `orq.agents`, o el circuito («comprobantes», «ruteo»).
 * @param funcion    qué se está haciendo dentro de ese agente («leer-comprobante»).
 * @param modelo     escotilla para las variables de entorno que el dueño ya usa. Queda registrada.
 * @returns { texto, modelo, proveedor, tokens, usd, ms, intentos }
 * @throws  el último error, con `.clasificacion` puesta.
 */
export async function pedirTexto({
  capacidad = CAPACIDAD.NORMAL,
  sistema = null,
  mensajes,
  maxTokens = 1024,
  temperatura,
  agente = null,
  funcion = null,
  modelo = null,
  apiKey = process.env.ANTHROPIC_API_KEY,
  fetchImpl = globalThis.fetch,
  señal,
  reintentos = TOPE_REINTENTOS,
  logger = null,
} = {}) {
  const cap = normalizarCapacidad(capacidad)
  const alias = modeloPara(cap, modelo)
  const cfg = await config()
  const t0 = Date.now()

  let ultimo = null
  let fallbackDe = null

  for (const proveedor of PROVEEDORES) {
    if (!proveedor.configurado(apiKey)) {
      ultimo = Object.assign(new Error(`${proveedor.nombre}: sin credencial`), { clasificacion: { kind: 'auth', hard: true, reintentable: false } })
      continue
    }
    const modeloId = proveedor.idDeModelo(alias, cfg)

    for (let intento = 0; intento <= reintentos; intento++) {
      try {
        const r = await proveedor.completar({
          modelo: modeloId, sistema, mensajes, maxTokens, temperatura, señal, apiKey, fetchImpl,
        })
        const ms = Date.now() - t0
        const usd = await precio(r.modeloUsado, r.tokens)
        await registrarUso({
          modelo: r.modeloUsado, usd, agente, funcion, proveedor: proveedor.nombre, capacidad: cap,
          tokensIn: r.tokens?.in ?? null, tokensOut: r.tokens?.out ?? null, ms, ok: true, fallbackDe,
        })
        // Una respuesta buena es la prueba de que hay saldo: si el OS estaba degradado, vuelve.
        const ec = await estadoCerebro()
        ec?.marcarCerebroOk?.().catch?.(() => {})
        return { texto: r.texto, modelo: r.modeloUsado, proveedor: proveedor.nombre, tokens: r.tokens, usd, ms, intentos: intento + 1 }
      } catch (err) {
        const c = clasificarError(err)
        err.clasificacion = c
        ultimo = err
        logger?.warn?.('ia: falló la llamada', { proveedor: proveedor.nombre, modelo: modeloId, kind: c.kind, status: c.status, intento })

        if (apagaElRazonadorLocal(c)) {
          const ec = await estadoCerebro()
          ec?.marcarSinCredito?.(`${c.kind} ${c.status ?? ''}`).catch?.(() => {})
        }
        await registrarUso({
          modelo: modeloId, usd: null, agente, funcion, proveedor: proveedor.nombre, capacidad: cap,
          tokensIn: null, tokensOut: null, ms: Date.now() - t0, ok: false, errorKind: c.kind, fallbackDe,
        })

        // Sólo se reintenta lo reintentable, y nunca sin tope: un bucle infinito contra un
        // proveedor caído es peor que devolver el error.
        if (!c.reintentable || intento === reintentos) break
        await dormir(ESPERA_BASE_MS * 2 ** intento)
      }
    }
    // Este proveedor no pudo. El siguiente —cuando exista— atiende como fallback y queda anotado.
    fallbackDe = proveedor.nombre
  }

  throw ultimo ?? Object.assign(new Error('ia: ningún proveedor configurado'), { clasificacion: { kind: 'auth', hard: true, reintentable: false } })
}

/**
 * LO MISMO, PERO SIN LANZAR. Para los caminos que ya degradaban solos devolviendo `null` —el ruteo y
 * la interpretación—, que prefieren seguir sin modelo antes que romper la conversación.
 *
 * Devuelve `null` igual que antes, pero ahora el motivo quedó clasificado, registrado y, si era
 * saldo, el OS entero se enteró.
 */
export async function pedirTextoONull(opciones) {
  try {
    return (await pedirTexto(opciones)).texto
  } catch {
    return null
  }
}
