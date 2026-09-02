// EL FUSIBLE DEL GASTO ANTHROPIC — ninguna llamada paga sale sin pasar por acá.
//
// ═══ POR QUÉ EXISTE (02/09/2026) ═══
//
// La corrida de La Estrella lo demostró con plata: un pedido abandonado siguió 45 minutos y 119
// llamadas de visión ($15,40) sin que nadie escuchara, porque no había tope por ejecución, la
// cancelación del cliente no llegaba al pipeline, y el único límite de visión era POR LÁMINA.
// Auditoría completa: `docs/xsas/AUDITORIA-CONSUMO-API-CODE.md`.
//
// ═══ LAS TRES CERRADURAS ═══
//
// 1. BLOQUEO POR DEFECTO. Sin `ORQ_IA_PERMITIR` no sale ninguna llamada paga: los scripts, los
//    tests y el desarrollo corren con la API apagada y degradan declarando (MODEL_DISABLED /
//    FALTA_DATO), nunca simulando. En una sesión de Claude Code (`CLAUDECODE=1`) ni siquiera
//    alcanza con heredar el env de producción: hace falta `ORQ_IA_PERMITIR=claude-code-explicito`,
//    escrito a mano. Producción habilita con la variable en el env que cargan sus servicios.
//
// 2. PRESUPUESTO POR EJECUCIÓN. Cada pedido corre dentro de `conPresupuesto(...)` (lo arma el
//    servidor HTTP) y acumula llamadas, llamadas de visión, USD y tiempo. Alcanzado un límite, la
//    SIGUIENTE llamada no sale: lo ya obtenido se conserva y el corte queda registrado. El contador
//    vive en el presupuesto y JAMÁS se reinicia por retry ni fallback. Un caller que nadie envolvió
//    no queda libre: cae en el presupuesto global del proceso, que se renueva por hora.
//
// 3. UNA CORRIDA VIVA POR OBJETIVO. `conCorridaExclusiva('plano:quattropani', fn)` impide que dos
//    corridas pagas equivalentes corran a la vez y dupliquen gasto.
//
// La protección es CÓDIGO, no una instrucción: los cuatro llamadores de Anthropic del repo
// (cliente/proveedor, visión de comprobantes, engine SDK, sonda) atraviesan este módulo, y un test
// de invariante caza cualquier llamador nuevo que no lo importe.

import { AsyncLocalStorage } from 'node:async_hooks'

const num = (v, def) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : def }

/** Los límites por ejecución. Defaults salidos de la auditoría: Quattropani entero entra
 *  (~25-30 llamadas de visión); La Estrella en frío (119) se corta a un tercio. */
export function limitesDelEntorno(env = process.env) {
  return {
    maxLlamadas: num(env.ORQ_IA_MAX_LLAMADAS, 80),
    maxVision: num(env.ORQ_IA_MAX_VISION, 40),
    maxUsd: num(env.ORQ_IA_MAX_USD, 5),
    maxMs: num(env.ORQ_IA_MAX_MS, 300_000),
  }
}

/** El corte del fusible. `limite` dice QUÉ cortó: bloqueada · cancelado · runtime · llamadas ·
 *  vision · usd. Se clasifica duro y no-reintentable: reintentar un corte sería quemarlo de nuevo. */
export class FusibleCorto extends Error {
  constructor(limite, detalle = '') {
    super(`fusible ${limite}${detalle ? ` — ${detalle}` : ''}`)
    this.limite = limite
    this.clasificacion = { kind: `fusible_${limite}`, hard: true, reintentable: false }
  }
}

export class CorridaDuplicada extends Error {
  constructor(clave) {
    super(`ya hay una corrida viva de «${clave}»: correrla de nuevo duplicaría el gasto`)
    this.clave = clave
  }
}

/**
 * ¿La API paga está bloqueada? Devuelve el MOTIVO (string) o null si puede salir.
 * No borra keys ni simula nada: sólo decide si la llamada sale.
 */
export function iaBloqueada(env = process.env) {
  if (env.ORQ_IA_BLOQUEADA) return 'apagada a mano (ORQ_IA_BLOQUEADA)'
  const permiso = String(env.ORQ_IA_PERMITIR ?? '').trim()
  if (!permiso) return 'la API paga está apagada por defecto: falta ORQ_IA_PERMITIR'
  if (env.CLAUDECODE && permiso !== 'claude-code-explicito') {
    return 'sesión de Claude Code: heredar el env de producción no habilita gasto; hace falta ORQ_IA_PERMITIR=claude-code-explicito'
  }
  return null
}

const als = new AsyncLocalStorage()
const corridasVivas = new Map()
let presupuestoDeProceso = null

function nuevoPresupuesto({ correlacion = null, señal = null, limites = null } = {}) {
  return {
    correlacion, señal,
    t0: Date.now(),
    llamadas: 0, vision: 0, usd: 0,
    cortes: [],
    limites: { ...limitesDelEntorno(), ...(limites ?? {}) },
  }
}

/**
 * El presupuesto vigente: el de la ejecución envuelta, o —para el caller que nadie envolvió— el
 * GLOBAL del proceso, que se renueva por hora. Así un servicio largo no queda bloqueado para
 * siempre, pero un bug tampoco puede gastar sin techo: como mucho, un presupuesto por hora.
 */
export function presupuestoActual() {
  const propio = als.getStore()
  if (propio) return propio
  const hora = Math.floor(Date.now() / 3_600_000)
  if (!presupuestoDeProceso || presupuestoDeProceso.hora !== hora) {
    presupuestoDeProceso = { ...nuevoPresupuesto({ correlacion: 'proceso' }), hora }
  }
  return presupuestoDeProceso
}

/** Corre `fn` con su propio presupuesto (correlación, señal de cancelación, límites propios). */
export function conPresupuesto(opciones, fn) {
  return als.run(nuevoPresupuesto(opciones), fn)
}

/** Ata la correlación real al presupuesto una vez que se conoce (el server la crea antes de
 *  parsear el cuerpo). Sin presupuesto envuelto no hace nada. */
export function fijarCorrelacion(id) {
  const p = als.getStore()
  if (p && id) p.correlacion = String(id)
}

/** Una sola corrida paga viva por clave. La segunda equivalente NO espera: falla declarando. */
export async function conCorridaExclusiva(clave, fn) {
  const k = String(clave ?? '').trim().toLowerCase()
  if (!k) return fn()
  if (corridasVivas.has(k)) throw new CorridaDuplicada(k)
  corridasVivas.set(k, Date.now())
  try { return await fn() } finally { corridasVivas.delete(k) }
}

function cortar(p, limite, detalle) {
  p.cortes.push(limite)
  throw new FusibleCorto(limite, detalle)
}

/**
 * LA ADMISIÓN: se llama ANTES de cada llamada paga y CONSUME una unidad del presupuesto.
 * Corta —sin hacer la llamada— por bloqueo, cancelación, tiempo, cantidad, visión o USD.
 * Lo ya obtenido nunca se pierde: cortar es no hacer LA PRÓXIMA llamada.
 */
export function admitir({ vision = false, env = process.env, doble = false } = {}) {
  // `doble = true` cuando el transporte es INYECTADO (un fetch/cliente falso de test): un doble no
  // puede gastar plata, así que el bloqueo por defecto no aplica — pero el presupuesto, la
  // cancelación y los límites SÍ cuentan, que es lo que los tests de límites necesitan medir.
  const motivo = doble ? null : iaBloqueada(env)
  const p = presupuestoActual()
  if (motivo) cortar(p, 'bloqueada', motivo)
  if (p.señal?.aborted) cortar(p, 'cancelado', 'el pedido fue cancelado o el cliente se desconectó')
  if (Date.now() - p.t0 >= p.limites.maxMs) cortar(p, 'runtime', `>${p.limites.maxMs} ms`)
  if (p.llamadas >= p.limites.maxLlamadas) cortar(p, 'llamadas', `${p.llamadas}/${p.limites.maxLlamadas}`)
  if (vision && p.vision >= p.limites.maxVision) cortar(p, 'vision', `${p.vision}/${p.limites.maxVision}`)
  if (p.usd >= p.limites.maxUsd) cortar(p, 'usd', `$${p.usd.toFixed(2)}/$${p.limites.maxUsd}`)
  p.llamadas += 1
  if (vision) p.vision += 1
  return p
}

/** El chequeo SIN consumo, para la defensa en profundidad del proveedor: bloquea a un caller que
 *  importó el proveedor directo, sin contar dos veces la llamada que el cliente ya admitió. */
export function verificar({ env = process.env, doble = false } = {}) {
  const motivo = doble ? null : iaBloqueada(env)
  if (motivo) throw new FusibleCorto('bloqueada', motivo)
  const p = presupuestoActual()
  if (p.señal?.aborted) cortar(p, 'cancelado', 'el pedido fue cancelado o el cliente se desconectó')
}

/** Acredita el costo real (o estimado) de una llamada que salió. */
export function acreditarUsd(usd) {
  const n = Number(usd)
  if (!Number.isFinite(n) || n <= 0) return
  presupuestoActual().usd += n
}

/** ¿El mensaje lleva imagen o documento? Eso es una llamada de VISIÓN para el presupuesto. PURA. */
export function esVision(mensajes = []) {
  for (const m of Array.isArray(mensajes) ? mensajes : []) {
    const c = m?.content
    if (!Array.isArray(c)) continue
    if (c.some((b) => b?.type === 'image' || b?.type === 'document')) return true
  }
  return false
}

// USD estimado cuando el registro exacto no existe (p. ej. un modelo que la tabla de precios aún
// no conoce). Es una ESTIMACIÓN por familia, marcada como tal — nunca un NULL silencioso.
const PRECIOS_FAMILIA = [
  [/opus/i, [15, 75]],
  [/sonnet/i, [3, 15]],
  [/haiku/i, [1, 5]],
]

/** USD estimado por familia de modelo ($/Mtok in/out). `null` si no hay familia ni tokens. PURA. */
export function usdEstimado(modeloId, tokens = {}) {
  const tin = Number(tokens?.in ?? tokens?.tokensIn)
  const tout = Number(tokens?.out ?? tokens?.tokensOut)
  if (!Number.isFinite(tin) && !Number.isFinite(tout)) return null
  const fam = PRECIOS_FAMILIA.find(([re]) => re.test(String(modeloId ?? '')))
  if (!fam) return null
  const [pin, pout] = fam[1]
  return ((Number.isFinite(tin) ? tin : 0) * pin + (Number.isFinite(tout) ? tout : 0) * pout) / 1e6
}
