// TOPE DE GASTO (budget cap) que DEGRADA, NUNCA BLOQUEA. Regla dura del dueño: la persona
// usando la extensión NUNCA se queda sin respuesta. El tope aprieta el gasto AUTÓNOMO de
// fondo (vigilancia) y baja el modelo de los análisis caros on-demand a haiku — pero las
// respuestas determinísticas (0 API) y el chat con haiku funcionan SIEMPRE, sin importar
// el tope. Fuente del gasto de hoy: worker (orq.tasks.result.cost.usd) + chat (en memoria).
import { query } from './db.mjs'

// Tope diario en USD (configurable). Default holgado; el dueño lo ajusta con la variable.
export const CAP_DIARIO_USD = Number(process.env.ORQ_COST_DAILY_CAP_USD || 5)
const UMBRAL_AHORRO = 0.8 // a partir del 80% del tope entra en modo ahorro

/** Gasto real de HOY (día local): worker desde la DB + lo que se le sume del chat. */
export async function costoHoy(chatUsd = 0) {
  let worker = 0
  try {
    const { rows } = await query(
      `select coalesce(sum(coalesce((result->'cost'->>'usd')::numeric,0)),0) usd
         from orq.tasks where created_at >= date_trunc('day', now())`)
    worker = Number(rows[0].usd) || 0
  } catch { worker = 0 }
  return worker + (Number(chatUsd) || 0)
}

/** Estado del presupuesto: modo 'normal' | 'ahorro' | 'tope'. NUNCA bloquea; el modo solo
 *  decide si un análisis caro on-demand baja a haiku y si el autónomo de fondo se pausa. */
export async function estadoPresupuesto(chatUsd = 0, cap = CAP_DIARIO_USD) {
  const usado = await costoHoy(chatUsd)
  const ratio = cap > 0 ? usado / cap : 0
  const modo = ratio >= 1 ? 'tope' : ratio >= UMBRAL_AHORRO ? 'ahorro' : 'normal'
  return { usado: Math.round(usado * 100) / 100, cap, ratio, modo }
}

/** ¿Se debe bajar a haiku un análisis caro on-demand? (ahorro o tope). Nunca bloquea. */
export function degradarModeloOnDemand(modo) {
  return modo === 'ahorro' || modo === 'tope'
}

/** ¿Se debe pausar el trabajo AUTÓNOMO de fondo (vigilancia/especialistas)? (solo en tope). */
export function pausarAutonomo(modo) {
  return modo === 'tope'
}
